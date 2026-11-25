\set ON_ERROR_STOP on
BEGIN;
INSERT INTO organizations(id,org_name,status,apify_status,apify_api_key,monthly_credit_limit,credits_used) VALUES(910001,'Gathering test fixture','active','active','apify_api_TEST',100,0);
DO $$
DECLARE p jsonb; a jsonb; b jsonb; j integer; result jsonb;
BEGIN
 p := '{"org_id":910001,"source":"google_maps","job_name":"Test","search_query":"Dentists","location":"Test City","max_results":5,"max_cost_usd":0.5,"request_id":"test_request_001","scrape_contacts":true,"website_filter":"allPlaces","country_code":null}'::jsonb;
 a:=gathering_enqueue(p); j:=(a->>'job_id')::integer;
 ASSERT a->>'error'='false','request should enqueue';
 b:=gathering_enqueue(p); ASSERT b->>'job_id'=a->>'job_id' AND b->>'replayed'='true','idempotency failed';
 b:=gathering_enqueue(p||'{"max_results":6}'::jsonb); ASSERT b->>'code'='REQUEST_ID_CONFLICT','request conflict not detected';
 b:=gathering_claim(j,910002,'google_maps','test'); ASSERT b->>'claimed'='false','cross-org claim allowed';
 b:=gathering_claim(j,910001,'yellow_pages','test'); ASSERT b->>'claimed'='false','wrong source claimed';
 b:=gathering_claim(j,910001,'google_maps','test'); ASSERT b->>'claimed'='true','claim failed';
 b:=gathering_claim(j,910001,'google_maps','test'); ASSERT b->>'claimed'='false','duplicate paid run possible';
 UPDATE scraping_jobs SET apify_actor_run_id='test_run' WHERE id=j;
 result:=gathering_finish(j,910001,'[{"company_name":"O''Brien","phone":"+155500001","source_record_id":"unique1","raw_data":{"original":true}},{"company_name":"O''Brien duplicate","phone":"+155500001","source_record_id":"unique1","raw_data":{}}]',0.017,2,0);
 ASSERT result->>'total_leads'='1' AND result->>'duplicates'='1','actual insert counts wrong';
 result:=gathering_finish(j,910001,'[]',0.017,0,0); ASSERT result->>'replayed'='true','completion not idempotent';
 ASSERT (SELECT count(*) FROM gathering_costs WHERE job_id=j)=1,'duplicate charge';
 ASSERT (SELECT credits_used FROM organizations WHERE id=910001)=0.02,'fractional accounting wrong';
 b:=gathering_fail(j,910001,'APIFY_FAILED',1);ASSERT b->>'updated'='false','completed job overwritten';
 a:=gathering_enqueue(p||'{"request_id":"test_request_002"}'); j:=(a->>'job_id')::integer;
 PERFORM gathering_claim(j,910001,'google_maps','test');UPDATE scraping_jobs SET apify_actor_run_id='empty_run' WHERE id=j;
 result:=gathering_finish(j,910001,'[]',0,0,0);ASSERT result->>'status'='completed' AND result->>'total_leads'='0','empty result not completed';
 a:=gathering_enqueue(p||'{"request_id":"test_request_003"}');j:=(a->>'job_id')::integer;
 PERFORM gathering_claim(j,910001,'google_maps','test');PERFORM gathering_fail(j,910001,'GATHERING_STEP_FAILED',NULL);
 ASSERT (SELECT status FROM scraping_jobs WHERE id=j)='needs_review','ambiguous paid start must require review';
 PERFORM gathering_enqueue(p||'{"request_id":"test_request_004"}');PERFORM gathering_enqueue(p||'{"request_id":"test_request_005"}');
 b:=gathering_enqueue(p||'{"request_id":"test_request_006"}');ASSERT b->>'code'='CONCURRENCY_LIMIT','concurrency limit not enforced';
 UPDATE scraping_jobs SET created_at=now()-interval '11 minutes' WHERE org_id=910001 AND status='pending';
 b:=gathering_recover();ASSERT (b->>'expired_pending')::integer=2,'stalled dispatch recovery failed';
 ASSERT (SELECT status FROM scraping_jobs WHERE id=j)='needs_review','ambiguous job reservation released';
 RAISE NOTICE 'PASS: admission, tenant boundary, replay, claim, duplicates, empty results, costs, failures, capacity, recovery';
END $$;
ROLLBACK;
