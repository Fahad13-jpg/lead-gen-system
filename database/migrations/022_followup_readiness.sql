-- Read-only follow-up evaluation. Does not reserve, authorize or send a message.
BEGIN;
CREATE OR REPLACE FUNCTION outreach_followup_check(p jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE checked jsonb;v strategy_plans%ROWTYPE;prev outreach_activities%ROWTYPE;d jsonb;seq jsonb;cfg jsonb;n integer;due timestamptz;
BEGIN
 IF coalesce(p->>'step','') !~ '^([2-9]|10)$' THEN RETURN '{"ready":false,"execution_authorized":false,"reason":"invalid_step"}';END IF;
 n:=(p->>'step')::integer;
 -- Reuse existing org, approval hash, expiry, suppression, reply, bounce and email verification gates.
 checked:=outreach_dispatch_check(p||'{"step":1}');
 IF checked->>'ready' IS DISTINCT FROM 'true' THEN RETURN checked;END IF;
 SELECT * INTO v FROM strategy_plans WHERE org_id=(checked->>'org_id')::integer AND id=(checked->>'plan_id')::bigint;
 IF v.body->'qualification'->>'fit'='weak' THEN RETURN '{"ready":false,"execution_authorized":false,"reason":"weak_fit_human_review"}';END IF;
 SELECT config INTO cfg FROM strategy_campaign_versions WHERE org_id=v.org_id AND campaign_id=v.campaign_id AND version=v.campaign_version;
 SELECT item INTO d FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v.body->'artifacts'->'followup_drafts')='array' THEN v.body->'artifacts'->'followup_drafts' ELSE '[]'::jsonb END) item WHERE item->>'step'=n::text LIMIT 1;
 seq:=cfg->'sequence'->(n-1);
 IF d IS NULL OR d->>'channel' IS DISTINCT FROM 'email' OR seq->>'channel' IS DISTINCT FROM 'email'
 OR d->>'status' IS DISTINCT FROM 'requires_plan_approval_and_execution_checks'
 OR nullif(d->>'body','') IS NULL OR nullif(d->>'subject','') IS NULL
 OR coalesce(d->>'delay_days','') !~ '^([0-9]|[1-5][0-9]|60)$'
 OR d->>'delay_days' IS DISTINCT FROM seq->>'delay_days'
 OR v.body->'artifacts'->'schedule'->'sequence' IS DISTINCT FROM cfg->'sequence' THEN
 RETURN '{"ready":false,"execution_authorized":false,"reason":"approved_followup_message_required"}';END IF;
 IF EXISTS(SELECT 1 FROM outreach_activities WHERE org_id=v.org_id AND lead_id=v.lead_id
 AND dispatch_metadata->>'stop_reason' IN ('wrong_person','meeting_booked','opt_out')) THEN
 RETURN '{"ready":false,"execution_authorized":false,"reason":"stop_event_recorded"}';END IF;
 IF EXISTS(SELECT 1 FROM outreach_activities WHERE org_id=v.org_id AND dispatch_metadata->>'plan_id'=v.id::text AND dispatch_metadata->>'step'=n::text) THEN
 RETURN '{"ready":false,"execution_authorized":false,"reason":"step_already_recorded"}';END IF;
 SELECT * INTO prev FROM outreach_activities WHERE org_id=v.org_id AND lead_id=v.lead_id
 AND dispatch_metadata->>'plan_id'=v.id::text AND dispatch_metadata->>'step'=(n-1)::text
 AND dispatch_metadata->>'content_hash'=v.content_hash;
 IF NOT FOUND OR prev.dispatch_metadata->>'state' IS DISTINCT FROM 'provider_accepted' OR prev.sent_at IS NULL
 OR prev.sent_at AT TIME ZONE 'UTC'>now() THEN
 RETURN '{"ready":false,"execution_authorized":false,"reason":"previous_confirmed_send_required"}';END IF;
 due:=(prev.sent_at AT TIME ZONE 'UTC')+(d->>'delay_days')::integer*interval '24 hours';
 IF due>now() THEN RETURN jsonb_build_object('ready',false,'execution_authorized',false,'reason','delay_not_elapsed','due_at',due);END IF;
 checked:=outreach_email_window(cfg,now());
 IF checked->>'allowed' IS DISTINCT FROM 'true' THEN RETURN checked||'{"ready":false,"execution_authorized":false}';END IF;
 RETURN jsonb_build_object('ready',true,'execution_authorized',false,'reason','due_for_dispatch_recheck','org_id',v.org_id,'plan_id',v.id,'step',n,'due_at',due);
END $$;
REVOKE ALL ON FUNCTION outreach_followup_check(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_followup_check(jsonb) TO n8n_user;
COMMIT;
