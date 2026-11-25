\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE s integer;l integer;a jsonb;b jsonb;
BEGIN
 ASSERT current_database()='lead_gathering_test_20260926';
 UPDATE enrichment_ai_controls SET enabled=false,monthly_request_limit=100;
 IF enrichment_ai_reserve(-1,'invalid') THEN RAISE EXCEPTION 'disabled accepted'; END IF;
 UPDATE enrichment_ai_controls SET enabled=true,monthly_request_limit=0;
 IF enrichment_ai_reserve(-1,'invalid') THEN RAISE EXCEPTION 'zero quota accepted'; END IF;
 UPDATE enrichment_ai_controls SET enabled=true,monthly_request_limit=100;
 IF enrichment_ai_reserve(-1,'invalid') THEN RAISE EXCEPTION 'invalid lease accepted'; END IF;
 INSERT INTO organizations(id,org_name,status) VALUES(940064,'AI quota fixture','active');
 INSERT INTO staging_leads(org_id,company_name,source,cleaning_status,raw_data) VALUES(940064,'Clinic','google_maps','cleaned','{}') RETURNING id INTO s;
 INSERT INTO cleaned_leads(org_id,staging_id,company_name,website) VALUES(940064,s,'Clinic','https://clinic.example') RETURNING id INTO l;
 INSERT INTO cleaning_links(staging_id,org_id,cleaned_id) VALUES(s,940064,l);
 UPDATE enrichment_controls SET enabled=true,lead_ids=ARRAY[l];
 SELECT value INTO a FROM enrichment_claim('basic',1) value;
 ASSERT enrichment_finish(a||'{"status":"complete","result":{"version":"enrichment_v1","status":"complete"}}')->>'saved'='true';
 SELECT value INTO b FROM enrichment_claim('research',1) value;
 ASSERT b IS NOT NULL;
 UPDATE enrichment_ai_controls SET monthly_request_limit=(SELECT count(*)+1 FROM enrichment_ai_requests WHERE reserved_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
 ASSERT enrichment_ai_reserve((b->>'id')::bigint,b->>'lease');
 ASSERT NOT enrichment_ai_reserve((b->>'id')::bigint,b->>'lease');
 -- A new valid lease must still be denied after the monthly allowance is exhausted.
 UPDATE enrichment_tasks SET lease=repeat('a',32) WHERE id=(b->>'id')::bigint;
 INSERT INTO enrichment_attempts(lease,task_id) VALUES(repeat('a',32),(b->>'id')::bigint);
 ASSERT NOT enrichment_ai_reserve((b->>'id')::bigint,repeat('a',32));
 RAISE NOTICE 'PASS: opt-in, valid lease reservation, duplicate protection and monthly quota';
END $$;
ROLLBACK;
