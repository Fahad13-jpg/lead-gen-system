-- LOCAL / UNAPPLIED. Targeted registry extension authorized by the user.
-- Requires existing 035 registry and 046–050 WhatsApp functions. No new tables/webhooks.
BEGIN;
CREATE FUNCTION sender_whatsapp_metadata_valid(p jsonb) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE expiry timestamptz;BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RETURN false;END IF;
 IF p-ARRAY['waba_id','phone_number_id','api_version','credential_expires_at','identity_verified','inbound_verified']<>'{}'::jsonb
 OR coalesce(p->>'waba_id','') !~ '^[0-9]{5,30}$' OR coalesce(p->>'phone_number_id','') !~ '^[0-9]{5,30}$'
 OR coalesce(p->>'api_version','') !~ '^v[0-9]{1,3}[.][0-9]$' OR jsonb_typeof(p->'identity_verified') IS DISTINCT FROM 'boolean' THEN RETURN false;END IF;
 IF p ? 'inbound_verified' AND jsonb_typeof(p->'inbound_verified') IS DISTINCT FROM 'boolean' THEN RETURN false;END IF;
 expiry:=(p->>'credential_expires_at')::timestamptz;RETURN coalesce(isfinite(expiry),false);
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN RETURN false;
END $$;
ALTER TABLE sender_connections ADD COLUMN channel_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE sender_connections DROP CONSTRAINT sender_connections_provider_check;
ALTER TABLE sender_connections DROP CONSTRAINT sender_connections_check;
ALTER TABLE sender_connections ALTER COLUMN email DROP NOT NULL;
ALTER TABLE sender_connections ADD CONSTRAINT sender_connections_provider_check CHECK(provider IN ('gmail','smtp','whatsapp'));
ALTER TABLE sender_connections ADD CONSTRAINT sender_connections_protocol_shape CHECK(
 CASE WHEN provider='whatsapp' THEN email IS NULL AND inbox_credential_ref IS NULL AND sender_whatsapp_metadata_valid(channel_metadata) AND daily_limit<=1000 AND mailbox_rolling_limit<=1000
 ELSE email IS NOT NULL AND channel_metadata='{}'::jsonb AND ((provider='gmail' AND inbox_credential_ref IS NULL) OR (provider='smtp' AND inbox_credential_ref IS NOT NULL)) END);
CREATE UNIQUE INDEX sender_whatsapp_phone_unique ON sender_connections((channel_metadata->>'phone_number_id')) WHERE provider='whatsapp';

CREATE FUNCTION sender_whatsapp_manage(p_org integer,p_subject text,p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE member org_sender_memberships%ROWTYPE;s sender_connections%ROWTYPE;meta jsonb;BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RETURN '{"error":"INVALID_REQUEST"}';END IF;
 PERFORM pg_advisory_xact_lock(727413,1);
 PERFORM 1 FROM organizations WHERE id=p_org AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RETURN '{"error":"ORG_UNAVAILABLE"}';END IF;
 SELECT * INTO member FROM org_sender_memberships WHERE org_id=p_org AND subject=p_subject AND active FOR SHARE;
 IF NOT FOUND THEN RETURN '{"error":"MEMBERSHIP_REQUIRED"}';END IF;
 IF p->>'action' IS DISTINCT FROM 'create' THEN
  SELECT * INTO s FROM sender_connections WHERE org_id=p_org AND connection_id=p->>'connection_id' AND provider='whatsapp';
  IF NOT FOUND THEN RETURN '{"error":"WHATSAPP_CONNECTION_NOT_FOUND"}';END IF;
  IF p-ARRAY['action','connection_id','expected_version']<>'{}'::jsonb THEN RETURN '{"error":"UNSUPPORTED_FIELD"}';END IF;
  RETURN sender_connection_manage_pre051(p_org,p_subject,p);
 END IF;
 IF p-ARRAY['action','connection_id','provider','credential_ref','sharing','limits','whatsapp']<>'{}'::jsonb OR p->>'provider' IS DISTINCT FROM 'whatsapp'
 OR coalesce(p->>'connection_id','') !~ '^[A-Za-z0-9_-]{1,120}$' OR coalesce(p->>'credential_ref','') !~ '^[A-Za-z0-9_-]{1,120}$'
 OR coalesce(p->>'sharing','') NOT IN ('private','team') THEN RETURN '{"error":"INVALID_WHATSAPP_CONNECTION"}';END IF;
 IF p->>'sharing'='team' AND member.role NOT IN ('owner','admin') THEN RETURN '{"error":"ADMIN_REQUIRED"}';END IF;
 meta:=p->'whatsapp';
 IF NOT sender_whatsapp_metadata_valid(meta) OR meta ? 'inbound_verified' OR meta->'identity_verified' IS DISTINCT FROM 'false'::jsonb OR NOT coalesce((meta->>'credential_expires_at')::timestamptz>now(),false) THEN RETURN '{"error":"INVALID_WHATSAPP_METADATA"}';END IF;
 IF jsonb_typeof(p->'limits') IS DISTINCT FROM 'object' THEN RETURN '{"error":"INVALID_LIMITS"}';END IF;
 IF (p->'limits')-ARRAY['daily_messages','rolling_24h_messages','min_interval_seconds']<>'{}'::jsonb
 OR coalesce(p->'limits'->>'daily_messages','') !~ '^([1-9][0-9]{0,2}|1000)$' OR coalesce(p->'limits'->>'rolling_24h_messages','') !~ '^([1-9][0-9]{0,2}|1000)$'
 OR coalesce(p->'limits'->>'min_interval_seconds','') !~ '^[1-9][0-9]{0,4}$' THEN RETURN '{"error":"INVALID_LIMITS"}';END IF;
 IF NOT EXISTS(SELECT 1 FROM credentials_entity WHERE id=p->>'credential_ref' AND type='whatsAppApi') THEN RETURN '{"error":"CREDENTIAL_NOT_FOUND"}';END IF;
 -- Credential ownership/account/expiry additionally comes from the trusted
 -- backend catalog. This function is never a customer-facing check endpoint.
 INSERT INTO sender_connections(org_id,connection_id,owner_subject,provider,credential_ref,email,sharing,daily_limit,mailbox_rolling_limit,min_interval_seconds,channel_metadata)
 VALUES(p_org,p->>'connection_id',p_subject,'whatsapp',p->>'credential_ref',NULL,p->>'sharing',(p->'limits'->>'daily_messages')::integer,(p->'limits'->>'rolling_24h_messages')::integer,(p->'limits'->>'min_interval_seconds')::integer,meta||'{"inbound_verified":false}'::jsonb) RETURNING * INTO s;
 RETURN jsonb_build_object('org_id',s.org_id,'connection_id',s.connection_id,'provider',s.provider,'version',s.version,'state',s.state,'execution_authorized',false);
EXCEPTION WHEN unique_violation OR check_violation OR not_null_violation OR invalid_text_representation OR numeric_value_out_of_range OR invalid_datetime_format OR datetime_field_overflow THEN RETURN '{"error":"INVALID_OR_CONFLICTING_CONNECTION"}';
END $$;

-- Preserve legacy definitions/OIDs; generic lifecycle calls cannot bypass the
-- WhatsApp lock, and the old email checker cannot mutate WhatsApp connections.
DO $$ DECLARE d text;BEGIN
 d:=pg_get_functiondef('sender_connection_manage(integer,text,jsonb)'::regprocedure);EXECUTE replace(d,'FUNCTION public.sender_connection_manage(','FUNCTION public.sender_connection_manage_pre051(');
 d:=pg_get_functiondef('sender_connection_checked(integer,text,integer,jsonb)'::regprocedure);EXECUTE replace(d,'FUNCTION public.sender_connection_checked(','FUNCTION public.sender_connection_checked_pre051(');
END $$;
CREATE OR REPLACE FUNCTION sender_connection_manage(p_org integer,p_subject text,p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
 IF p->>'provider'='whatsapp' OR EXISTS(SELECT 1 FROM sender_connections WHERE org_id=p_org AND connection_id=p->>'connection_id' AND provider='whatsapp') THEN RETURN sender_whatsapp_manage(p_org,p_subject,p);END IF;
 RETURN sender_connection_manage_pre051(p_org,p_subject,p);
END $$;
CREATE OR REPLACE FUNCTION sender_connection_checked(p_org integer,p_id text,p_version integer,p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM sender_connections WHERE org_id=p_org AND connection_id=p_id AND provider='whatsapp') THEN RETURN '{"error":"WHATSAPP_CONNECTOR_REQUIRED"}';END IF;
 RETURN sender_connection_checked_pre051(p_org,p_id,p_version,p);
END $$;

CREATE FUNCTION sender_whatsapp_checked(p_org integer,p_id text,p_version integer,p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE s sender_connections%ROWTYPE;ok boolean;stamp timestamptz;BEGIN
 PERFORM pg_advisory_xact_lock(727413,1);
 PERFORM 1 FROM organizations WHERE id=p_org AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RETURN '{"error":"ORG_UNAVAILABLE"}';END IF;
 SELECT * INTO s FROM sender_connections WHERE org_id=p_org AND connection_id=p_id AND provider='whatsapp' FOR UPDATE;
 IF NOT FOUND THEN RETURN '{"error":"NOT_FOUND"}';END IF;
 IF s.version<>p_version OR s.state NOT IN ('pending_check','reconnect_required','degraded') THEN RETURN '{"error":"CHECK_STALE"}';END IF;
 stamp:=(p->>'verified_at')::timestamptz;
 ok:=coalesce(p->>'state'='identity_checked' AND p->'execution_authorized'='false'::jsonb AND p->>'org_id'=p_org::text AND p->>'connection_id'=p_id AND p->>'credential_ref'=s.credential_ref
 AND p->>'waba_id'=s.channel_metadata->>'waba_id' AND p->>'phone_number_id'=s.channel_metadata->>'phone_number_id' AND p->>'api_version'=s.channel_metadata->>'api_version'
 AND p->'capabilities'->'account_sender_match'='true'::jsonb AND stamp BETWEEN now()-interval '5 minutes' AND now()
 AND (s.channel_metadata->>'credential_expires_at')::timestamptz>now(),false);
 UPDATE sender_connections SET version=version+1,state=CASE WHEN ok THEN 'ready' ELSE 'reconnect_required' END,send_capable=false,reply_capable=false,checked_at=CASE WHEN ok THEN stamp ELSE NULL END,channel_metadata=channel_metadata||jsonb_build_object('identity_verified',ok,'inbound_verified',coalesce((channel_metadata->>'inbound_verified')::boolean,false) OR ok) WHERE org_id=p_org AND connection_id=p_id RETURNING * INTO s;
 RETURN jsonb_build_object('state',CASE WHEN ok THEN 'identity_checked' ELSE 'reconnect_required' END,'version',s.version,'sending_verified',false,'execution_authorized',false);
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN RETURN '{"error":"MALFORMED_CHECK"}';
END $$;
-- Make the registry authoritative for registered inbound senders, including
-- paused/disconnected senders. Preserve 047 validation, dedup and STOP behavior.
DO $$ DECLARE d text;first_pos integer;last_pos integer;old_route text;new_route text;BEGIN
 d:=pg_get_functiondef('outreach_whatsapp_inbound_store(jsonb)'::regprocedure);
 first_pos:=strpos(d,'SELECT count(DISTINCT c.org_id),count(DISTINCT cv.config');last_pos:=strpos(d,'IF orgs<>1 OR conns<>1');
 IF first_pos=0 OR last_pos<=first_pos THEN RAISE EXCEPTION 'UNEXPECTED_INBOUND_ROUTING_DEFINITION';END IF;
 old_route:=substring(d FROM first_pos FOR last_pos-first_pos);
 new_route:=$route$SELECT count(DISTINCT org_id),count(DISTINCT connection_id),min(org_id),min(connection_id) INTO orgs,conns,o,conn FROM sender_connections WHERE provider='whatsapp' AND channel_metadata->>'phone_number_id'=p->>'phone_number_id' AND channel_metadata->>'waba_id'=p->>'waba_id' AND channel_metadata->'inbound_verified'='true'::jsonb;
 IF NOT EXISTS(SELECT 1 FROM sender_connections WHERE provider='whatsapp' AND channel_metadata->>'phone_number_id'=p->>'phone_number_id') THEN
 $route$||old_route||E'\n END IF;\n ';
 EXECUTE replace(d,old_route,new_route);
END $$;

CREATE FUNCTION sender_whatsapp_check_input(p_org integer,p_subject text,p_id text,p_version integer) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE s sender_connections%ROWTYPE;m org_sender_memberships%ROWTYPE;BEGIN
 SELECT * INTO m FROM org_sender_memberships WHERE org_id=p_org AND subject=p_subject AND active;
 IF NOT FOUND THEN RETURN '{"ready":false,"reason":"membership_required"}';END IF;
 IF NOT EXISTS(SELECT 1 FROM organizations WHERE id=p_org AND status='active') THEN RETURN '{"ready":false,"reason":"org_unavailable"}';END IF;
 SELECT * INTO s FROM sender_connections WHERE org_id=p_org AND connection_id=p_id AND provider='whatsapp';
 IF NOT FOUND OR (s.owner_subject<>p_subject AND m.role NOT IN ('owner','admin')) THEN RETURN '{"ready":false,"reason":"manage_forbidden"}';END IF;
 IF s.version<>p_version OR s.state NOT IN ('pending_check','reconnect_required','degraded') THEN RETURN '{"ready":false,"reason":"check_stale"}';END IF;
 IF NOT coalesce((s.channel_metadata->>'credential_expires_at')::timestamptz>now(),false) THEN RETURN '{"ready":false,"reason":"credential_expired"}';END IF;
 RETURN jsonb_build_object('ready',true,'task',s.channel_metadata||jsonb_build_object('org_id',s.org_id,'connection_id',s.connection_id,'credential_ref',s.credential_ref,'version',s.version));
END $$;

CREATE FUNCTION sender_whatsapp_gate(p_org integer,cfg jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE ref jsonb:=cfg->'whatsapp_sender_connection';d jsonb:=cfg->'whatsapp_dispatch';s sender_connections%ROWTYPE;m org_sender_memberships%ROWTYPE;BEGIN
 IF ref IS NULL THEN
  IF EXISTS(SELECT 1 FROM sender_connections WHERE provider='whatsapp' AND (credential_ref=d->'connection'->>'credential_ref' OR channel_metadata->>'phone_number_id'=d->'connection'->>'phone_number_id')) THEN RETURN '{"allowed":false,"reason":"managed_whatsapp_binding_required"}';END IF;
  RETURN '{"allowed":true,"legacy":true}';
 END IF;
 SELECT * INTO m FROM org_sender_memberships WHERE org_id=p_org AND subject=ref->>'subject' AND active;
 IF NOT FOUND THEN RETURN '{"allowed":false,"reason":"sender_membership_revoked"}';END IF;
 SELECT * INTO s FROM sender_connections WHERE org_id=p_org AND connection_id=ref->>'connection_id' AND provider='whatsapp';
 IF NOT FOUND THEN RETURN '{"allowed":false,"reason":"whatsapp_sender_missing"}';END IF;
 IF s.sharing='private' AND s.owner_subject<>m.subject AND m.role NOT IN ('owner','admin') THEN RETURN '{"allowed":false,"reason":"sender_private"}';END IF;
 IF s.state<>'ready' OR s.channel_metadata->'identity_verified' IS DISTINCT FROM 'true'::jsonb OR NOT coalesce((s.channel_metadata->>'credential_expires_at')::timestamptz>now(),false) THEN RETURN '{"allowed":false,"reason":"whatsapp_sender_not_ready"}';END IF;
 IF ref->>'version' IS DISTINCT FROM s.version::text OR ref->>'provider' IS DISTINCT FROM 'whatsapp' OR d->'connection'->>'connection_id' IS DISTINCT FROM s.connection_id
 OR d->'connection'->>'credential_ref' IS DISTINCT FROM s.credential_ref OR d->'connection'->>'waba_id' IS DISTINCT FROM s.channel_metadata->>'waba_id'
 OR d->'connection'->>'phone_number_id' IS DISTINCT FROM s.channel_metadata->>'phone_number_id' OR d->'connection'->>'api_version' IS DISTINCT FROM s.channel_metadata->>'api_version'
 OR (d->'connection'->>'expires_at')::timestamptz IS DISTINCT FROM (s.channel_metadata->>'credential_expires_at')::timestamptz THEN RETURN '{"allowed":false,"reason":"whatsapp_sender_changed"}';END IF;
 IF coalesce(d->'limits'->>'daily_messages','') !~ '^([1-9][0-9]{0,2}|1000)$' OR coalesce(d->'limits'->>'min_interval_seconds','') !~ '^[1-9][0-9]{0,4}$' THEN RETURN '{"allowed":false,"reason":"sender_limit_mismatch"}';END IF;
 IF (d->'limits'->>'daily_messages')::integer>s.daily_limit OR (d->'limits'->>'min_interval_seconds')::integer<s.min_interval_seconds THEN RETURN '{"allowed":false,"reason":"sender_limit_mismatch"}';END IF;
 IF (SELECT count(*) FROM outreach_activities WHERE org_id=p_org AND channel='whatsapp' AND dispatch_metadata->>'version'='whatsapp_v1' AND dispatch_metadata->>'connection_id'=s.connection_id AND created_at>(now()-interval '24 hours') AT TIME ZONE 'UTC')>=s.mailbox_rolling_limit THEN RETURN '{"allowed":false,"reason":"whatsapp_sender_rolling_limit"}';END IF;
 RETURN '{"allowed":true}';
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN RETURN '{"allowed":false,"reason":"invalid_whatsapp_sender_policy"}';
END $$;

CREATE FUNCTION sender_whatsapp_bind(p_org integer,p_subject text,p_id text,p_campaign bigint,p_version integer) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE s sender_connections%ROWTYPE;cfg jsonb;d jsonb;r jsonb;BEGIN
 PERFORM pg_advisory_xact_lock(727413,1);
 PERFORM 1 FROM organizations WHERE id=p_org AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RETURN '{"error":"ORG_UNAVAILABLE"}';END IF;
 SELECT * INTO s FROM sender_connections WHERE org_id=p_org AND connection_id=p_id AND provider='whatsapp';
 IF NOT FOUND THEN RETURN '{"error":"NOT_FOUND"}';END IF;
 IF s.checked_at IS NULL OR s.checked_at<now()-interval '24 hours' OR s.checked_at>now() THEN RETURN '{"error":"SENDER_CHECK_REQUIRED"}';END IF;
 SELECT cv.config INTO cfg FROM strategy_campaigns c JOIN strategy_campaign_versions cv ON cv.org_id=c.org_id AND cv.campaign_id=c.id AND cv.version=c.version WHERE c.org_id=p_org AND c.id=p_campaign AND c.version=p_version;
 IF NOT FOUND THEN RETURN '{"error":"CAMPAIGN_VERSION_CONFLICT"}';END IF;
 d:=coalesce(cfg->'whatsapp_dispatch','{}'::jsonb);
 IF jsonb_typeof(d) IS DISTINCT FROM 'object' THEN RETURN '{"error":"INVALID_WHATSAPP_CONFIG"}';END IF;
 IF (d ? 'limits' AND jsonb_typeof(d->'limits') IS DISTINCT FROM 'object') OR (d ? 'release' AND jsonb_typeof(d->'release') IS DISTINCT FROM 'object') OR (d ? 'quote' AND jsonb_typeof(d->'quote') IS DISTINCT FROM 'object') THEN RETURN '{"error":"INVALID_WHATSAPP_CONFIG"}';END IF;
 -- Provider approval/pricing evidence from a previous account is not reusable.
 d:=(d-ARRAY['template','templates_by_step'])||jsonb_build_object('enabled',false,'campaign_state','paused','release',coalesce(d->'release','{}'::jsonb)||'{"enabled":false}'::jsonb,'quote',coalesce(d->'quote','{}'::jsonb)||'{"verified":false}'::jsonb,
 'connection',jsonb_build_object('org_id',p_org,'connection_id',s.connection_id,'credential_ref',s.credential_ref,'phone_number_id',s.channel_metadata->>'phone_number_id','waba_id',s.channel_metadata->>'waba_id','api_version',s.channel_metadata->>'api_version','state','ready','verified_at',s.checked_at,'expires_at',s.channel_metadata->>'credential_expires_at'));
 -- Binding never invents a monthly budget, verified quote, consent or template.
 d:=jsonb_set(d,'{limits}',coalesce(d->'limits','{}'::jsonb)||jsonb_build_object('daily_messages',least(s.daily_limit,CASE WHEN coalesce(d->'limits'->>'daily_messages','') ~ '^([1-9][0-9]{0,2}|1000)$' THEN (d->'limits'->>'daily_messages')::integer ELSE s.daily_limit END),'min_interval_seconds',greatest(s.min_interval_seconds,CASE WHEN coalesce(d->'limits'->>'min_interval_seconds','') ~ '^[1-9][0-9]{0,4}$' THEN (d->'limits'->>'min_interval_seconds')::integer ELSE s.min_interval_seconds END)));
 cfg:=cfg||jsonb_build_object('whatsapp_dispatch',d,'whatsapp_sender_connection',jsonb_build_object('connection_id',s.connection_id,'version',s.version,'provider','whatsapp','subject',p_subject));
 r:=sender_whatsapp_gate(p_org,cfg);IF r->>'allowed' IS DISTINCT FROM 'true' THEN RETURN jsonb_build_object('error',r->>'reason');END IF;
 RETURN strategy_campaign_save(jsonb_build_object('org_id',p_org,'campaign_id',p_campaign,'expected_version',p_version,'config',cfg));
END $$;

-- 047's incoming suppression wrapper remains intact. Registry checks run on
-- every gate, including the recheck inside the existing atomic begin claim.
DO $$ DECLARE d text;BEGIN
 d:=pg_get_functiondef('outreach_whatsapp_gate(jsonb)'::regprocedure);EXECUTE replace(d,'FUNCTION public.outreach_whatsapp_gate(','FUNCTION public.outreach_whatsapp_gate_pre051(');
END $$;
CREATE OR REPLACE FUNCTION outreach_whatsapp_gate(p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE g jsonb;cfg jsonb;r jsonb;BEGIN
 g:=outreach_whatsapp_gate_pre051(p);IF g->>'allowed' IS DISTINCT FROM 'true' THEN RETURN g;END IF;
 SELECT cv.config INTO cfg FROM strategy_plans v JOIN strategy_campaign_versions cv ON cv.org_id=v.org_id AND cv.campaign_id=v.campaign_id AND cv.version=v.campaign_version WHERE v.org_id=(p->>'org_id')::integer AND v.id=(p->>'plan_id')::bigint;
 r:=sender_whatsapp_gate((p->>'org_id')::integer,cfg);IF r->>'allowed' IS DISTINCT FROM 'true' THEN RETURN r;END IF;RETURN g;
END $$;
REVOKE ALL ON FUNCTION sender_whatsapp_metadata_valid(jsonb),sender_whatsapp_manage(integer,text,jsonb),sender_whatsapp_checked(integer,text,integer,jsonb),sender_whatsapp_check_input(integer,text,text,integer),sender_whatsapp_gate(integer,jsonb),sender_whatsapp_bind(integer,text,text,bigint,integer),sender_connection_manage_pre051(integer,text,jsonb),sender_connection_checked_pre051(integer,text,integer,jsonb),outreach_whatsapp_gate_pre051(jsonb),outreach_whatsapp_gate(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sender_whatsapp_metadata_valid(jsonb),sender_whatsapp_manage(integer,text,jsonb),sender_whatsapp_checked(integer,text,integer,jsonb),sender_whatsapp_check_input(integer,text,text,integer),sender_whatsapp_gate(integer,jsonb),sender_whatsapp_bind(integer,text,text,bigint,integer),sender_connection_manage_pre051(integer,text,jsonb),sender_connection_checked_pre051(integer,text,integer,jsonb),outreach_whatsapp_gate_pre051(jsonb),outreach_whatsapp_gate(jsonb) TO n8n_user;
COMMIT;
