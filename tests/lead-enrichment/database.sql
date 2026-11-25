\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE s integer;l integer;a jsonb;b jsonb;r jsonb;
BEGIN
 ASSERT current_database()='lead_gathering_test_20260926';
 INSERT INTO organizations(id,org_name,status) VALUES(940060,'Enrichment fixture','active');
 INSERT INTO staging_leads(org_id,company_name,source,cleaning_status,raw_data) VALUES(940060,'Clinic','google_maps','cleaned','{}') RETURNING id INTO s;
 INSERT INTO cleaned_leads(org_id,staging_id,company_name,website) VALUES(940060,s,'Clinic','https://clinic.example') RETURNING id INTO l;
 INSERT INTO cleaning_links(staging_id,org_id,cleaned_id) VALUES(s,940060,l);
 UPDATE enrichment_controls SET enabled=true,lead_ids=ARRAY[l];
 SELECT value INTO a FROM enrichment_claim('basic',1) value;ASSERT a IS NOT NULL;
 ASSERT NOT EXISTS(SELECT 1 FROM enrichment_claim('basic',1));
 ASSERT enrichment_task_input((a->>'id')::bigint,'wrong') IS NULL;
 r:=enrichment_finish(a||'{"status":"complete","result":{"version":"enrichment_v1","status":"complete","services":[]}}');ASSERT r->>'saved'='true';
 ASSERT enrichment_finish(a||'{"status":"complete","result":{"version":"enrichment_v1"}}')->>'saved'='false';
 ASSERT enrichment_report(1,l) IS NULL;
 SELECT value INTO b FROM enrichment_claim('research',1) value;ASSERT b IS NOT NULL;
 UPDATE cleaned_leads SET company_name='Changed Clinic' WHERE id=l;
 ASSERT enrichment_finish(b||'{"status":"complete","result":{"version":"enrichment_v1"}}')->>'reason'='source_changed';
 ASSERT enrichment_submit(jsonb_build_object('org_id',1,'lead_id',l,'profiles','[]'::jsonb),'linkedin')->>'error'='NOT_FOUND';
 ASSERT enrichment_submit(jsonb_build_object('org_id',940060,'lead_id',l,'profiles','[]'::jsonb),'linkedin')->>'saved'='true';
 UPDATE enrichment_controls SET enabled=false;
 ASSERT NOT EXISTS(SELECT 1 FROM enrichment_claim('basic',1));
 ASSERT (SELECT email_valid IS DISTINCT FROM true FROM cleaned_leads WHERE id=l);
 RAISE NOTICE 'PASS: leases, replay, ownership, changed source, disabled controls and no verified promotion';
END $$;
ROLLBACK;
