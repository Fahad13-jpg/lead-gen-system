\set ON_ERROR_STOP on
-- This file is ONLY for lead_gathering_test_20260926, never the production database.
DO $$ BEGIN IF current_database()<>'lead_gathering_test_20260926' THEN RAISE EXCEPTION 'Test database required'; END IF; END $$;
UPDATE gathering_accounts SET api_key='apify_api_TESTPLATFORM',enabled=true,monthly_budget_usd=5,max_concurrent=2 WHERE mode='platform';
UPDATE gathering_accounts SET api_key='apify_api_TEST',enabled=true,monthly_budget_usd=100 WHERE org_id=900001;
SELECT gathering_wallet_credit(900001,10,'simulated_wallet_payment_001');
