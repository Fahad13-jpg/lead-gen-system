\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE s integer;l integer;a bigint;j bigint;r jsonb;
BEGIN
 ASSERT current_database()='lead_gathering_test_20260926';
 INSERT INTO organizations(id,org_name,status) VALUES(940062,'LinkedIn budget fixture','active');
 INSERT INTO staging_leads(org_id,company_name,source,cleaning_status,raw_data) VALUES(940062,'Clinic','google_maps','cleaned','{}') RETURNING id INTO s;
 INSERT INTO cleaned_leads(org_id,staging_id,company_name) VALUES(940062,s,'Clinic') RETURNING id INTO l;
 INSERT INTO cleaning_links(staging_id,org_id,cleaned_id) VALUES(s,940062,l);
 INSERT INTO gathering_accounts(mode,org_id,provider_user_id,api_key,enabled,monthly_budget_usd) VALUES('byok',940062,'fixture-linkedin','fixture-never-network',true,5) RETURNING id INTO a;
 INSERT INTO enrichment_linkedin_policy(org_id,enabled,account_id) VALUES(940062,true,a);
 INSERT INTO enrichment_linkedin_jobs(org_id,lead_id,staging_id,fingerprint,kind,target,actor,input) VALUES(940062,l,s,enrichment_fingerprint(940062,l,'basic'),'company','Clinic','fixture','{}') RETURNING id INTO j;
 UPDATE enrichment_linkedin_controls SET enabled=false;
 ASSERT enrichment_linkedin_reserve(j)->>'ready'='false';
 UPDATE enrichment_linkedin_controls SET enabled=true,monthly_cap_usd=0;
 ASSERT enrichment_linkedin_reserve(j)->>'ready'='false';
 UPDATE enrichment_linkedin_controls SET monthly_cap_usd=0.50;
 r:=enrichment_linkedin_reserve(j);ASSERT r->>'ready'='true';
 ASSERT enrichment_linkedin_reserve(j)->>'ready'='false';
 ASSERT gathering_account_spent(a)=0.05;
 PERFORM enrichment_linkedin_settle(j,0.014);PERFORM enrichment_linkedin_settle(j,0.014);
 ASSERT gathering_account_spent(a)=0.014;
 RAISE NOTICE 'PASS LinkedIn opt-in, sub-limit, shared reservation, duplicate guard and idempotent settlement';
END $$;
ROLLBACK;
