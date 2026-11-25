\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE j integer;n integer;r jsonb;costs integer;
BEGIN
 ASSERT current_database()='scratch_contact_refresh_20261108';
 INSERT INTO organizations(id,org_name,status) VALUES(940091,'Ownership fixture','active'),(940092,'Other owner fixture','active');
 INSERT INTO scraping_jobs(org_id,job_name,source,search_query,location,max_results,status,gathering_version,execution_id,apify_actor_run_id,dataset_id)
 VALUES(940091,'Ownership fixture','google_maps','Clinic','Fixture',5,'running',1,'current-owner','saved-run','saved-dataset') RETURNING id INTO j;
 SELECT count(*) INTO costs FROM gathering_costs;
 EXECUTE $save$/* SAVE_RUN_SQL */$save$ USING j,940091,'wrong-run','wrong-dataset','old-owner';GET DIAGNOSTICS n=ROW_COUNT;ASSERT n=0,'Old worker saved a run';
 EXECUTE $save$/* SAVE_RUN_SQL */$save$ USING j,940092,'wrong-run','wrong-dataset','current-owner';GET DIAGNOSTICS n=ROW_COUNT;ASSERT n=0,'Other org saved a run';
 EXECUTE $heartbeat$/* HEARTBEAT_SQL */$heartbeat$ USING j,940091,'old-owner';GET DIAGNOSTICS n=ROW_COUNT;ASSERT n=0,'Old worker refreshed heartbeat';
 r:=gathering_worker_failed(j,940091,'GATHERING_OWNERSHIP_LOST',NULL,'old-owner');ASSERT r->>'updated'='false';
 ASSERT (SELECT status='running' AND execution_id='current-owner' AND apify_actor_run_id='saved-run' AND dataset_id='saved-dataset' FROM scraping_jobs WHERE id=j),'Stale error overwrote current owner';
 EXECUTE $save$/* SAVE_RUN_SQL */$save$ USING j,940091,'accepted-run','accepted-dataset','current-owner';GET DIAGNOSTICS n=ROW_COUNT;ASSERT n=1;
 EXECUTE $heartbeat$/* HEARTBEAT_SQL */$heartbeat$ USING j,940091,'current-owner';GET DIAGNOSTICS n=ROW_COUNT;ASSERT n=1;
 r:=gathering_worker_failed(j,940091,'GATHERING_STEP_FAILED',NULL,'current-owner');ASSERT r->>'updated'='true';
 ASSERT (SELECT status='needs_review' AND apify_actor_run_id='accepted-run' AND dataset_id='accepted-dataset' AND cost_status='unreconciled' FROM scraping_jobs WHERE id=j),'Ambiguous provider failure lost run identity';
 ASSERT (SELECT count(*) FROM gathering_costs)=costs,'Failure created a charge';
 RAISE NOTICE 'PASS: stale worker/org fenced, current owner accepted, saved run retained for review, no charge created';
END $$;
ROLLBACK;
