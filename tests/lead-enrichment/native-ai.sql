\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE s integer;l integer;a jsonb;b jsonb;p jsonb;
BEGIN
 ASSERT current_database()='lead_gathering_test_20260926';
 UPDATE enrichment_ai_controls SET enabled=true,monthly_request_limit=10000,cooldown_until=NULL;
 UPDATE enrichment_ai_requests SET reserved_at=now()-interval '2 days';
 INSERT INTO organizations(id,org_name,status) VALUES(940066,'Native AI fixture','active');
 INSERT INTO staging_leads(org_id,company_name,source,cleaning_status,raw_data) VALUES(940066,'Clinic','google_maps','cleaned','{}') RETURNING id INTO s;
 INSERT INTO cleaned_leads(org_id,staging_id,company_name) VALUES(940066,s,'Clinic') RETURNING id INTO l;
 INSERT INTO cleaning_links(staging_id,org_id,cleaned_id) VALUES(s,940066,l);
 UPDATE enrichment_controls SET enabled=true,lead_ids=ARRAY[l];
 SELECT value INTO a FROM enrichment_claim('basic',1) value;
 ASSERT enrichment_finish(a||'{"status":"complete","result":{"version":"enrichment_v1","status":"complete"}}')->>'saved'='true';
 SELECT value INTO b FROM enrichment_claim('research',1) value;
 ASSERT enrichment_ai_gate((b->>'id')::bigint,b->>'lease')->>'allowed'='true';
 ASSERT enrichment_ai_gate((b->>'id')::bigint,b->>'lease')->>'reason'='rate_limited';
 p:=b||'{"status":"complete","result":{"version":"enrichment_v1","status":"complete","ai_research":{"status":"rate_limited"}}}';
 PERFORM enrichment_ai_record(p);
 ASSERT (SELECT cooldown_until>now() FROM enrichment_ai_controls WHERE id);
 ASSERT enrichment_native_finish(p)->>'saved'='true';
 ASSERT (SELECT status='pending' AND attempts=0 AND next_attempt>now()+interval '14 minutes' FROM enrichment_tasks WHERE id=(b->>'id')::bigint);
 ASSERT enrichment_native_finish(p)->>'saved'='false';
 RAISE NOTICE 'PASS: native reservation, shared throttle, provider cooldown, deferred retry and replay rejection';
END $$;
ROLLBACK;
