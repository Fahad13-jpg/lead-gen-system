\set ON_ERROR_STOP on
BEGIN;
INSERT INTO organizations(id,org_name,status,apify_status,apify_api_key,monthly_credit_limit,credits_used) VALUES(910002,'Feature test fixture','active','active','apify_api_TEST',100,0);
DO $$
DECLARE p jsonb; a jsonb; b jsonb; j integer; j2 integer; report jsonb; rows jsonb;
BEGIN
 p:='{"org_id":910002,"source":"google_maps","job_name":"Test","search_query":"Dentists","location":"Test City","max_results":5,"max_cost_usd":0.5,"request_id":"feature_request_01","scrape_contacts":true,"website_filter":"allPlaces","country_code":null}';
 a:=gathering_enqueue(p);j:=(a->>'job_id')::integer;ASSERT a->>'dispatch'='true';
 b:=gathering_enqueue(p);ASSERT b->>'replayed'='true';
 b:=gathering_enqueue(p||'{"radius_km":5}');ASSERT b->>'code'='REQUEST_ID_CONFLICT';
 PERFORM gathering_claim(j,910002,'google_maps','worker1');UPDATE scraping_jobs SET apify_actor_run_id='test-run',dataset_id='test-data' WHERE id=j;
 rows:='[{"ordinal":0,"company_name":"Clinic","phone":"+1 (555) 111","website":"https://chain.test","address":"1 Main Road","source_record_id":"branch-1","raw_data":{}},{"ordinal":1,"company_name":"Clinic","phone":"+1 (555) 111","website":"https://chain.test","address":"2 Main Road","source_record_id":"branch-2","raw_data":{}},{"ordinal":2,"company_name":"Clinic duplicate","source_record_id":"branch-1","raw_data":{}}]';
 a:=gathering_finish_v2(j,910002,rows,0.03005,4,'[{"ordinal":3,"reason":"outside_radius","raw_data":{"name":"Distant clinic"}}]','SUCCEEDED','worker1');
 ASSERT a->>'total_leads'='2' AND a->>'duplicates'='1','separate branches collapsed';
 ASSERT (SELECT count(*) FROM gathering_results WHERE job_id=j)=4,'history missing';
 report:=gathering_report(j,910002);ASSERT report->>'unique_leads'='2';ASSERT report->>'rejected'='1';
 ASSERT gathering_report(j,910003) IS NULL,'cross-tenant report';
 a:=gathering_finish_v2(j,910002,'[]',99,0,'[]','SUCCEEDED','worker1');ASSERT a->>'replayed'='true';
 ASSERT (SELECT amount_usd FROM gathering_costs WHERE job_id=j)=0.03005,'double charge';
 a:=gathering_enqueue(p||'{"request_id":"feature_request_02"}');j2:=(a->>'job_id')::integer;
 ASSERT a->>'dispatch'='false' AND a->>'reused_from_job_id'=j::text,'cache not reused';
 ASSERT (SELECT count(*) FROM gathering_results WHERE job_id=j2)=4,'cached history missing';
 ASSERT (SELECT count(*) FROM gathering_costs WHERE job_id=j2)=0,'cache charged';
 a:=gathering_enqueue(p||'{"request_id":"feature_request_03","refresh":true}');j2:=(a->>'job_id')::integer;ASSERT a->>'dispatch'='true','refresh ignored';
 PERFORM gathering_claim(j2,910002,'google_maps','worker2');UPDATE scraping_jobs SET apify_actor_run_id='test-run2',dataset_id='test-data2' WHERE id=j2;
 PERFORM gathering_worker_failed(j2,910002,'DATASET_FAILED',NULL,'worker2');
 a:=gathering_control(j2,910003,'resume');ASSERT a->>'http_status'='404','cross-tenant control';
 a:=gathering_control(j2,910002,'resume');ASSERT a->>'dispatch'='true';
 a:=gathering_claim(j2,910002,'google_maps','worker3');ASSERT a->>'apify_actor_run_id'='test-run2','resume lost provider identity';
 PERFORM gathering_worker_failed(j2,910002,'OLD_WORKER',NULL,'worker2');ASSERT (SELECT status FROM scraping_jobs WHERE id=j2)='running','old worker overwrote new lease';
 a:=gathering_control(j2,910002,'cancel');ASSERT a->>'dispatch'='false','active cancellation dispatched duplicate worker';
 a:=gathering_finish_v2(j2,910002,rows,0.0123,3,'[]','ABORTED','worker3');ASSERT a->>'status'='cancelled' AND a->>'partial_results'='true';
 ASSERT (SELECT count(*) FROM gathering_results WHERE job_id=j2)=3,'cancelled partial history lost';
 ASSERT (SELECT count(*) FROM gathering_costs WHERE org_id=910002)=2;
 a:=gathering_enqueue(p||'{"request_id":"feature_request_04","refresh":true}');j2:=(a->>'job_id')::integer;
 a:=gathering_control(j2,910002,'cancel');ASSERT (SELECT status FROM scraping_jobs WHERE id=j2)='cancelled';
 a:=gathering_claim(j2,910002,'google_maps','must-not-start');ASSERT a->>'claimed'='false';
 a:=gathering_enqueue(p||'{"request_id":"feature_request_05","refresh":true}');j2:=(a->>'job_id')::integer;
 PERFORM gathering_claim(j2,910002,'google_maps','ambiguous');PERFORM gathering_worker_failed(j2,910002,'START_UNKNOWN',NULL,'ambiguous');
 a:=gathering_control(j2,910002,'resume');ASSERT a->>'code'='RUN_NOT_RESUMABLE';
 a:=gathering_control(j2,910002,'cancel');ASSERT a->>'code'='RUN_ID_UNKNOWN','ambiguous start released budget';
 -- Fallback dedup works across sources with normalized name/address/phone.
 a:=gathering_enqueue(p||'{"request_id":"feature_request_06","refresh":true,"source":"yellow_pages","country_code":"US"}');j2:=(a->>'job_id')::integer;
 PERFORM gathering_claim(j2,910002,'yellow_pages','fallback');UPDATE scraping_jobs SET apify_actor_run_id='yp-run',dataset_id='yp-data' WHERE id=j2;
 a:=gathering_finish_v2(j2,910002,'[{"company_name":"CLINIC","phone":"1555111","address":"1 Main Road","source_record_id":"yp-branch1"}]',0.01,1,'[]','SUCCEEDED','fallback');
 ASSERT a->>'total_leads'='0' AND a->>'duplicates'='1','normalized fallback failed';
 RAISE NOTICE 'PASS: branch identity, history, cache, refresh, costs, resume, cancellation, tenant isolation, worker fencing, fallback matching';
END $$;
ROLLBACK;
