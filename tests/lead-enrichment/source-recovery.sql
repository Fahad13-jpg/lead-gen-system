\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE s integer;l integer;t jsonb;r jsonb;attempt integer;
BEGIN
 ASSERT current_database()='lead_gathering_test_20260926';
 INSERT INTO organizations(id,org_name,status) VALUES(940068,'Source recovery fixture','active');
 INSERT INTO staging_leads(org_id,company_name,source,cleaning_status,raw_data) VALUES(940068,'Clinic','google_maps','cleaned','{}') RETURNING id INTO s;
 INSERT INTO cleaned_leads(org_id,staging_id,company_name,website) VALUES(940068,s,'Clinic','https://clinic.example') RETURNING id INTO l;
 INSERT INTO cleaning_links(staging_id,org_id,cleaned_id) VALUES(s,940068,l);
 UPDATE enrichment_controls SET enabled=true,lead_ids=ARRAY[l];
 FOR attempt IN 1..3 LOOP
  SELECT value INTO t FROM enrichment_claim('basic',1) value;
  ASSERT t IS NOT NULL;
  r:=enrichment_finish(t||'{"status":"failed","result":{"version":"enrichment_v1","status":"failed","reason":"temporary_source_failure","retryable":true}}');
  ASSERT r->>'saved'='false';
  ASSERT (SELECT error='temporary_source_failure' AND attempts=attempt AND next_attempt>=now()+interval '9 minutes' AND status=CASE WHEN attempt<3 THEN 'pending' ELSE 'failed' END FROM enrichment_tasks WHERE id=(t->>'id')::bigint);
  ASSERT NOT EXISTS(SELECT 1 FROM enrichment_profiles WHERE lead_id=l AND basic_at IS NOT NULL);
  UPDATE enrichment_tasks SET next_attempt=now() WHERE id=(t->>'id')::bigint;
 END LOOP;
 ASSERT NOT EXISTS(SELECT * FROM enrichment_claim('basic',1));
 UPDATE enrichment_tasks SET status='pending',attempts=0 WHERE lead_id=l;
 SELECT value INTO t FROM enrichment_claim('basic',1) value;
 ASSERT enrichment_finish(t||'{"status":"complete","result":{"version":"enrichment_v1","status":"complete","pages":[{"url":"https://clinic.example","status":200,"usable_html":true}]}}')->>'saved'='true';
 ASSERT enrichment_finish(t||'{"status":"complete"}')->>'reason'='stale_lease';
 RAISE NOTICE 'PASS: transient failure requeues with delay, stops after three attempts, does not create fresh evidence, recovers and rejects replay';
END $$;
ROLLBACK;
