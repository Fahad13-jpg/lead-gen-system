-- SMTP protocol persistence. Transport remains disabled until its reviewed release.
BEGIN;
CREATE OR REPLACE FUNCTION outreach_smtp_finish(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a outreach_activities%ROWTYPE; state text:='ambiguous'; msg text; refs jsonb;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR coalesce(p->>'org_id','') !~ '^[1-9][0-9]{0,9}$'
 OR coalesce(p->>'plan_id','') !~ '^[1-9][0-9]{0,18}$' OR coalesce(p->>'step','') !~ '^([1-9]|10)$'
 OR coalesce(p->>'lease','') !~ '^[a-f0-9]{32}$' OR coalesce(p->>'content_hash','') !~ '^[a-f0-9]{32}$' THEN RETURN '{"saved":false,"reason":"invalid_identity","retry_allowed":false}';END IF;
 SELECT * INTO a FROM outreach_activities WHERE org_id=(p->>'org_id')::integer AND dispatch_metadata->>'plan_id'=p->>'plan_id'
 AND dispatch_metadata->>'step'=p->>'step' AND dispatch_metadata->>'lease'=p->>'lease' AND dispatch_metadata->>'content_hash'=p->>'content_hash' FOR UPDATE;
 IF NOT FOUND OR a.dispatch_metadata->>'transport' IS DISTINCT FROM 'smtp' THEN RETURN '{"saved":false,"reason":"smtp_attempt_not_found","retry_allowed":false}';END IF;
 IF p->>'outcome'='provider_accepted' AND p->>'message_id'=a.dispatch_metadata->>'smtp_message_id' THEN state:='provider_accepted';msg:=p->>'message_id';END IF;
 IF a.dispatch_metadata->>'state'=state AND a.external_id IS NOT DISTINCT FROM msg THEN RETURN jsonb_build_object('saved',true,'idempotent',true,'state',state,'retry_allowed',false);END IF;
 IF a.dispatch_metadata->>'state' IS DISTINCT FROM 'attempting' THEN RETURN '{"saved":false,"reason":"reconciliation_required","retry_allowed":false}';END IF;
 UPDATE outreach_activities SET status=state,external_id=msg,sent_at=CASE WHEN state='provider_accepted' THEN clock_timestamp() AT TIME ZONE 'UTC' ELSE NULL END,
 dispatch_metadata=dispatch_metadata||jsonb_build_object('state',state,'finished_at',clock_timestamp(),'delivered',false) WHERE org_id=a.org_id AND id=a.id;
 RETURN jsonb_build_object('saved',true,'state',state,'delivered',false,'retry_allowed',false);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN '{"saved":false,"reason":"invalid_identity","retry_allowed":false}';
END $$;

CREATE OR REPLACE FUNCTION outreach_imap_scan_finish(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a outreach_activities%ROWTYPE; event jsonb; result jsonb; source jsonb; previous jsonb;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR coalesce(p->>'org_id','') !~ '^[1-9][0-9]{0,9}$' OR coalesce(p->>'activity_id','') !~ '^[1-9][0-9]{0,9}$'
 OR jsonb_typeof(p->'events') IS DISTINCT FROM 'array' OR jsonb_typeof(p->'reviews') IS DISTINCT FROM 'array' THEN RETURN '{"saved":false,"reason":"invalid_scan"}';END IF;
 IF jsonb_array_length(p->'events')>100 OR jsonb_array_length(p->'reviews')>100 THEN RETURN '{"saved":false,"reason":"scan_too_large"}';END IF;
 IF p->'checkpoint'->>'mailbox' IS DISTINCT FROM 'INBOX' OR coalesce(p->'checkpoint'->>'uid_validity','') !~ '^[1-9][0-9]{0,9}$'
 OR coalesce(p->'checkpoint'->>'uid_next','') !~ '^[1-9][0-9]{0,9}$' THEN RETURN '{"saved":false,"reason":"invalid_checkpoint"}';END IF;
 SELECT * INTO a FROM outreach_activities WHERE org_id=(p->>'org_id')::integer AND id=(p->>'activity_id')::integer FOR UPDATE;
 IF NOT FOUND OR a.dispatch_metadata->>'transport' IS DISTINCT FROM 'smtp' OR a.dispatch_metadata->>'state' IS DISTINCT FROM 'provider_accepted'
 OR a.external_id IS DISTINCT FROM p->>'message_id' OR a.dispatch_metadata->>'connection_id' IS DISTINCT FROM p->>'connection_id'
 OR a.dispatch_metadata->>'inbox_credential_ref' IS DISTINCT FROM p->>'inbox_credential_ref' OR a.dispatch_metadata->>'credential_ref' IS DISTINCT FROM p->>'credential_ref'
 OR a.dispatch_metadata->>'sender_email' IS DISTINCT FROM p->>'sender_email' THEN RETURN '{"saved":false,"reason":"sender_or_activity_mismatch"}';END IF;
 previous:=nullif(a.dispatch_metadata->'imap_checkpoint','null'::jsonb);
 IF previous IS DISTINCT FROM nullif(p->'expected_checkpoint','null'::jsonb) THEN RETURN '{"saved":false,"reason":"stale_scan"}';END IF;
 IF previous IS NOT NULL AND previous->>'uid_validity' IS DISTINCT FROM p->'checkpoint'->>'uid_validity' THEN RETURN '{"saved":false,"reason":"uid_validity_changed"}';END IF;
 IF previous IS NOT NULL AND (previous->>'uid_next')::bigint>(p->'checkpoint'->>'uid_next')::bigint THEN RETURN '{"saved":false,"reason":"checkpoint_regressed"}';END IF;
 FOR event IN SELECT value FROM jsonb_array_elements(p->'events') LOOP
  source:=event->'source_ref';
  IF event->>'org_id' IS DISTINCT FROM p->>'org_id' OR event->>'activity_id' IS DISTINCT FROM p->>'activity_id'
  OR coalesce(event->>'kind','') NOT IN ('reply','opt_out','bounce') OR coalesce(event->>'event_id','') !~ '^imap:[a-f0-9]{64}$'
  OR source->>'mailbox' IS DISTINCT FROM 'INBOX' OR source->>'uid_validity' IS DISTINCT FROM p->'checkpoint'->>'uid_validity'
  OR coalesce(source->>'uid','') !~ '^[1-9][0-9]{0,9}$' THEN RETURN '{"saved":false,"reason":"event_scope_mismatch"}';END IF;
  IF (source->>'uid')::bigint >= (p->'checkpoint'->>'uid_next')::bigint THEN RETURN '{"saved":false,"reason":"event_outside_scan"}';END IF;
 END LOOP;
 FOR event IN SELECT value FROM jsonb_array_elements(p->'events') LOOP
  result:=outreach_record_stop(jsonb_build_object('org_id',a.org_id,'activity_id',a.id,'kind',event->>'kind','event_id',event->>'event_id','source_ref',(event->'source_ref')::text));
  IF result->>'saved' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'imap_stop_not_saved';END IF;
 END LOOP;
 UPDATE outreach_activities SET dispatch_metadata=dispatch_metadata||jsonb_build_object('imap_checkpoint',p->'checkpoint','reply_scan',jsonb_build_object('checked_at',CASE WHEN p->'complete'='true'::jsonb AND p->>'scan_highwater'=p->'checkpoint'->>'uid_next' THEN clock_timestamp() ELSE NULL END,
 'review_required',jsonb_array_length(p->'reviews')>0 OR coalesce(a.dispatch_metadata->'reply_scan'->>'review_required','false')='true','review_count',jsonb_array_length(p->'reviews'),'matched_count',jsonb_array_length(p->'events'))) WHERE org_id=a.org_id AND id=a.id;
 RETURN jsonb_build_object('saved',true,'matched_count',jsonb_array_length(p->'events'));
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN '{"saved":false,"reason":"invalid_scan"}';
END $$;
REVOKE ALL ON FUNCTION outreach_smtp_finish(jsonb),outreach_imap_scan_finish(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_smtp_finish(jsonb),outreach_imap_scan_finish(jsonb) TO n8n_user;
-- GENERATED SMTP INTEGRATION: scripts/sender-connections/build-smtp-sql.cjs
CREATE OR REPLACE FUNCTION sender_connection_smtp_gate(p_org integer,cfg jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE s sender_connections%ROWTYPE; member org_sender_memberships%ROWTYPE; ref jsonb:=cfg->'sender_connection'; policy jsonb:=cfg->'email_dispatch';
BEGIN
 IF ref IS NULL THEN RETURN '{"allowed":false,"reason":"managed_smtp_binding_required"}'; END IF;
 IF false THEN
  IF EXISTS(SELECT 1 FROM sender_connections WHERE credential_ref=policy->>'credential_ref') THEN RETURN '{"allowed":false,"reason":"managed_sender_binding_required"}';END IF;
  RETURN '{"allowed":true,"legacy":true}';
 END IF;
 PERFORM 1 FROM organizations WHERE id=p_org AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RETURN '{"allowed":false,"reason":"sender_org_unavailable"}';END IF;
 SELECT * INTO member FROM org_sender_memberships WHERE org_id=p_org AND subject=ref->>'subject' AND active FOR SHARE;
 IF NOT FOUND THEN RETURN '{"allowed":false,"reason":"sender_membership_revoked"}';END IF;
 SELECT * INTO s FROM sender_connections WHERE org_id=p_org AND connection_id=ref->>'connection_id' FOR SHARE;
 IF NOT FOUND THEN RETURN '{"allowed":false,"reason":"sender_connection_missing"}';END IF;
 IF s.sharing='private' AND s.owner_subject<>member.subject AND member.role NOT IN ('owner','admin') THEN RETURN '{"allowed":false,"reason":"sender_private"}';END IF;
 IF s.state<>'ready' OR NOT s.send_capable OR NOT s.reply_capable OR s.checked_at IS NULL OR s.checked_at>clock_timestamp() OR s.checked_at<clock_timestamp()-interval '24 hours' THEN RETURN '{"allowed":false,"reason":"sender_connection_not_ready"}';END IF;
 IF s.version::text IS DISTINCT FROM ref->>'version' OR s.provider IS DISTINCT FROM ref->>'provider'
 OR s.credential_ref IS DISTINCT FROM policy->>'credential_ref' OR s.email IS DISTINCT FROM policy->>'sender_email' THEN RETURN '{"allowed":false,"reason":"sender_connection_changed"}';END IF;
 IF s.provider<>'smtp' THEN RETURN '{"allowed":false,"reason":"smtp_connection_required"}';END IF;
 IF (policy->>'daily_limit')::integer>s.daily_limit OR (policy->>'mailbox_rolling_limit')::integer>s.mailbox_rolling_limit OR (policy->>'min_interval_seconds')::integer<s.min_interval_seconds
 OR policy->>'daily_limit' IS NULL OR policy->>'mailbox_rolling_limit' IS NULL OR policy->>'min_interval_seconds' IS NULL THEN RETURN '{"allowed":false,"reason":"sender_limit_mismatch"}';END IF;
 RETURN '{"allowed":true}';
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN '{"allowed":false,"reason":"invalid_sender_policy"}';
END $$;
CREATE OR REPLACE FUNCTION outreach_smtp_begin(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE ck jsonb; v strategy_plans%ROWTYPE; a outreach_activities%ROWTYPE;
 contact_gate jsonb; mailbox_guard jsonb; cfg jsonb; policy jsonb; message jsonb; cap integer; used bigint; day text;
BEGIN

 IF coalesce(p->>'message_id','') !~ '^<[^<>[:space:]]+@[^<>[:space:]]+>$' OR length(p->>'message_id')>250
 OR p->'checkpoint'->>'mailbox' IS DISTINCT FROM 'INBOX'
 OR coalesce(p->'checkpoint'->>'uid_validity','') !~ '^[1-9][0-9]{0,9}$'
 OR coalesce(p->'checkpoint'->>'uid_next','') !~ '^[1-9][0-9]{0,9}$'
 OR jsonb_typeof(p->'references') IS DISTINCT FROM 'array' THEN RETURN '{"ready":false,"reason":"smtp_headers_or_cursor_invalid"}';END IF;
 IF jsonb_array_length(p->'references')>20 THEN RETURN '{"ready":false,"reason":"smtp_headers_invalid"}';END IF;
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
 IF cfg->'sender_connection'->>'connection_id' IS DISTINCT FROM p->>'connection_id'
 OR NOT EXISTS(SELECT 1 FROM sender_connections s WHERE s.org_id=v.org_id AND s.connection_id=p->>'connection_id' AND s.inbox_credential_ref=p->>'inbox_credential_ref') THEN RETURN '{"ready":false,"reason":"smtp_inbox_binding_mismatch"}';END IF;
 -- SENDER_CONNECTION_GATE_START
 ck:=sender_connection_smtp_gate(v.org_id,cfg);
 IF ck->>'allowed' IS DISTINCT FROM 'true' THEN RETURN ck||'{"ready":false,"execution_authorized":false}'::jsonb;END IF;
 ck:=outreach_email_step_recheck(p);
 IF ck->>'ready' IS DISTINCT FROM 'true' THEN RETURN ck;END IF;
 -- SENDER_CONNECTION_GATE_END
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
 'transport','smtp','smtp_message_id',p->>'message_id','smtp_references',p->'references',
 'connection_id',p->>'connection_id','inbox_credential_ref',p->>'inbox_credential_ref','imap_checkpoint',p->'checkpoint','smtp_subject',p->>'subject',
 'state','attempting','attempts',1,'quota_day',day,'started_at',clock_timestamp(),
 'recipient_email',p->>'to_email','credential_ref',policy->>'credential_ref','sender_email',policy->>'sender_email') WHERE id=a.id AND org_id=v.org_id;
 RETURN ck||jsonb_build_object('execution_authorized',true,'reason','one_attempt_committed','quota_day',day);
END $$;
CREATE OR REPLACE FUNCTION sender_connection_bind(p_org integer,p_subject text,p_id text,p_campaign bigint,p_version integer) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE cfg jsonb; s sender_connections%ROWTYPE; result jsonb;
BEGIN
 PERFORM 1 FROM organizations WHERE id=p_org AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RETURN '{"error":"ORG_UNAVAILABLE"}';END IF;
 SELECT * INTO s FROM sender_connections WHERE org_id=p_org AND connection_id=p_id;
 IF NOT FOUND THEN RETURN '{"error":"NOT_FOUND"}';END IF;
 SELECT v.config INTO cfg FROM strategy_campaigns c JOIN strategy_campaign_versions v ON v.org_id=c.org_id AND v.campaign_id=c.id AND v.version=c.version
 WHERE c.org_id=p_org AND c.id=p_campaign AND c.version=p_version;
 IF NOT FOUND THEN RETURN '{"error":"CAMPAIGN_VERSION_CONFLICT"}';END IF;
 cfg:=cfg||jsonb_build_object('sender_connection',jsonb_build_object('connection_id',s.connection_id,'version',s.version,'provider',s.provider,'subject',p_subject),
 'email_dispatch',jsonb_build_object('enabled',false,'credential_ref',s.credential_ref,'sender_email',s.email,'daily_limit',s.daily_limit,'mailbox_rolling_limit',s.mailbox_rolling_limit,'min_interval_seconds',s.min_interval_seconds));
 IF s.provider='smtp' THEN result:=sender_connection_smtp_gate(p_org,cfg); ELSE result:=sender_connection_gate(p_org,cfg);END IF;
 IF result->>'allowed' IS DISTINCT FROM 'true' THEN RETURN jsonb_build_object('error',result->>'reason');END IF;
 RETURN strategy_campaign_save(jsonb_build_object('org_id',p_org,'campaign_id',p_campaign,'expected_version',p_version,'config',cfg));
END $$;
REVOKE ALL ON FUNCTION sender_connection_smtp_gate(integer,jsonb),outreach_smtp_begin(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sender_connection_smtp_gate(integer,jsonb),outreach_smtp_begin(jsonb) TO n8n_user;
COMMIT;
