\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE sid integer;lid integer;j bigint;a bigint;r jsonb;before_cost numeric;before_wallet numeric;
BEGIN
 ASSERT current_database()='lead_gathering_test_20260926';
 INSERT INTO organizations(id,org_name,status) VALUES(940040,'Social budget fixture','active');
 INSERT INTO staging_leads(org_id,company_name,source,cleaning_status) VALUES(940040,'Fixture','google_maps','cleaned') RETURNING id INTO sid;
 INSERT INTO cleaned_leads(org_id,staging_id,company_name,website) VALUES(940040,sid,'Fixture','https://business.example') RETURNING id INTO lid;
 INSERT INTO cleaning_links(staging_id,org_id,cleaned_id) VALUES(sid,940040,lid);
 INSERT INTO contact_social_jobs(org_id,lead_id,staging_id,profile,input_fingerprint) VALUES(940040,lid,sid,'https://www.facebook.com/fixture',contact_input_fingerprint(940040,lid,sid)) RETURNING id INTO j;
 r:=contact_social_reserve(j);ASSERT r->>'ready'='false';ASSERT (SELECT reason FROM contact_social_jobs WHERE id=j)='paid_discovery_disabled';
 SELECT id INTO a FROM gathering_accounts WHERE mode='platform';
 UPDATE gathering_accounts SET enabled=true,api_key='fixture-not-a-key',provider_user_id='fixture-social-account',monthly_budget_usd=100 WHERE id=a;
 INSERT INTO contact_social_policy(org_id,enabled,account_id,monthly_cap_usd) VALUES(940040,true,a,0.10);
 UPDATE contact_social_controls SET enabled=true,monthly_cap_usd=0.10;
 r:=contact_social_reserve(j);ASSERT r->>'ready'='false';ASSERT (SELECT reason FROM contact_social_jobs WHERE id=j)='insufficient_platform_credits';
 INSERT INTO gathering_wallet_entries(org_id,amount_usd,reference) VALUES(940040,0.10,'social-test-funding');
 before_cost:=gathering_account_spent(a);
 r:=contact_social_reserve(j);ASSERT r->>'ready'='true';ASSERT gathering_account_spent(a)=before_cost+0.05;
 r:=contact_social_reserve(j);ASSERT r->>'ready'='false','same paid operation reserved twice';
 PERFORM contact_social_settle(j,0.014);PERFORM contact_social_settle(j,0.014);
 ASSERT gathering_account_spent(a)=before_cost+0.014;
 ASSERT (SELECT sum(amount_usd) FROM gathering_wallet_entries WHERE org_id=940040)=0.086,'wallet settlement not idempotent';
 UPDATE contact_social_jobs SET status='completed' WHERE id=j;
 INSERT INTO contact_social_jobs(org_id,lead_id,staging_id,profile,input_fingerprint) VALUES(940040,lid,sid,'https://www.facebook.com/fixture2',contact_input_fingerprint(940040,lid,sid)) RETURNING id INTO j;
 UPDATE contact_social_controls SET monthly_cap_usd=0.02;
 r:=contact_social_reserve(j);ASSERT r->>'ready'='false';ASSERT (SELECT reason FROM contact_social_jobs WHERE id=j)='discovery_monthly_cap';
 UPDATE cleaned_leads SET website='https://changed.example' WHERE id=lid;
 r:=contact_social_reserve(j);ASSERT r->>'ready'='false';ASSERT (SELECT status FROM contact_social_jobs WHERE id=j)='superseded';
 RAISE NOTICE 'PASS: social opt-in, wallet funding, shared budget reservation, replay, exact cost settlement, sub-cap, stale input';
END $$;
ROLLBACK;
