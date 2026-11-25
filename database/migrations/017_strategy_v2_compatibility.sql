-- Tested in scratch_strategy_v2_20261012 and fresh snapshot scratch_v2_release_20261014.
-- Applied to local Docker lead_db on 2026-10-14 for draft-only 06C rollout; see DEPLOYMENT-20261014.md.
-- No table, webhook, budget, claim algorithm or authoritative hash changes.
BEGIN;

-- Read-only validation of an existing reservation. Never call strategy_ai_gate twice to recheck.
CREATE OR REPLACE FUNCTION strategy_reservation_context(p jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE j strategy_jobs%ROWTYPE; cfg strategy_ai_controls%ROWTYPE; x jsonb;
BEGIN
 SELECT * INTO j FROM strategy_jobs
 WHERE id=(p->>'id')::bigint AND org_id=(p->>'org_id')::integer
 AND lease=p->>'lease' AND status='processing' AND lease_until>now();
 IF NOT FOUND THEN RETURN '{"allowed":false,"reason":"stale_lease"}'; END IF;
 IF NOT coalesce((SELECT enabled FROM strategy_controls WHERE id),false) THEN RETURN '{"allowed":false,"reason":"planner_disabled"}'; END IF;
 SELECT * INTO cfg FROM strategy_ai_controls WHERE org_id=j.org_id;
 IF NOT FOUND OR NOT cfg.enabled OR cfg.monthly_limit=0 THEN RETURN '{"allowed":false,"reason":"ai_disabled"}'; END IF;
 IF NOT EXISTS(SELECT 1 FROM strategy_ai_requests WHERE lease=j.lease AND org_id=j.org_id AND job_id=j.id AND finished_at IS NULL AND reserved_at>=date_trunc('month',now())) THEN RETURN '{"allowed":false,"reason":"reservation_unavailable"}'; END IF;
 IF (SELECT count(*) FROM strategy_ai_requests WHERE org_id=j.org_id AND reserved_at>=date_trunc('month',now()))>cfg.monthly_limit THEN RETURN '{"allowed":false,"reason":"limit_reduced"}'; END IF;
 x:=strategy_context(j.org_id,j.campaign_id,j.lead_id);
 IF x IS NULL OR x->>'fingerprint' IS DISTINCT FROM j.fingerprint OR p->>'fingerprint' IS DISTINCT FROM j.fingerprint THEN RETURN '{"allowed":false,"reason":"input_changed"}'; END IF;
 RETURN jsonb_build_object('allowed',true,'reservation',j.lease,'lease_until',j.lease_until,'fingerprint',j.fingerprint,'repair_allowed',false);
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
 IF b->>'execution_authorized' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Invalid strategy output';END IF;
 IF b->>'version'='strategy_v1' THEN
  IF jsonb_typeof(b->'messages') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid v1 strategy';END IF;
 ELSIF b->>'version'='strategy_v2' THEN
  IF coalesce(b->>'state','') NOT IN ('ai_completed','ai_failed','template_completed','template_fallback')
   OR jsonb_typeof(b->'validation_errors') IS DISTINCT FROM 'array'
   OR jsonb_typeof(b->'blocking_reasons') IS DISTINCT FROM 'array'
   OR b->>'approval_required' IS DISTINCT FROM 'true'
   OR jsonb_typeof(b->'generation') IS DISTINCT FROM 'object'
   OR b->>'fallback_acknowledgement_required' IS DISTINCT FROM ((b->>'state'='template_fallback')::text)
  THEN RAISE EXCEPTION 'Invalid v2 strategy';END IF;
  IF b->>'state'='ai_failed' THEN
   IF b->'strategy' IS DISTINCT FROM 'null'::jsonb OR jsonb_array_length(b->'validation_errors')=0 THEN RAISE EXCEPTION 'Invalid failed strategy';END IF;
  ELSIF jsonb_typeof(b->'strategy') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Missing strategy';END IF;
 ELSE RAISE EXCEPTION 'Unknown strategy version';END IF;
 INSERT INTO strategy_plans(org_id,job_id,campaign_id,campaign_version,lead_id,body,fingerprint,content_hash,expires_at) VALUES(j.org_id,j.id,j.campaign_id,j.campaign_version,j.lead_id,b,j.fingerprint,md5(b::text),now()+make_interval(days=>(x->'campaign'->'config'->>'expiry_days')::integer)) RETURNING * INTO v;
 UPDATE strategy_jobs SET status='completed',finished_at=now(),lease_until=NULL WHERE id=j.id;
 RETURN jsonb_build_object('saved',true,'plan_id',v.id,'content_hash',v.content_hash,'status','draft');
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
 IF p->>'action'='approve' THEN
  IF (CASE WHEN jsonb_typeof(v.body->'validation_errors')='array' THEN jsonb_array_length(v.body->'validation_errors')>0 ELSE true END)
   OR (CASE WHEN jsonb_typeof(v.body->'blocking_reasons')='array' THEN jsonb_array_length(v.body->'blocking_reasons')>0 ELSE true END)
  THEN RETURN '{"error":"PLAN_NEEDS_CORRECTION","http_status":409}';END IF;
  IF v.body->>'version'='strategy_v2' THEN
   IF v.body->>'state'='ai_failed' THEN RETURN '{"error":"AI_FAILED","http_status":409}';END IF;
   IF v.body->>'state'='template_fallback' OR v.body->>'fallback_acknowledgement_required'='true' THEN
    IF p->>'acknowledge_fallback' IS DISTINCT FROM 'true' OR p->>'acknowledge_fallback_hash' IS DISTINCT FROM v.content_hash THEN RETURN '{"error":"FALLBACK_ACK_REQUIRED","http_status":409}';END IF;
   END IF;
  END IF;
 END IF;
 INSERT INTO strategy_approvals(org_id,plan_id,action,actor,content_hash) VALUES(v.org_id,v.id,p->>'action',left(p->>'actor',200),v.content_hash);
 RETURN jsonb_build_object('approved_content',p->>'action'='approve','execution_authorized',false,'http_status',200);
END $$;

REVOKE ALL ON FUNCTION strategy_reservation_context(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION strategy_reservation_context(jsonb),strategy_finish(jsonb),strategy_approval(jsonb) TO n8n_user;
COMMIT;
