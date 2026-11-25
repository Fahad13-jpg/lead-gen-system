-- First-message email handoff only. Does not authorize transport, consume provider budgets,
-- remove plan blockers, mutate approved plan bodies or execute follow-up intent text.
BEGIN;
CREATE OR REPLACE FUNCTION outreach_dispatch_check(p jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE v strategy_plans%ROWTYPE; a strategy_approvals%ROWTYPE; x jsonb; o integer; pid bigint;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR coalesce(p->>'org_id','') !~ '^[1-9][0-9]{0,9}$'
 OR coalesce(p->>'plan_id','') !~ '^[1-9][0-9]{0,18}$' OR p->>'step' IS DISTINCT FROM '1' THEN
  RETURN '{"ready":false,"reason":"invalid_request_or_unreviewed_followup","execution_authorized":false}'; END IF;
 o:=(p->>'org_id')::integer;pid:=(p->>'plan_id')::bigint;
 SELECT * INTO v FROM strategy_plans WHERE org_id=o AND id=pid;
 IF NOT FOUND THEN RETURN '{"ready":false,"reason":"not_found","execution_authorized":false}';END IF;
 IF p->>'content_hash' IS DISTINCT FROM v.content_hash OR md5(v.body::text) IS DISTINCT FROM v.content_hash THEN
  RETURN '{"ready":false,"reason":"content_changed","execution_authorized":false}';END IF;
 IF v.body->>'version' IS DISTINCT FROM 'strategy_v2' OR coalesce(v.body->>'state','') NOT IN ('ai_completed','template_completed','template_fallback')
 OR (CASE WHEN jsonb_typeof(v.body->'blocking_reasons')='array' THEN jsonb_array_length(v.body->'blocking_reasons')<>0 ELSE true END)
 OR (CASE WHEN jsonb_typeof(v.body->'validation_errors')='array' THEN jsonb_array_length(v.body->'validation_errors')<>0 ELSE true END) THEN
  RETURN '{"ready":false,"reason":"plan_blocked","execution_authorized":false}';END IF;
 SELECT * INTO a FROM strategy_approvals WHERE org_id=o AND plan_id=pid ORDER BY id DESC LIMIT 1;
 IF NOT FOUND OR a.action<>'approve' OR a.content_hash IS DISTINCT FROM v.content_hash THEN
  RETURN '{"ready":false,"reason":"approval_required","execution_authorized":false}';END IF;
 x:=strategy_context(o,v.campaign_id,v.lead_id);
 IF x IS NULL OR v.fingerprint IS DISTINCT FROM x->>'fingerprint' OR v.expires_at<=now() THEN
  RETURN '{"ready":false,"reason":"stale_plan","execution_authorized":false}';END IF;
 IF x->>'suppressed' IS DISTINCT FROM 'false' OR x->>'replied' IS DISTINCT FROM 'false'
 OR EXISTS(SELECT 1 FROM outreach_activities WHERE org_id=o AND lead_id=v.lead_id AND (replied_at IS NOT NULL OR bounced_at IS NOT NULL)) THEN
  RETURN '{"ready":false,"reason":"suppressed_replied_or_bounced","execution_authorized":false}';END IF;
 IF v.body->'strategy'->'step1'->>'channel' IS DISTINCT FROM 'email' THEN
  RETURN '{"ready":false,"reason":"channel_not_integrated","execution_authorized":false}';END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(x->'report'->'trust'->'fields'->'emails')='array'
 THEN x->'report'->'trust'->'fields'->'emails' ELSE '[]'::jsonb END) e
 WHERE e->>'value'=x->'lead'->>'email' AND e->>'status'='provider_verified') THEN
  RETURN '{"ready":false,"reason":"email_not_freshly_verified","execution_authorized":false}';END IF;
 RETURN jsonb_build_object('ready',true,'org_id',o,'plan_id',pid,'lead_id',v.lead_id,'content_hash',v.content_hash,'channel','email',
 'execution_authorized',false,'reason','eligible_for_reservation_only');
EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN
 RETURN '{"ready":false,"reason":"invalid_request_or_unreviewed_followup","execution_authorized":false}';
END $$;

CREATE OR REPLACE FUNCTION outreach_dispatch_reserve(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE checked jsonb; event outreach_activities%ROWTYPE; l text; pid bigint; o integer;
BEGIN
 checked:=outreach_dispatch_check(p);
 IF checked->>'ready' IS DISTINCT FROM 'true' THEN RETURN checked;END IF;
 o:=(checked->>'org_id')::integer;pid:=(checked->>'plan_id')::bigint;
 -- Same plan lock as approval/revocation. This reserves identity, not authority to send.
 PERFORM 1 FROM strategy_plans WHERE org_id=o AND id=pid FOR UPDATE;
 checked:=outreach_dispatch_check(p);
 IF checked->>'ready' IS DISTINCT FROM 'true' THEN RETURN checked;END IF;
 l:=md5(random()::text||clock_timestamp()::text||pid::text);
 INSERT INTO outreach_activities(org_id,lead_id,channel,status,dispatch_metadata)
 VALUES(o,(checked->>'lead_id')::integer,'email','reserved',jsonb_build_object('plan_id',pid::text,'step','1','state','reserved',
 'content_hash',checked->>'content_hash','lease',l,'lease_until',now()+interval '5 minutes','attempts',0))
 ON CONFLICT DO NOTHING RETURNING * INTO event;
 IF NOT FOUND THEN RETURN '{"ready":false,"reason":"dispatch_already_reserved_or_recorded","execution_authorized":false}';END IF;
 RETURN checked||jsonb_build_object('activity_id',event.id,'lease',l,'lease_until',event.dispatch_metadata->'lease_until','reserved',true);
END $$;

-- Read-only check for a later transport adapter. Ambiguous/expired records never become resend permission.
CREATE OR REPLACE FUNCTION outreach_dispatch_recheck(p jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE event outreach_activities%ROWTYPE; checked jsonb;
BEGIN
 checked:=outreach_dispatch_check(p);
 IF checked->>'ready' IS DISTINCT FROM 'true' THEN RETURN checked;END IF;
 SELECT * INTO event FROM outreach_activities WHERE org_id=(checked->>'org_id')::integer
 AND dispatch_metadata->>'plan_id'=checked->>'plan_id' AND dispatch_metadata->>'step'='1'
 AND dispatch_metadata->>'lease'=p->>'lease';
 IF NOT FOUND OR event.dispatch_metadata->>'state' IS DISTINCT FROM 'reserved'
 OR event.dispatch_metadata->>'content_hash' IS DISTINCT FROM checked->>'content_hash'
 OR coalesce((event.dispatch_metadata->>'lease_until')::timestamptz,'-infinity'::timestamptz)<=now() THEN
  RETURN '{"ready":false,"reason":"dispatch_requires_reconciliation","execution_authorized":false}';END IF;
 RETURN checked||jsonb_build_object('activity_id',event.id,'reserved',true,'reason','reservation_current_transport_still_disabled');
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
 RETURN '{"ready":false,"reason":"dispatch_requires_reconciliation","execution_authorized":false}';
END $$;
REVOKE ALL ON FUNCTION outreach_dispatch_check(jsonb),outreach_dispatch_reserve(jsonb),outreach_dispatch_recheck(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_dispatch_check(jsonb),outreach_dispatch_reserve(jsonb),outreach_dispatch_recheck(jsonb) TO n8n_user;
COMMIT;
