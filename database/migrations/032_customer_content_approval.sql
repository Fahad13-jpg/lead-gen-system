-- LOCAL PROPOSAL. Never applied to live. Scratch tests apply inside a rolled-back transaction.
-- Extends the existing hash-bound approval gate; no tables, webhooks or sending authority.
BEGIN;
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
  IF v.body->>'validation_profile'='customer_email_v1'
     OR v.body->'generation'->>'source'='customer_supplied'
     OR v.body->'customer_review'->>'required'='true' THEN
   IF v.body->>'version' IS DISTINCT FROM 'strategy_v2'
      OR v.body->>'validation_profile' IS DISTINCT FROM 'customer_email_v1'
      OR v.body->>'state' IS DISTINCT FROM 'template_completed'
      OR v.body->'generation'->>'source' IS DISTINCT FROM 'customer_supplied'
      OR v.body->'customer_review'->'required' IS DISTINCT FROM 'true'::jsonb
      OR v.body->'customer_review'->>'claim_provenance' IS DISTINCT FROM 'customer_supplied_not_independently_verified'
   THEN RETURN '{"error":"INVALID_CUSTOMER_REVIEW","http_status":409}';END IF;
   -- Boolean true only; the acknowledgement is tied to the authoritative DB hash.
   IF p->'acknowledge_customer_content' IS DISTINCT FROM 'true'::jsonb
      OR p->>'acknowledge_customer_content_hash' IS DISTINCT FROM v.content_hash
   THEN RETURN '{"error":"CUSTOMER_CONTENT_ACK_REQUIRED","http_status":409}';END IF;
  END IF;
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
REVOKE ALL ON FUNCTION strategy_approval(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION strategy_approval(jsonb) TO n8n_user;
COMMIT;
