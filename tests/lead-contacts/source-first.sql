\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE sid integer;lid integer;d jsonb;r jsonb;
BEGIN
 ASSERT current_database()='lead_gathering_test_20260926';
 INSERT INTO organizations(id,org_name,status) VALUES(940020,'Source-first isolated fixture','active');
 INSERT INTO staging_leads(org_id,company_name,source,cleaning_status,raw_data) VALUES(940020,'No Website','google_maps','cleaned','{"emails":["office@clinic.example","hello@clinic.example"]}') RETURNING id INTO sid;
 INSERT INTO cleaned_leads(org_id,staging_id,company_name,phone) VALUES(940020,sid,'No Website','+12345678901') RETURNING id INTO lid;
 INSERT INTO cleaning_links(staging_id,org_id,cleaned_id) VALUES(sid,940020,lid);
 UPDATE contact_controls SET discovery_enabled=true,verification_enabled=false,staging_ids=ARRAY[sid];
 SELECT value INTO d FROM contact_claim('discovery',1) value;ASSERT d IS NOT NULL,'lead without website not claimed';
 ASSERT (SELECT source_value FROM contact_tasks WHERE id=(d->>'id')::bigint)='record-only';
 r:=contact_finish(d||'{"status":"found","strategy":"source_first_v1","stop_reason":"saved_business_contacts_found","candidates":[{"email":"office@clinic.example","score":80,"relevance_status":"eligible","method":"source_record","source_field":"raw.emails[0]"}],"contact_routes":[{"type":"phone","value":"+12345678901"}]}');
 ASSERT r->>'saved'='true';ASSERT (SELECT method FROM lead_contacts WHERE lead_id=lid)='source_record','provenance overwritten';
 ASSERT (SELECT email IS NULL FROM cleaned_leads WHERE id=lid),'unverified source contact promoted';
 ASSERT NOT EXISTS(SELECT 1 FROM contact_claim('verification',1)),'verification pause ignored';
 r:=contact_report(940020);ASSERT r->'discovery_results'->>'saved_record_successes'='1';ASSERT r->'discovery_results'->>'leads_with_alternative_routes'='1';
 INSERT INTO contact_discovery_cache(org_id,website,result,expires_at) VALUES(940020,'https://clinic.example','{"status":"not_found"}',now()+interval '1 day');
 ASSERT NOT EXISTS(SELECT 1 FROM contact_discovery_cache WHERE org_id=1 AND website='https://clinic.example'),'cache crosses organizations';
 PERFORM contact_retry(940020,(d->>'id')::bigint);
 SELECT value INTO d FROM contact_claim('discovery',1) value;
 UPDATE cleaned_leads SET website='https://newsite.example' WHERE id=lid;
 r:=contact_finish(d||'{"status":"not_found"}');ASSERT r->>'status'='superseded','old no-website result accepted after website edit';
 RAISE NOTICE 'PASS: no-website queue, source provenance, paused verification, no unverified promotion, strategy metrics, tenant cache and stale website';
END $$;
ROLLBACK;
