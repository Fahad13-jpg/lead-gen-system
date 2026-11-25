\set ON_ERROR_STOP on
DO $$
DECLARE a jsonb;j integer;
BEGIN
 a:=gathering_enqueue_v3(jsonb_build_object('org_id',900001,'billing_mode','platform','result_mode','new','source','google_maps','job_name','Resume only webhook verification','search_query','dentists','location','Islamabad','max_results',5,'max_cost_usd',0.5,'request_id','resume_http_'||txid_current(),'refresh',true));
 IF (a->>'error')::boolean THEN RAISE EXCEPTION 'Cannot seed resume test: %',a; END IF;
 j:=(a->>'job_id')::integer;
 PERFORM gathering_dispatch_v3();PERFORM gathering_claim_v3(j,900001,'google_maps','interrupted-test-worker');
 UPDATE scraping_jobs SET apify_actor_run_id='saved-mock-run',dataset_id='saved-mock-data' WHERE id=j;
 PERFORM gathering_worker_failed(j,900001,'SIMULATED_INTERRUPTION',NULL,'interrupted-test-worker');
END $$;
SELECT id FROM scraping_jobs WHERE org_id=900001 AND job_name='Resume only webhook verification' ORDER BY id DESC LIMIT 1;
