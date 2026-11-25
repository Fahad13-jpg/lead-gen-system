\set ON_ERROR_STOP on
BEGIN;
INSERT INTO organizations(id,org_name,status,monthly_credit_limit,credits_used)
 VALUES(973001,'BYOK default budget fixture','active',0,0);
DO $$
DECLARE r jsonb; account bigint;
BEGIN
 r:=gathering_connect_byok(973001,'apify_api_FIXTURE','budget-fixture-provider');
 ASSERT (r->>'success')::boolean,'new connection failed';
 SELECT id INTO account FROM gathering_accounts WHERE org_id=973001;
 ASSERT (SELECT monthly_budget_usd=5 FROM gathering_accounts WHERE id=account),'zero platform credit limit blocked BYOK';
 ASSERT (SELECT monthly_credit_limit=0 FROM organizations WHERE id=973001),'platform allowance changed';
 ASSERT NOT EXISTS(SELECT 1 FROM gathering_wallet_entries WHERE org_id=973001),'connection granted platform credits';
 UPDATE gathering_accounts SET monthly_budget_usd=2.5 WHERE id=account;
 PERFORM gathering_connect_byok(973001,'apify_api_ROTATED','budget-fixture-provider');
 ASSERT (SELECT monthly_budget_usd=2.5 FROM gathering_accounts WHERE id=account),'rotation changed custom limit';
 PERFORM gathering_connect_byok(973001,'apify_api_REPLACED','budget-fixture-replacement');
 ASSERT (SELECT monthly_budget_usd=2.5 FROM gathering_accounts WHERE id=account),'replacement changed custom limit';
 UPDATE gathering_accounts SET monthly_budget_usd=0 WHERE id=account;
 PERFORM gathering_connect_byok(973001,'apify_api_ZERO','budget-fixture-replacement');
 ASSERT (SELECT monthly_budget_usd=0 FROM gathering_accounts WHERE id=account),'rotation bypassed explicit zero limit';
 PERFORM gathering_connect_byok(973001,'apify_api_ZEROOTHER','budget-fixture-third');
 ASSERT (SELECT monthly_budget_usd=0 FROM gathering_accounts WHERE id=account),'replacement bypassed explicit zero limit';
END $$;
ROLLBACK;
