BEGIN;
CREATE TABLE IF NOT EXISTS strategy_campaigns(id bigserial PRIMARY KEY,org_id integer NOT NULL REFERENCES organizations(id),version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(org_id,id));
CREATE TABLE IF NOT EXISTS strategy_campaign_versions(org_id integer NOT NULL,campaign_id bigint NOT NULL,version integer NOT NULL,config jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(org_id,campaign_id,version),FOREIGN KEY(org_id,campaign_id) REFERENCES strategy_campaigns(org_id,id));
CREATE TABLE IF NOT EXISTS strategy_controls(id boolean PRIMARY KEY DEFAULT true CHECK(id),enabled boolean NOT NULL DEFAULT false);
INSERT INTO strategy_controls(id) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS strategy_jobs(id bigserial PRIMARY KEY,org_id integer NOT NULL, campaign_id bigint NOT NULL,campaign_version integer NOT NULL,lead_id integer NOT NULL REFERENCES cleaned_leads(id),request_id text NOT NULL,status text NOT NULL DEFAULT 'pending',attempts integer NOT NULL DEFAULT 0,lease text,lease_until timestamptz,next_attempt timestamptz NOT NULL DEFAULT now(),fingerprint text,error text,created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,UNIQUE(org_id,request_id),UNIQUE(org_id,id),FOREIGN KEY(org_id,campaign_id,campaign_version) REFERENCES strategy_campaign_versions(org_id,campaign_id,version));
CREATE INDEX IF NOT EXISTS strategy_pending ON strategy_jobs(status,next_attempt,id);
ALTER TABLE strategy_jobs ADD COLUMN IF NOT EXISTS execution_id text;
CREATE TABLE IF NOT EXISTS strategy_plans(id bigserial PRIMARY KEY,org_id integer NOT NULL,job_id bigint NOT NULL,campaign_id bigint NOT NULL,campaign_version integer NOT NULL,lead_id integer NOT NULL,body jsonb NOT NULL,fingerprint text NOT NULL,content_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,UNIQUE(org_id,id),UNIQUE(job_id),FOREIGN KEY(org_id,job_id) REFERENCES strategy_jobs(org_id,id));
CREATE TABLE IF NOT EXISTS strategy_approvals(id bigserial PRIMARY KEY,org_id integer NOT NULL,plan_id bigint NOT NULL,action text NOT NULL CHECK(action IN ('approve','revoke')),actor text NOT NULL,content_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(org_id,plan_id) REFERENCES strategy_plans(org_id,id));
CREATE TABLE IF NOT EXISTS strategy_ai_controls(org_id integer PRIMARY KEY REFERENCES organizations(id),enabled boolean NOT NULL DEFAULT false,monthly_limit integer NOT NULL DEFAULT 0 CHECK(monthly_limit BETWEEN 0 AND 10000));
CREATE TABLE IF NOT EXISTS strategy_ai_requests(lease text PRIMARY KEY,org_id integer NOT NULL,job_id bigint NOT NULL,reserved_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,status text,usage jsonb,FOREIGN KEY(org_id,job_id) REFERENCES strategy_jobs(org_id,id));

CREATE OR REPLACE FUNCTION strategy_campaign_save(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE o integer:=(p->>'org_id')::integer;c strategy_campaigns%ROWTYPE;v jsonb:=p->'config';
BEGIN
 IF NOT EXISTS(SELECT 1 FROM organizations WHERE id=o AND status='active') THEN RETURN '{"error":"ORG_NOT_FOUND","http_status":404}';END IF;
 IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR nullif(v->>'name','') IS NULL OR nullif(v->'offer'->>'description','') IS NULL OR nullif(v->'cta'->>'text','') IS NULL OR v->>'mode' NOT IN ('template','hybrid','ai') OR jsonb_typeof(v->'channels') IS DISTINCT FROM 'array' THEN RETURN '{"error":"INVALID_CAMPAIGN","http_status":400}';END IF;
 IF p->>'campaign_id' IS NULL THEN INSERT INTO strategy_campaigns(org_id) VALUES(o) RETURNING * INTO c;
 ELSE
 SELECT * INTO c FROM strategy_campaigns WHERE org_id=o AND id=(p->>'campaign_id')::bigint FOR UPDATE;
 IF NOT FOUND THEN RETURN '{"error":"NOT_FOUND","http_status":404}';END IF;
 IF (p->>'expected_version')::integer IS DISTINCT FROM c.version THEN RETURN '{"error":"VERSION_CONFLICT","http_status":409}';END IF;
 UPDATE strategy_campaigns SET version=version+1 WHERE id=c.id RETURNING * INTO c;
 END IF;
 INSERT INTO strategy_campaign_versions(org_id,campaign_id,version,config) VALUES(o,c.id,c.version,v);
 INSERT INTO strategy_ai_controls(org_id) VALUES(o) ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('campaign_id',c.id,'org_id',o,'version',c.version,'http_status',200);
END $$;

CREATE OR REPLACE FUNCTION strategy_context(p_org integer,p_campaign bigint,p_lead integer) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE c strategy_campaigns%ROWTYPE;cfg jsonb;l cleaned_leads%ROWTYPE;r jsonb;result jsonb;stopped boolean;answered boolean;
BEGIN
 SELECT * INTO c FROM strategy_campaigns WHERE org_id=p_org AND id=p_campaign;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM organizations WHERE id=p_org AND status='active') THEN RETURN NULL;END IF;
 SELECT config INTO cfg FROM strategy_campaign_versions WHERE org_id=p_org AND campaign_id=c.id AND version=c.version;
 SELECT * INTO l FROM cleaned_leads WHERE id=p_lead AND org_id=p_org;IF NOT FOUND THEN RETURN NULL;END IF;
 r:=enrichment_report(p_org,p_lead);IF r IS NULL OR r->'trust' IS NULL THEN RETURN NULL;END IF;
 SELECT EXISTS(SELECT 1 FROM unsubscribes WHERE lower(email)=lower(l.email)) INTO stopped;
 SELECT EXISTS(SELECT 1 FROM outreach_activities WHERE lead_id=p_lead AND org_id=p_org AND replied_at IS NOT NULL) INTO answered;
 result:=jsonb_build_object('org_id',p_org,'campaign',jsonb_build_object('id',c.id,'version',c.version,'config',cfg),
 'lead',jsonb_build_object('id',l.id,'org_id',l.org_id,'company_name',l.company_name,'category',l.category,'city',l.city,'email',l.email,'phone',l.phone,'website',l.website),
 'report',jsonb_build_object('basic',r->'basic','research',r->'research','outreach_context',r->'outreach_context','trust',(r->'trust')-'evaluated_at'),'suppressed',stopped,'replied',answered);
 RETURN result||jsonb_build_object('fingerprint',md5(result::text));
END $$;

CREATE OR REPLACE FUNCTION strategy_enqueue(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE x jsonb;j strategy_jobs%ROWTYPE;o integer:=(p->>'org_id')::integer;k text:=p->>'request_id';
BEGIN
 IF k IS NULL OR length(k) NOT BETWEEN 8 AND 120 THEN RETURN '{"error":"REQUEST_ID_REQUIRED","http_status":400}';END IF;
 PERFORM id FROM organizations WHERE id=o FOR UPDATE;
 x:=strategy_context(o,(p->>'campaign_id')::bigint,(p->>'lead_id')::integer);IF x IS NULL THEN RETURN '{"error":"NOT_FOUND","http_status":404}';END IF;
 SELECT * INTO j FROM strategy_jobs WHERE org_id=o AND request_id=k;
 IF FOUND THEN
 IF j.campaign_id<>(p->>'campaign_id')::bigint OR j.lead_id<>(p->>'lead_id')::integer OR j.campaign_version<>(x->'campaign'->>'version')::integer THEN RETURN '{"error":"REQUEST_ID_CONFLICT","http_status":409}';END IF;
 RETURN jsonb_build_object('job_id',j.id,'org_id',o,'status',j.status,'replayed',true,'http_status',202);END IF;
 IF (SELECT count(*) FROM strategy_jobs WHERE org_id=o AND status IN ('pending','processing'))>=100 THEN RETURN '{"error":"QUEUE_FULL","http_status":429}';END IF;
 INSERT INTO strategy_jobs(org_id,campaign_id,campaign_version,lead_id,request_id,fingerprint) VALUES(o,(p->>'campaign_id')::bigint,(x->'campaign'->>'version')::integer,(p->>'lead_id')::integer,k,x->>'fingerprint') ON CONFLICT DO NOTHING RETURNING * INTO j;
 RETURN jsonb_build_object('job_id',j.id,'org_id',o,'status',j.status,'http_status',202);
END $$;

CREATE OR REPLACE FUNCTION strategy_enqueue_batch(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE lead jsonb;results jsonb:='[]';r jsonb;
BEGIN
 IF jsonb_typeof(p->'lead_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'lead_ids') NOT BETWEEN 1 AND 100 OR length(coalesce(p->>'request_id','')) NOT BETWEEN 8 AND 80 THEN RETURN '{"error":"INVALID_BATCH","http_status":400}';END IF;
 FOR lead IN SELECT value FROM jsonb_array_elements(p->'lead_ids') LOOP
  r:=strategy_enqueue(jsonb_build_object('org_id',p->'org_id','campaign_id',p->'campaign_id','lead_id',lead,'request_id',(p->>'request_id')||':'||lead::text));results:=results||jsonb_build_array(r);
 END LOOP;
 RETURN jsonb_build_object('http_status',202,'results',results,'note','Each result has its own admission status; no sending authorized');
END $$;

CREATE OR REPLACE FUNCTION strategy_claim(p_execution text,p_limit integer DEFAULT 2) RETURNS SETOF jsonb LANGUAGE plpgsql AS $$
DECLARE j strategy_jobs%ROWTYPE;x jsonb;
BEGIN
 IF NOT (SELECT enabled FROM strategy_controls WHERE id) THEN RETURN;END IF;
 UPDATE strategy_jobs SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'pending' END,lease=NULL,lease_until=NULL,error='lease_expired',next_attempt=now()+interval '1 minute' WHERE status='processing' AND lease_until<now();
 FOR j IN SELECT * FROM strategy_jobs WHERE status='pending' AND next_attempt<=now() AND attempts<3 ORDER BY next_attempt,id LIMIT least(greatest(p_limit,1),5) FOR UPDATE SKIP LOCKED LOOP
  x:=strategy_context(j.org_id,j.campaign_id,j.lead_id);
  IF x IS NULL OR (x->'campaign'->>'version')::integer<>j.campaign_version THEN UPDATE strategy_jobs SET status='superseded',error='input_unavailable_or_campaign_changed' WHERE id=j.id;CONTINUE;END IF;
  UPDATE strategy_jobs SET status='processing',attempts=attempts+1,lease=md5(random()::text||clock_timestamp()::text||id),lease_until=now()+interval '5 minutes',fingerprint=x->>'fingerprint',error=NULL,execution_id=p_execution WHERE id=j.id RETURNING * INTO j;
  RETURN NEXT jsonb_build_object('id',j.id,'org_id',j.org_id,'lease',j.lease,'input',x,'execution',p_execution);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION strategy_ai_gate(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE j strategy_jobs%ROWTYPE;cfg strategy_ai_controls%ROWTYPE;
BEGIN
 SELECT * INTO j FROM strategy_jobs WHERE id=(p->>'id')::bigint AND org_id=(p->>'org_id')::integer AND lease=p->>'lease' AND status='processing' AND lease_until>now();
 IF NOT FOUND THEN RETURN '{"allowed":false,"reason":"stale_lease"}';END IF;
 IF p->>'wants_ai' IS DISTINCT FROM 'true' THEN RETURN '{"allowed":false,"reason":"template_or_insufficient_evidence"}';END IF;
 PERFORM pg_advisory_xact_lock(606015);
 SELECT * INTO cfg FROM strategy_ai_controls WHERE org_id=j.org_id FOR UPDATE;
 IF NOT FOUND OR NOT cfg.enabled OR cfg.monthly_limit=0 THEN RETURN '{"allowed":false,"reason":"ai_disabled"}';END IF;
 IF (SELECT count(*) FROM strategy_ai_requests WHERE org_id=j.org_id AND reserved_at>=date_trunc('month',now()))>=cfg.monthly_limit THEN RETURN '{"allowed":false,"reason":"monthly_limit"}';END IF;
 IF EXISTS(SELECT 1 FROM strategy_ai_requests WHERE reserved_at>now()-interval '65 seconds') OR EXISTS(SELECT 1 FROM enrichment_ai_requests WHERE reserved_at>now()-interval '65 seconds') THEN RETURN '{"allowed":false,"reason":"rate_limit"}';END IF;
 IF (SELECT count(*) FROM strategy_ai_requests WHERE reserved_at>=date_trunc('day',now()))>=20 THEN RETURN '{"allowed":false,"reason":"daily_limit"}';END IF;
 INSERT INTO strategy_ai_requests(lease,org_id,job_id) VALUES(j.lease,j.org_id,j.id) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RETURN '{"allowed":false,"reason":"already_reserved"}';END IF;
 RETURN '{"allowed":true}';
END $$;

CREATE OR REPLACE FUNCTION strategy_finish(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE j strategy_jobs%ROWTYPE;x jsonb;b jsonb:=p->'plan';v strategy_plans%ROWTYPE;
BEGIN
 SELECT * INTO j FROM strategy_jobs WHERE id=(p->>'id')::bigint AND org_id=(p->>'org_id')::integer FOR UPDATE;
 IF NOT FOUND THEN RETURN '{"saved":false,"reason":"not_found"}';END IF;
 IF j.status='completed' AND j.lease=p->>'lease' THEN SELECT * INTO v FROM strategy_plans WHERE job_id=j.id;RETURN jsonb_build_object('saved',true,'plan_id',v.id,'replayed',true);END IF;
 IF j.status<>'processing' OR j.lease IS DISTINCT FROM p->>'lease' OR j.lease_until<=now() THEN RETURN '{"saved":false,"reason":"stale_lease"}';END IF;
 UPDATE strategy_ai_requests SET finished_at=now(),status=p->>'ai_status',usage=p->'usage' WHERE lease=j.lease AND finished_at IS NULL;
 x:=strategy_context(j.org_id,j.campaign_id,j.lead_id);
 IF x IS NULL OR x->>'fingerprint' IS DISTINCT FROM j.fingerprint THEN UPDATE strategy_jobs SET status='superseded',error='input_changed',finished_at=now() WHERE id=j.id;RETURN '{"saved":false,"reason":"input_changed"}';END IF;
 IF b->>'version' IS DISTINCT FROM 'strategy_v1' OR b->>'execution_authorized' IS DISTINCT FROM 'false' OR jsonb_typeof(b->'messages') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid strategy output';END IF;
 INSERT INTO strategy_plans(org_id,job_id,campaign_id,campaign_version,lead_id,body,fingerprint,content_hash,expires_at) VALUES(j.org_id,j.id,j.campaign_id,j.campaign_version,j.lead_id,b,j.fingerprint,md5(b::text),now()+make_interval(days=>(x->'campaign'->'config'->>'expiry_days')::integer)) RETURNING * INTO v;
 UPDATE strategy_jobs SET status='completed',finished_at=now(),lease_until=NULL WHERE id=j.id;
 RETURN jsonb_build_object('saved',true,'plan_id',v.id,'content_hash',v.content_hash,'status','draft');
END $$;

CREATE OR REPLACE FUNCTION strategy_report(p_org integer,p_job bigint) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE j strategy_jobs%ROWTYPE;v strategy_plans%ROWTYPE;a strategy_approvals%ROWTYPE;x jsonb;fresh boolean;
BEGIN
 SELECT * INTO j FROM strategy_jobs WHERE org_id=p_org AND id=p_job;IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO v FROM strategy_plans WHERE job_id=j.id AND org_id=p_org;
 IF FOUND THEN SELECT * INTO a FROM strategy_approvals WHERE org_id=p_org AND plan_id=v.id ORDER BY id DESC LIMIT 1;END IF;
 x:=strategy_context(p_org,j.campaign_id,j.lead_id);fresh:=x IS NOT NULL AND v.fingerprint=x->>'fingerprint' AND v.expires_at>now();
 RETURN jsonb_build_object('org_id',p_org,'job_id',j.id,'job_status',j.status,'error',j.error,'plan_id',v.id,'plan',v.body,'content_hash',v.content_hash,'expires_at',v.expires_at,'current',coalesce(fresh,false),'approval',coalesce(a.action,'unreviewed'),'execution_authorized',false,'executor_contract','requires_new_integration_and_send_time_recheck');
END $$;

CREATE OR REPLACE FUNCTION strategy_approval(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v strategy_plans%ROWTYPE;x jsonb;
BEGIN
 IF p->>'action' NOT IN ('approve','revoke') OR nullif(p->>'actor','') IS NULL THEN RETURN '{"error":"INVALID_APPROVAL","http_status":400}';END IF;
 SELECT * INTO v FROM strategy_plans WHERE org_id=(p->>'org_id')::integer AND id=(p->>'plan_id')::bigint FOR UPDATE;
 IF NOT FOUND THEN RETURN '{"error":"NOT_FOUND","http_status":404}';END IF;
 IF p->>'content_hash' IS DISTINCT FROM v.content_hash THEN RETURN '{"error":"CONTENT_CHANGED","http_status":409}';END IF;
 x:=strategy_context(v.org_id,v.campaign_id,v.lead_id);
 IF p->>'action'='approve' AND (x IS NULL OR v.fingerprint IS DISTINCT FROM x->>'fingerprint' OR v.expires_at<=now()) THEN RETURN '{"error":"STALE_PLAN","http_status":409}';END IF;
 IF p->>'action'='approve' AND (jsonb_array_length(v.body->'validation_errors')>0 OR jsonb_array_length(v.body->'blocking_reasons')>0) THEN RETURN '{"error":"PLAN_NEEDS_CORRECTION","http_status":409}';END IF;
 INSERT INTO strategy_approvals(org_id,plan_id,action,actor,content_hash) VALUES(v.org_id,v.id,p->>'action',left(p->>'actor',200),v.content_hash);
 RETURN jsonb_build_object('approved_content',p->>'action'='approve','execution_authorized',false,'http_status',200);
END $$;

CREATE OR REPLACE FUNCTION strategy_fail(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
 UPDATE strategy_jobs SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'pending' END,error=left(p->>'message',300),lease_until=NULL,next_attempt=now()+interval '5 minutes'
 WHERE status='processing' AND ((lease=p->>'lease' AND org_id=(p->>'org_id')::integer AND id=(p->>'id')::bigint) OR (execution_id=p->>'execution_id' AND nullif(p->>'execution_id','') IS NOT NULL));
 RETURN jsonb_build_object('handled',FOUND);
END $$;
REVOKE ALL ON FUNCTION strategy_campaign_save(jsonb),strategy_context(integer,bigint,integer),strategy_enqueue(jsonb),strategy_enqueue_batch(jsonb),strategy_claim(text,integer),strategy_ai_gate(jsonb),strategy_finish(jsonb),strategy_report(integer,bigint),strategy_approval(jsonb),strategy_fail(jsonb) FROM PUBLIC;
COMMIT;
