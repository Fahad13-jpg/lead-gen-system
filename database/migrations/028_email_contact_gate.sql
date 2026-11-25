-- Local candidate. No sending activation or live application.
BEGIN;
CREATE OR REPLACE FUNCTION outreach_email_contact_gate(p_org integer,p_lead integer,recipient text,sender text)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE a record; checked timestamptz;
BEGIN
 IF p_org IS NULL OR p_lead IS NULL OR nullif(trim(recipient),'') IS NULL OR nullif(trim(sender),'') IS NULL THEN
 RETURN '{"allowed":false,"reason":"contact_identity_missing"}'; END IF;
 FOR a IN SELECT oa.*,cl.email AS current_email FROM outreach_activities oa
 LEFT JOIN cleaned_leads cl ON cl.id=oa.lead_id AND cl.org_id=oa.org_id
 WHERE oa.org_id=p_org AND oa.channel='email' AND (
 oa.lead_id=p_lead OR lower(trim(coalesce(nullif(oa.dispatch_metadata->>'recipient_email',''),cl.email)))=lower(trim(recipient))) LOOP
  -- Audit events retain suppression even if a later event changes stop_reason.
  IF a.bounced_at IS NOT NULL OR a.dispatch_metadata->>'stop_reason' IN ('opt_out','bounce')
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(a.dispatch_metadata->'stop_events')='array'
     THEN a.dispatch_metadata->'stop_events' ELSE '[]'::jsonb END) e WHERE e->>'kind' IN ('opt_out','bounce')) THEN
   RETURN '{"allowed":false,"reason":"email_address_suppressed"}'; END IF;
  IF a.replied_at IS NOT NULL THEN RETURN '{"allowed":false,"reason":"reply_requires_review"}'; END IF;
  IF a.dispatch_metadata->>'state'='provider_accepted' THEN
   -- A prior contact through a different mailbox must still be reviewed; do not
   -- skip its history when the campaign changes sender.
   IF a.dispatch_metadata->'reply_scan'->>'review_required'='true' THEN
    RETURN '{"allowed":false,"reason":"conversation_review_required"}'; END IF;
   checked:=(a.dispatch_metadata->'reply_scan'->>'checked_at')::timestamptz;
   IF checked IS NULL OR NOT isfinite(checked) OR checked>statement_timestamp()
   OR checked<statement_timestamp()-interval '5 minutes' THEN
    RETURN '{"allowed":false,"reason":"reply_check_stale"}'; END IF;
  END IF;
 END LOOP;
 RETURN '{"allowed":true}';
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
 RETURN '{"allowed":false,"reason":"reply_check_stale"}';
END $$;

CREATE OR REPLACE FUNCTION outreach_email_defer(p jsonb, reason text, due timestamptz) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a outreach_activities%ROWTYPE;
BEGIN
 IF coalesce(p->>'org_id','') !~ '^[1-9][0-9]{0,9}$' OR coalesce(p->>'plan_id','') !~ '^[1-9][0-9]{0,18}$'
 OR coalesce(p->>'step','') !~ '^([1-9]|10)$' OR coalesce(p->>'lease','') !~ '^[a-f0-9]{32}$'
 OR reason IS NULL OR reason NOT IN ('daily_quota_reached','mailbox_rolling_limit_reached','mailbox_spacing_required','outside_sending_window','reply_check_stale')
 OR due IS NULL OR NOT isfinite(due) THEN RETURN '{"ready":false,"execution_authorized":false,"reason":"invalid_deferral"}'; END IF;
 SELECT * INTO a FROM outreach_activities WHERE org_id=(p->>'org_id')::integer
 AND dispatch_metadata->>'plan_id'=p->>'plan_id' AND dispatch_metadata->>'step'=p->>'step'
 AND dispatch_metadata->>'lease'=p->>'lease' FOR UPDATE;
 IF NOT FOUND OR a.dispatch_metadata->>'content_hash' IS DISTINCT FROM p->>'content_hash'
 OR a.dispatch_metadata->>'state' IS DISTINCT FROM 'reserved' OR a.dispatch_metadata->>'attempts' IS DISTINCT FROM '0'
 OR a.dispatch_metadata ? 'started_at' THEN
 RETURN '{"ready":false,"execution_authorized":false,"reason":"attempt_not_safe_to_defer"}'; END IF;
 -- Never recycle an attempting/ambiguous/accepted send. Revoke the old lease.
 due:=greatest(due,clock_timestamp()+interval '5 minutes');
 UPDATE outreach_activities SET dispatch_metadata=(dispatch_metadata-'lease'-'lease_until')||jsonb_build_object(
 'deferred_until',due,'defer_reason',reason,'last_deferred_at',clock_timestamp()) WHERE id=a.id AND org_id=a.org_id;
 RETURN jsonb_build_object('ready',false,'execution_authorized',false,'queued',true,'reason',reason,'next_check_at',due);
EXCEPTION WHEN numeric_value_out_of_range THEN RETURN '{"ready":false,"execution_authorized":false,"reason":"invalid_deferral"}';
END $$;
CREATE OR REPLACE FUNCTION outreach_email_step_begin(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE ck jsonb; v strategy_plans%ROWTYPE; a outreach_activities%ROWTYPE;
 contact_gate jsonb; mailbox_guard jsonb; cfg jsonb; policy jsonb; message jsonb; cap integer; used bigint; day text;
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
 RETURN outreach_email_defer(p,'outside_sending_window',clock_timestamp()+interval '5 minutes'); END IF;
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
 IF used>=cap THEN RETURN outreach_email_defer(p,'daily_quota_reached',((clock_timestamp() AT TIME ZONE 'UTC')::date+1)::timestamp AT TIME ZONE 'UTC'); END IF;
 SELECT * INTO a FROM outreach_activities WHERE id=(ck->>'activity_id')::integer AND org_id=v.org_id FOR UPDATE;
 IF a.dispatch_metadata->>'state' IS DISTINCT FROM 'reserved'
 OR (a.dispatch_metadata->>'lease_until')::timestamptz<=clock_timestamp() THEN
  RETURN '{"ready":false,"execution_authorized":false,"reason":"dispatch_requires_reconciliation"}'; END IF;
 mailbox_guard:=outreach_mailbox_capacity(v.org_id,policy);
 IF mailbox_guard->>'allowed' IS DISTINCT FROM 'true' THEN
 IF mailbox_guard->>'reason' IN ('mailbox_rolling_limit_reached','mailbox_spacing_required') THEN
 RETURN outreach_email_defer(p,mailbox_guard->>'reason',(mailbox_guard->>'next_eligible_at')::timestamptz); END IF;
 RETURN mailbox_guard||'{"ready":false,"execution_authorized":false}'::jsonb; END IF;
 contact_gate:=outreach_email_contact_gate(v.org_id,v.lead_id,p->>'to_email',policy->>'sender_email');
 IF contact_gate->>'allowed' IS DISTINCT FROM 'true' THEN
 IF contact_gate->>'reason'='reply_check_stale' THEN RETURN outreach_email_defer(p,'reply_check_stale',clock_timestamp()+interval '5 minutes'); END IF;
 RETURN contact_gate||'{"ready":false,"execution_authorized":false}'::jsonb; END IF;
 UPDATE outreach_activities SET status='attempting',dispatch_metadata=dispatch_metadata||jsonb_build_object(
 'state','attempting','attempts',1,'quota_day',day,'started_at',clock_timestamp(),
 'recipient_email',p->>'to_email','credential_ref',policy->>'credential_ref','sender_email',policy->>'sender_email') WHERE id=a.id AND org_id=v.org_id;
 RETURN ck||jsonb_build_object('execution_authorized',true,'reason','one_attempt_committed','quota_day',day);
END $$;
REVOKE ALL ON FUNCTION outreach_email_contact_gate(integer,integer,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_email_contact_gate(integer,integer,text,text) TO n8n_user;
COMMIT;
