-- Permit verified same-provider key renewal while preserving unresolved runs,
-- account identity, disabled state, limits and accounting. No search is resumed.
BEGIN;
CREATE OR REPLACE FUNCTION gathering_connect_byok(p_org integer,p_key text,p_provider_user text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a gathering_accounts%ROWTYPE;
BEGIN
 IF coalesce(p_key,'') !~ '^apify_api_[A-Za-z0-9]+$' OR nullif(p_provider_user,'') IS NULL OR length(p_provider_user)>200 THEN
  RETURN jsonb_build_object('success',false,'code','INVALID_PROVIDER_CONNECTION','http_status',400);
 END IF;
 PERFORM pg_advisory_xact_lock(49302811);
 SELECT * INTO a FROM gathering_accounts WHERE mode='byok' AND org_id=p_org FOR UPDATE;
 PERFORM 1 FROM organizations WHERE id=p_org AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'code','ORG_NOT_READY','http_status',409); END IF;
 IF EXISTS(SELECT 1 FROM gathering_accounts WHERE provider_user_id=p_provider_user AND id IS DISTINCT FROM a.id) THEN RETURN jsonb_build_object('success',false,'code','PROVIDER_ACCOUNT_ALREADY_LINKED','http_status',409); END IF;
 -- The connect-apify workflow verifies this provider identity using the new key.
 -- Renewing access to the same account must not require discarding unknown cost.
 IF a.id IS NOT NULL AND a.provider_user_id=p_provider_user THEN
  UPDATE gathering_accounts SET api_key=p_key WHERE id=a.id;
  UPDATE organizations SET apify_api_key=p_key,updated_at=now() WHERE id=p_org;
  RETURN jsonb_build_object('success',true,'org_id',p_org,'billing_mode','byok','key_rotated',true,'enabled',a.enabled,'http_status',200);
 END IF;
 IF EXISTS(SELECT 1 FROM scraping_jobs WHERE provider_account_id=a.id AND (status IN ('queued','pending','running','needs_review') OR (actual_cost IS NULL AND apify_actor_run_id IS NOT NULL))) THEN RETURN jsonb_build_object('success',false,'code','ACCOUNT_HAS_UNSETTLED_JOBS','http_status',409); END IF;
 INSERT INTO gathering_accounts(mode,org_id,provider_user_id,api_key,enabled,monthly_budget_usd)
  SELECT 'byok',p_org,p_provider_user,p_key,true,greatest(coalesce(monthly_credit_limit,0),0) FROM organizations WHERE id=p_org
 ON CONFLICT(org_id) DO UPDATE SET provider_user_id=excluded.provider_user_id,api_key=excluded.api_key,enabled=true;
 UPDATE organizations SET apify_api_key=p_key,apify_status='active',updated_at=now() WHERE id=p_org;
 RETURN jsonb_build_object('success',true,'org_id',p_org,'billing_mode','byok','http_status',200);
END $$;
COMMIT;
