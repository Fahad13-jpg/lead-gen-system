-- Local candidate: organization-owned metadata only; secrets stay in n8n credentials.
BEGIN;
CREATE TABLE org_sender_memberships (
 org_id integer NOT NULL REFERENCES organizations(id), subject text NOT NULL CHECK(subject ~ '^[a-f0-9]{64}$'),
 role text NOT NULL CHECK(role IN ('owner','admin','member')), active boolean NOT NULL DEFAULT true,
 PRIMARY KEY(org_id,subject)
);
CREATE TABLE sender_connections (
 org_id integer NOT NULL REFERENCES organizations(id), connection_id text NOT NULL CHECK(connection_id ~ '^[A-Za-z0-9_-]{1,120}$'),
 owner_subject text NOT NULL, provider text NOT NULL CHECK(provider IN ('gmail','smtp')),
 credential_ref text NOT NULL UNIQUE, inbox_credential_ref text UNIQUE,
 email text NOT NULL CHECK(email=lower(trim(email)) AND email ~ '^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+\.[^[:space:]@,;<>]+$'),
 sharing text NOT NULL CHECK(sharing IN ('private','team')), version integer NOT NULL DEFAULT 1,
 state text NOT NULL DEFAULT 'pending_check' CHECK(state IN ('pending_check','ready','reconnect_required','degraded','disabled','disconnected')),
 daily_limit integer NOT NULL CHECK(daily_limit BETWEEN 1 AND 9999),
 mailbox_rolling_limit integer NOT NULL CHECK(mailbox_rolling_limit BETWEEN 1 AND 9999),
 min_interval_seconds integer NOT NULL CHECK(min_interval_seconds BETWEEN 1 AND 99999),
 send_capable boolean NOT NULL DEFAULT false, reply_capable boolean NOT NULL DEFAULT false, checked_at timestamptz,
 PRIMARY KEY(org_id,connection_id), FOREIGN KEY(org_id,owner_subject) REFERENCES org_sender_memberships(org_id,subject),
 CHECK((provider='gmail' AND inbox_credential_ref IS NULL) OR (provider='smtp' AND inbox_credential_ref IS NOT NULL))
);
REVOKE ALL ON org_sender_memberships,sender_connections FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON org_sender_memberships,sender_connections TO n8n_user;

-- Called only by the authenticated backend. Identity is never taken from dashboard JSON.
CREATE OR REPLACE FUNCTION sender_connection_manage(p_org integer,p_subject text,p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE member org_sender_memberships%ROWTYPE; s sender_connections%ROWTYPE; action text:=p->>'action';
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RETURN '{"error":"INVALID_REQUEST"}';END IF;
 PERFORM 1 FROM organizations WHERE id=p_org AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RETURN '{"error":"ORG_UNAVAILABLE"}';END IF;
 SELECT * INTO member FROM org_sender_memberships WHERE org_id=p_org AND subject=p_subject AND active FOR SHARE;
 IF NOT FOUND THEN RETURN '{"error":"MEMBERSHIP_REQUIRED"}';END IF;
 IF action='create' THEN
  IF p->>'sharing'='team' AND member.role NOT IN ('owner','admin') THEN RETURN '{"error":"ADMIN_REQUIRED"}';END IF;
  -- This endpoint does not accept raw secrets, capabilities or an owner supplied by the caller.
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE k NOT IN ('action','connection_id','provider','credential_ref','inbox_credential_ref','email','sharing','limits')) THEN RETURN '{"error":"UNSUPPORTED_FIELD"}';END IF;
  IF NOT EXISTS(SELECT 1 FROM credentials_entity WHERE id=p->>'credential_ref' AND type=CASE WHEN p->>'provider'='gmail' THEN 'gmailOAuth2' ELSE 'smtp' END)
  OR (p->>'provider'='smtp' AND NOT EXISTS(SELECT 1 FROM credentials_entity WHERE id=p->>'inbox_credential_ref' AND type='imap')) THEN RETURN '{"error":"CREDENTIAL_NOT_FOUND"}';END IF;
  -- Credential ownership must additionally be resolved by the backend's trusted catalog.
  INSERT INTO sender_connections(org_id,connection_id,owner_subject,provider,credential_ref,inbox_credential_ref,email,sharing,daily_limit,mailbox_rolling_limit,min_interval_seconds)
  VALUES(p_org,p->>'connection_id',p_subject,p->>'provider',p->>'credential_ref',p->>'inbox_credential_ref',p->>'email',p->>'sharing',
   (p->'limits'->>'daily_limit')::integer,(p->'limits'->>'mailbox_rolling_limit')::integer,(p->'limits'->>'min_interval_seconds')::integer) RETURNING * INTO s;
 ELSE
  SELECT * INTO s FROM sender_connections WHERE org_id=p_org AND connection_id=p->>'connection_id' FOR UPDATE;
  IF NOT FOUND THEN RETURN '{"error":"NOT_FOUND"}';END IF;
  IF s.owner_subject<>p_subject AND member.role NOT IN ('owner','admin') THEN RETURN '{"error":"MANAGE_FORBIDDEN"}';END IF;
  IF s.version::text IS DISTINCT FROM p->>'expected_version' THEN RETURN '{"error":"VERSION_CONFLICT"}';END IF;
  IF action NOT IN ('pause','disconnect','recheck') THEN RETURN '{"error":"INVALID_ACTION"}';END IF;
  UPDATE sender_connections SET version=version+1,state=CASE action WHEN 'pause' THEN 'disabled' WHEN 'disconnect' THEN 'disconnected' ELSE 'pending_check' END,
   send_capable=false,reply_capable=false,checked_at=NULL WHERE org_id=p_org AND connection_id=s.connection_id RETURNING * INTO s;
 END IF;
 RETURN jsonb_build_object('connection_id',s.connection_id,'org_id',s.org_id,'version',s.version,'state',s.state,'execution_authorized',false);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR check_violation OR not_null_violation OR unique_violation THEN RETURN '{"error":"INVALID_OR_CONFLICTING_CONNECTION"}';
END $$;

-- Trusted connector-only result: caller-facing API must not expose this function.
CREATE OR REPLACE FUNCTION sender_connection_checked(p_org integer,p_id text,p_version integer,p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE s sender_connections%ROWTYPE; ok boolean;
BEGIN
 PERFORM 1 FROM organizations WHERE id=p_org AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RETURN '{"error":"ORG_UNAVAILABLE"}';END IF;
 SELECT * INTO s FROM sender_connections WHERE org_id=p_org AND connection_id=p_id FOR UPDATE;
 IF NOT FOUND THEN RETURN '{"error":"NOT_FOUND"}';END IF;
 IF s.version<>p_version OR s.state NOT IN ('pending_check','reconnect_required','degraded') THEN RETURN '{"error":"CHECK_STALE"}';END IF;
 ok:=coalesce(p->>'email'=s.email AND p->>'credential_ref'=s.credential_ref AND p->'send'='true'::jsonb AND p->'read_replies'='true'::jsonb,false);
 UPDATE sender_connections SET version=version+1,state=CASE WHEN ok THEN 'ready' ELSE 'reconnect_required' END,
  send_capable=ok,reply_capable=ok,checked_at=clock_timestamp() WHERE org_id=p_org AND connection_id=p_id RETURNING * INTO s;
 RETURN jsonb_build_object('state',s.state,'version',s.version,'execution_authorized',false);
END $$;

CREATE OR REPLACE FUNCTION sender_connection_gate(p_org integer,cfg jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE s sender_connections%ROWTYPE; member org_sender_memberships%ROWTYPE; ref jsonb:=cfg->'sender_connection'; policy jsonb:=cfg->'email_dispatch';
BEGIN
 IF ref IS NULL THEN
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
 IF s.provider<>'gmail' THEN RETURN '{"allowed":false,"reason":"smtp_execution_not_integrated"}';END IF;
 IF (policy->>'daily_limit')::integer>s.daily_limit OR (policy->>'mailbox_rolling_limit')::integer>s.mailbox_rolling_limit OR (policy->>'min_interval_seconds')::integer<s.min_interval_seconds
 OR policy->>'daily_limit' IS NULL OR policy->>'mailbox_rolling_limit' IS NULL OR policy->>'min_interval_seconds' IS NULL THEN RETURN '{"allowed":false,"reason":"sender_limit_mismatch"}';END IF;
 RETURN '{"allowed":true}';
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN '{"allowed":false,"reason":"invalid_sender_policy"}';
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
 result:=sender_connection_gate(p_org,cfg);
 IF result->>'allowed' IS DISTINCT FROM 'true' THEN RETURN jsonb_build_object('error',result->>'reason');END IF;
 RETURN strategy_campaign_save(jsonb_build_object('org_id',p_org,'campaign_id',p_campaign,'expected_version',p_version,'config',cfg));
END $$;
REVOKE ALL ON FUNCTION sender_connection_bind(integer,text,text,bigint,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sender_connection_bind(integer,text,text,bigint,integer) TO n8n_user;
REVOKE ALL ON FUNCTION sender_connection_manage(integer,text,jsonb),sender_connection_checked(integer,text,integer,jsonb),sender_connection_gate(integer,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sender_connection_manage(integer,text,jsonb),sender_connection_checked(integer,text,integer,jsonb),sender_connection_gate(integer,jsonb) TO n8n_user;
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
 -- SENDER_CONNECTION_GATE_START
 ck:=sender_connection_gate(v.org_id,cfg);
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
 'state','attempting','attempts',1,'quota_day',day,'started_at',clock_timestamp(),
 'recipient_email',p->>'to_email','credential_ref',policy->>'credential_ref','sender_email',policy->>'sender_email') WHERE id=a.id AND org_id=v.org_id;
 RETURN ck||jsonb_build_object('execution_authorized',true,'reason','one_attempt_committed','quota_day',day);
END $$;
COMMIT;
