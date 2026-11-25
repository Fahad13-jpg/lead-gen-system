-- Local campaign authority support. Applying this migration does not activate or send.
-- Approval state uses one operational key in existing campaign config JSON.
BEGIN;
DO $patch$
DECLARE definition text; needle text:='SELECT config INTO cfg FROM strategy_campaign_versions WHERE org_id=p_org AND campaign_id=c.id AND version=c.version;';
BEGIN
 definition:=pg_get_functiondef('strategy_context(integer,bigint,integer)'::regprocedure);
 IF position('cfg:=cfg-''_email_execution'';' IN definition)=0 THEN
  IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'STRATEGY_CONTEXT_BASELINE_REVIEW_REQUIRED';END IF;
  EXECUTE replace(definition,needle,needle||E'\n cfg:=cfg-''_email_execution'';');
 END IF;
END $patch$;

CREATE OR REPLACE FUNCTION email_campaign_authority_manage(p_org integer,p_subject text,p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE c strategy_campaigns%ROWTYPE;cfg jsonb;old jsonb;r jsonb;s jsonb:=p->'scope';item jsonb;plan strategy_plans%ROWTYPE;seq jsonb;d jsonb;gate jsonb;revision integer;ends timestamptz;n integer;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR coalesce(p->>'action','') NOT IN ('approve','revoke') OR p_subject !~ '^[a-f0-9]{64}$'
 OR coalesce(p->>'campaign_id','') !~ '^[1-9][0-9]{0,18}$' OR coalesce(p->>'campaign_version','') !~ '^[1-9][0-9]{0,8}$' OR coalesce(p->>'expected_revision','') !~ '^[0-9]{1,8}$' THEN RETURN '{"error":"INVALID_REQUEST","http_status":400}';END IF;
 PERFORM 1 FROM organizations WHERE id=p_org AND status='active' FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM org_sender_memberships WHERE org_id=p_org AND subject=p_subject AND active AND role IN ('owner','admin')) THEN RETURN '{"error":"MEMBERSHIP_REQUIRED","http_status":403}';END IF;
 SELECT * INTO c FROM strategy_campaigns WHERE org_id=p_org AND id=(p->>'campaign_id')::bigint FOR UPDATE;
 IF NOT FOUND OR c.version<>(p->>'campaign_version')::integer THEN RETURN '{"error":"CAMPAIGN_CHANGED","http_status":409}';END IF;
 SELECT config INTO cfg FROM strategy_campaign_versions WHERE org_id=p_org AND campaign_id=c.id AND version=c.version FOR UPDATE;
 old:=cfg->'_email_execution';revision:=coalesce((old->>'revision')::integer,0);
 IF revision<>(p->>'expected_revision')::integer THEN RETURN '{"error":"AUTHORITY_REVISION_CHANGED","http_status":409}';END IF;
 IF p->>'action'='revoke' THEN
  IF old IS NULL THEN RETURN '{"error":"AUTHORITY_NOT_FOUND","http_status":404}';END IF;
  r:=old||jsonb_build_object('status','revoked','revision',revision+1,'revoked_at',clock_timestamp(),'revoked_by',p_subject);
 ELSE
  IF jsonb_typeof(s) IS DISTINCT FROM 'object' OR s->>'format' IS DISTINCT FROM 'email_campaign_authority_v1'
   OR s->>'org_id' IS DISTINCT FROM p_org::text OR s->>'campaign_id' IS DISTINCT FROM c.id::text OR s->>'campaign_version' IS DISTINCT FROM c.version::text
   OR s->>'config_hash' IS DISTINCT FROM md5((cfg-'_email_execution')::text) THEN RETURN '{"error":"SCOPE_CHANGED","http_status":409}';END IF;
  IF (CASE WHEN jsonb_typeof(s->'plans')='array' THEN jsonb_array_length(s->'plans') NOT BETWEEN 1 AND 10 ELSE true END)
   OR (CASE WHEN jsonb_typeof(s->'sequence')='array' THEN jsonb_array_length(s->'sequence') NOT BETWEEN 1 AND 10 ELSE true END)
   OR s->'sequence' IS DISTINCT FROM cfg->'sequence' THEN RETURN '{"error":"INVALID_SCOPE","http_status":400}';END IF;
  ends:=(s->>'end_at')::timestamptz;IF ends IS NULL OR ends<=clock_timestamp() THEN RETURN '{"error":"SCOPE_EXPIRED","http_status":409}';END IF;
  n:=0;FOR seq IN SELECT value FROM jsonb_array_elements(s->'sequence') LOOP
   n:=n+1;IF seq->>'step' IS DISTINCT FROM n::text OR seq->>'channel' IS DISTINCT FROM 'email' OR coalesce(seq->>'delay_days','') !~ '^([0-9]|[1-5][0-9]|60)$' OR (n=1 AND seq->>'delay_days'<>'0') THEN RETURN '{"error":"INVALID_SEQUENCE","http_status":400}';END IF;
  END LOOP;
  IF s->'sender_binding' IS DISTINCT FROM jsonb_build_object('connection_id',cfg#>'{sender_connection,connection_id}','version',cfg#>'{sender_connection,version}','provider',cfg#>'{sender_connection,provider}','email',cfg#>'{email_dispatch,sender_email}','credential_ref',cfg#>'{email_dispatch,credential_ref}') THEN RETURN '{"error":"SENDER_CHANGED","http_status":409}';END IF;
  IF coalesce(cfg#>>'{sender_connection,provider}','') NOT IN ('gmail','smtp') OR nullif(cfg#>>'{sender_connection,connection_id}','') IS NULL THEN RETURN '{"error":"MANAGED_SENDER_REQUIRED","http_status":409}';END IF;
  gate:=CASE WHEN cfg#>>'{sender_connection,provider}'='smtp' THEN sender_connection_smtp_gate(p_org,cfg) ELSE sender_connection_gate(p_org,cfg) END;
  IF gate->>'allowed' IS DISTINCT FROM 'true' OR cfg#>>'{email_dispatch,enabled}' IS DISTINCT FROM 'true' THEN RETURN '{"error":"SENDER_NOT_READY","http_status":409}';END IF;
  IF (cfg#>>'{email_dispatch,daily_limit}')::integer>10 OR (cfg#>>'{email_dispatch,mailbox_rolling_limit}')::integer>10 OR (cfg#>>'{email_dispatch,min_interval_seconds}')::integer<300 THEN RETURN '{"error":"BOUNDED_LIMITS_REQUIRED","http_status":409}';END IF;
  IF (SELECT count(*)<>count(DISTINCT value->>'plan_id') FROM jsonb_array_elements(s->'plans')) THEN RETURN '{"error":"DUPLICATE_PLAN","http_status":400}';END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(s->'plans') LOOP
   IF coalesce(item->>'plan_id','') !~ '^[1-9][0-9]{0,18}$' THEN RETURN '{"error":"INVALID_PLAN","http_status":400}';END IF;
   SELECT * INTO plan FROM strategy_plans WHERE org_id=p_org AND id=(item->>'plan_id')::bigint AND campaign_id=c.id AND campaign_version=c.version FOR SHARE;
   IF NOT FOUND OR plan.content_hash IS DISTINCT FROM item->>'content_hash' OR plan.content_hash IS DISTINCT FROM md5(plan.body::text) OR plan.expires_at<ends
    OR plan.fingerprint IS DISTINCT FROM strategy_context(p_org,c.id,plan.lead_id)->>'fingerprint'
    OR plan.body#>'{artifacts,schedule,sequence}' IS DISTINCT FROM cfg->'sequence'
    OR NOT EXISTS(SELECT 1 FROM cleaned_leads WHERE org_id=p_org AND id=plan.lead_id AND email=item->>'recipient') THEN RETURN '{"error":"PLAN_CHANGED","http_status":409}';END IF;
   IF NOT EXISTS(SELECT 1 FROM (SELECT action,content_hash FROM strategy_approvals WHERE org_id=p_org AND plan_id=plan.id ORDER BY id DESC LIMIT 1)a WHERE action='approve' AND content_hash=plan.content_hash) THEN RETURN '{"error":"PLAN_APPROVAL_REQUIRED","http_status":409}';END IF;
   FOR seq IN SELECT value FROM jsonb_array_elements(cfg->'sequence') WHERE value->>'step'<>'1' LOOP
    SELECT value INTO d FROM jsonb_array_elements(CASE WHEN jsonb_typeof(plan.body#>'{artifacts,followup_drafts}')='array' THEN plan.body#>'{artifacts,followup_drafts}' ELSE '[]'::jsonb END) WHERE value->>'step'=seq->>'step' LIMIT 1;
    IF d IS NULL OR d->>'channel' IS DISTINCT FROM 'email' OR d->>'delay_days' IS DISTINCT FROM seq->>'delay_days' OR nullif(d->>'subject','') IS NULL OR nullif(d->>'body','') IS NULL OR d->>'status' IS DISTINCT FROM 'requires_plan_approval_and_execution_checks' THEN RETURN '{"error":"APPROVED_FOLLOWUP_REQUIRED","http_status":409}';END IF;
   END LOOP;
  END LOOP;
  r:=jsonb_build_object('revision',revision+1,'status','approved','scope',s,'scope_hash',md5(s::text),'actor_subject',p_subject,'approved_at',clock_timestamp());
 END IF;
 UPDATE strategy_campaign_versions SET config=jsonb_set(config,'{_email_execution}',r,true) WHERE org_id=p_org AND campaign_id=c.id AND version=c.version;
 RETURN jsonb_build_object('org_id',p_org,'campaign_id',c.id,'campaign_version',c.version,'revision',r->'revision','status',r->'status','scope_hash',r->'scope_hash','execution_authorized',false,'http_status',200);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_datetime_format OR datetime_field_overflow THEN RETURN '{"error":"INVALID_REQUEST","http_status":400}';
END $$;
REVOKE ALL ON FUNCTION email_campaign_authority_manage(integer,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION email_campaign_authority_manage(integer,text,jsonb) TO n8n_user;
COMMIT;
