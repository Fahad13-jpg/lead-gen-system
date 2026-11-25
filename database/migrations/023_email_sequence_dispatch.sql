-- Approved email steps use the existing per-org quota and per-plan/step lease identity.
-- No activation, policy seeding, budget changes or mutation of approved plans.
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
 IF EXISTS(SELECT 1 FROM outreach_activities WHERE org_id=v.org_id AND dispatch_metadata->>'plan_id'=v.id::text AND dispatch_metadata->>'step'=n::text
 AND NOT (dispatch_metadata->>'state'='reserved' AND coalesce(dispatch_metadata->>'lease','')<>'' AND dispatch_metadata->>'lease'=coalesce(p->>'lease',''))) THEN
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

CREATE OR REPLACE FUNCTION outreach_email_step_check(p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE base jsonb; followup jsonb;
BEGIN
 IF coalesce(p->>'step','') !~ '^([1-9]|10)$' THEN RETURN '{"ready":false,"execution_authorized":false,"reason":"invalid_step"}';END IF;
 base:=outreach_dispatch_check(p||'{"step":1}');
 IF base->>'ready' IS DISTINCT FROM 'true' THEN RETURN base;END IF;
 IF EXISTS(SELECT 1 FROM outreach_activities WHERE org_id=(base->>'org_id')::integer AND lead_id=(base->>'lead_id')::integer AND dispatch_metadata->>'stop_reason' IN ('wrong_person','meeting_booked','opt_out')) THEN
 RETURN '{"ready":false,"execution_authorized":false,"reason":"stop_event_recorded"}';END IF;
 IF p->>'step'<>'1' THEN
 followup:=outreach_followup_check(p);
 IF followup->>'ready' IS DISTINCT FROM 'true' THEN RETURN followup;END IF;
 END IF;
 RETURN base||jsonb_build_object('step',(p->>'step')::integer);
END $$;

CREATE OR REPLACE FUNCTION outreach_email_step_reserve(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE checked jsonb; event outreach_activities%ROWTYPE; l text; pid bigint; o integer;
BEGIN
 checked:=outreach_email_step_check(p);
 IF checked->>'ready' IS DISTINCT FROM 'true' THEN RETURN checked;END IF;
 o:=(checked->>'org_id')::integer;pid:=(checked->>'plan_id')::bigint;
 -- Same plan lock as approval/revocation. This reserves identity, not authority to send.
 PERFORM 1 FROM strategy_plans WHERE org_id=o AND id=pid FOR UPDATE;
 checked:=outreach_email_step_check(p);
 IF checked->>'ready' IS DISTINCT FROM 'true' THEN RETURN checked;END IF;
 l:=md5(random()::text||clock_timestamp()::text||pid::text);
 INSERT INTO outreach_activities(org_id,lead_id,channel,status,dispatch_metadata)
 VALUES(o,(checked->>'lead_id')::integer,'email','reserved',jsonb_build_object('plan_id',pid::text,'step',p->>'step','state','reserved',
 'content_hash',checked->>'content_hash','lease',l,'lease_until',now()+interval '5 minutes','attempts',0))
 ON CONFLICT DO NOTHING RETURNING * INTO event;
 IF NOT FOUND THEN RETURN '{"ready":false,"reason":"dispatch_already_reserved_or_recorded","execution_authorized":false}';END IF;
 RETURN checked||jsonb_build_object('activity_id',event.id,'lease',l,'lease_until',event.dispatch_metadata->'lease_until','reserved',true);
END $$;

CREATE OR REPLACE FUNCTION outreach_email_step_recheck(p jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE event outreach_activities%ROWTYPE; checked jsonb;
BEGIN
 checked:=outreach_email_step_check(p);
 IF checked->>'ready' IS DISTINCT FROM 'true' THEN RETURN checked;END IF;
 SELECT * INTO event FROM outreach_activities WHERE org_id=(checked->>'org_id')::integer
 AND dispatch_metadata->>'plan_id'=checked->>'plan_id' AND dispatch_metadata->>'step'=p->>'step'
 AND dispatch_metadata->>'lease'=p->>'lease';
 IF NOT FOUND OR event.dispatch_metadata->>'state' IS DISTINCT FROM 'reserved'
 OR event.dispatch_metadata->>'content_hash' IS DISTINCT FROM checked->>'content_hash'
 OR coalesce((event.dispatch_metadata->>'lease_until')::timestamptz,'-infinity'::timestamptz)<=now() THEN
  RETURN '{"ready":false,"reason":"dispatch_requires_reconciliation","execution_authorized":false}';END IF;
 RETURN checked||jsonb_build_object('activity_id',event.id,'reserved',true,'reason','reservation_current_transport_still_disabled');
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
 RETURN '{"ready":false,"reason":"dispatch_requires_reconciliation","execution_authorized":false}';
END $$;

CREATE OR REPLACE FUNCTION outreach_email_step_begin(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE ck jsonb; v strategy_plans%ROWTYPE; a outreach_activities%ROWTYPE;
 cfg jsonb; policy jsonb; message jsonb; cap integer; used bigint; day text;
BEGIN
 ck:=outreach_email_step_recheck(p);
 IF ck->>'ready' IS DISTINCT FROM 'true' THEN RETURN ck; END IF;
 -- Every email begin for an organization takes this same lock, across campaigns.
 PERFORM 1 FROM organizations WHERE id=(ck->>'org_id')::integer FOR UPDATE;
 SELECT * INTO v FROM strategy_plans WHERE org_id=(ck->>'org_id')::integer AND id=(ck->>'plan_id')::bigint FOR UPDATE;
 ck:=outreach_email_step_recheck(p);
 IF ck->>'ready' IS DISTINCT FROM 'true' THEN RETURN ck; END IF;
 -- No caller-supplied switch grants authority. Existing offline plans remain blocked.
 IF v.body->>'execution_authorized' IS DISTINCT FROM 'true' THEN
  RETURN '{"ready":false,"execution_authorized":false,"reason":"plan_transport_not_authorized"}'; END IF;
 IF p->>'step'='1' THEN message:=v.body->'artifacts'->'email_draft';
 ELSE SELECT item INTO message FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v.body->'artifacts'->'followup_drafts')='array' THEN v.body->'artifacts'->'followup_drafts' ELSE '[]'::jsonb END) item WHERE item->>'step'=p->>'step' LIMIT 1; END IF;
 IF coalesce(message->>'subject','')=''
 OR coalesce(message->>'body','')=''
 OR message->>'subject' IS DISTINCT FROM p->>'subject'
 OR message->>'body' IS DISTINCT FROM p->>'body'
 OR NOT EXISTS(SELECT 1 FROM cleaned_leads WHERE org_id=v.org_id AND id=v.lead_id AND email=p->>'to_email') THEN
  RETURN '{"ready":false,"execution_authorized":false,"reason":"approved_message_or_recipient_mismatch"}'; END IF;
 SELECT cv.config INTO cfg FROM strategy_campaigns c JOIN strategy_campaign_versions cv
 ON cv.org_id=c.org_id AND cv.campaign_id=c.id AND cv.version=c.version
 WHERE c.org_id=v.org_id AND c.id=v.campaign_id AND c.version=v.campaign_version;
 policy:=cfg->'email_dispatch';
 IF policy->>'enabled' IS DISTINCT FROM 'true'
 OR coalesce(policy->>'credential_ref','')='' OR policy->>'credential_ref' IS DISTINCT FROM p->>'credential_ref'
 OR coalesce(policy->>'daily_limit','') !~ '^[1-9][0-9]{0,3}$'
 OR policy->>'sender_email' IS DISTINCT FROM p->>'sender_email'
 OR coalesce(policy->>'sender_email','') !~ '^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+\.[^[:space:]@,;<>]+$' THEN
  RETURN '{"ready":false,"execution_authorized":false,"reason":"sender_policy_missing_or_mismatched"}'; END IF;
 -- Require the approved plan's timing to match its current campaign version.
 IF v.body->'artifacts'->'schedule'->>'timezone' IS DISTINCT FROM cfg->>'timezone'
 OR v.body->'artifacts'->'schedule'->'sending_window' IS DISTINCT FROM cfg->'sending_window'
 OR v.body->'artifacts'->'schedule'->'sequence' IS DISTINCT FROM cfg->'sequence'
 OR cfg->'sequence'->((p->>'step')::integer-1)->>'channel' IS DISTINCT FROM 'email'
 OR (p->>'step'='1' AND cfg->'sequence'->0->>'delay_days' IS DISTINCT FROM '0') THEN
 RETURN '{"ready":false,"execution_authorized":false,"reason":"approved_schedule_required"}'; END IF;
 ck:=outreach_email_window(cfg,clock_timestamp());
 IF ck->>'allowed' IS DISTINCT FROM 'true' THEN
 RETURN ck||jsonb_build_object('ready',false,'execution_authorized',false); END IF;
 ck:=outreach_email_step_recheck(p);
 IF ck->>'ready' IS DISTINCT FROM 'true' THEN RETURN ck;END IF;
 -- Conservative org cap: smallest enabled current campaign limit, not a new allowance per campaign.
 SELECT min(CASE WHEN coalesce(cv.config->'email_dispatch'->>'daily_limit','') ~ '^[1-9][0-9]{0,3}$'
 THEN (cv.config->'email_dispatch'->>'daily_limit')::integer ELSE NULL END) INTO cap
 FROM strategy_campaigns c JOIN strategy_campaign_versions cv ON cv.org_id=c.org_id AND cv.campaign_id=c.id AND cv.version=c.version
 WHERE c.org_id=v.org_id AND cv.config->'email_dispatch'->>'enabled'='true'
 AND CASE WHEN coalesce(cv.config->'email_dispatch'->>'daily_limit','') ~ '^[1-9][0-9]{0,3}$' THEN true ELSE false END;
 IF cap IS NULL THEN RETURN '{"ready":false,"execution_authorized":false,"reason":"quota_not_configured"}'; END IF;
 day:=to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD');
 SELECT count(*) INTO used FROM outreach_activities WHERE org_id=v.org_id AND channel='email'
 AND (dispatch_metadata->>'quota_day'=day OR (sent_at IS NOT NULL AND sent_at::date=(clock_timestamp() AT TIME ZONE 'UTC')::date));
 IF used>=cap THEN RETURN jsonb_build_object('ready',false,'execution_authorized',false,'reason','daily_quota_reached','used',used,'limit',cap); END IF;
 SELECT * INTO a FROM outreach_activities WHERE id=(ck->>'activity_id')::integer AND org_id=v.org_id FOR UPDATE;
 IF a.dispatch_metadata->>'state' IS DISTINCT FROM 'reserved'
 OR (a.dispatch_metadata->>'lease_until')::timestamptz<=clock_timestamp() THEN
  RETURN '{"ready":false,"execution_authorized":false,"reason":"dispatch_requires_reconciliation"}'; END IF;
 UPDATE outreach_activities SET status='attempting',dispatch_metadata=dispatch_metadata||jsonb_build_object(
 'state','attempting','attempts',1,'quota_day',day,'started_at',clock_timestamp(),
 'credential_ref',policy->>'credential_ref','sender_email',policy->>'sender_email') WHERE id=a.id AND org_id=v.org_id;
 RETURN ck||jsonb_build_object('execution_authorized',true,'reason','one_attempt_committed','quota_day',day);
END $$;

CREATE OR REPLACE FUNCTION outreach_email_step_finish(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE a outreach_activities%ROWTYPE; state text; ext text;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR coalesce(p->>'org_id','') !~ '^[1-9][0-9]{0,9}$'
 OR coalesce(p->>'plan_id','') !~ '^[1-9][0-9]{0,18}$' OR coalesce(p->>'step','') !~ '^([1-9]|10)$'
 OR coalesce(p->>'lease','') !~ '^[a-f0-9]{32}$' OR coalesce(p->>'content_hash','') !~ '^[a-f0-9]{32}$' THEN
 RETURN '{"saved":false,"reason":"invalid_identity","retry_allowed":false}'; END IF;
 SELECT * INTO a FROM outreach_activities WHERE org_id=(p->>'org_id')::integer
 AND dispatch_metadata->>'plan_id'=p->>'plan_id' AND dispatch_metadata->>'step'=p->>'step'
 AND dispatch_metadata->>'lease'=p->>'lease' AND dispatch_metadata->>'content_hash'=p->>'content_hash' FOR UPDATE;
 IF NOT FOUND THEN RETURN '{"saved":false,"reason":"identity_not_found","retry_allowed":false}'; END IF;
 state:='ambiguous'; ext:=NULL;
 IF p->>'outcome'='provider_accepted' AND coalesce(p->>'external_id','') ~ '^[a-fA-F0-9]{8,64}$' THEN
 state:='provider_accepted'; ext:=p->>'external_id'; END IF;
 IF a.dispatch_metadata->>'state'=state AND a.external_id IS NOT DISTINCT FROM ext THEN
 RETURN jsonb_build_object('saved',true,'idempotent',true,'state',state,'retry_allowed',false); END IF;
 IF a.dispatch_metadata->>'state' IS DISTINCT FROM 'attempting' THEN
 RETURN '{"saved":false,"reason":"reconciliation_required","retry_allowed":false}'; END IF;
 -- Record outcomes even after lease expiry/revocation: this is a historical receipt,
 -- not fresh permission. Never reset quota or recycle ambiguous attempts.
 UPDATE outreach_activities SET status=state,external_id=ext,
 sent_at=CASE WHEN state='provider_accepted' THEN clock_timestamp() AT TIME ZONE 'UTC' ELSE NULL END,
 dispatch_metadata=dispatch_metadata||jsonb_build_object('state',state,'finished_at',clock_timestamp(),'delivered',false)
 WHERE id=a.id AND org_id=a.org_id;
 RETURN jsonb_build_object('saved',true,'state',state,'delivered',false,'retry_allowed',false);
EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN
 RETURN '{"saved":false,"reason":"invalid_identity","retry_allowed":false}';
END $$;
REVOKE ALL ON FUNCTION outreach_email_step_check(jsonb),outreach_email_step_reserve(jsonb),outreach_email_step_recheck(jsonb),outreach_email_step_begin(jsonb),outreach_email_step_finish(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_email_step_check(jsonb),outreach_email_step_reserve(jsonb),outreach_email_step_recheck(jsonb),outreach_email_step_begin(jsonb),outreach_email_step_finish(jsonb) TO n8n_user;
COMMIT;
