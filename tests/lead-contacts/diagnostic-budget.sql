\set ON_ERROR_STOP on
BEGIN;
DO $$ DECLARE a bigint;b numeric;BEGIN
 ASSERT current_database()='lead_gathering_test_20260926';
 SELECT id INTO a FROM gathering_accounts WHERE mode='platform';b:=gathering_account_spent(a);
 INSERT INTO apify_diagnostic_runs(reference,provider_account_id,actor_id,input,max_cost_usd) VALUES('test-budget',a,'fixture','{}',0.1);
 ASSERT gathering_account_spent(a)=b+0.1;
 UPDATE apify_diagnostic_runs SET actual_cost_usd=0.04 WHERE reference='test-budget';
 ASSERT gathering_account_spent(a)=b+0.04;
 RAISE NOTICE 'PASS: diagnostic reservation and actual costs counted in platform budget';
END $$;
ROLLBACK;
