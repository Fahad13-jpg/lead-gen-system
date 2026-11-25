-- Preserve provider evidence and reservations during recovery; never starts a run.
BEGIN;
DO $migration$
DECLARE definition text;
 loop_marker text := 'FOR a IN SELECT * FROM gathering_accounts ORDER BY id FOR UPDATE SKIP LOCKED LOOP';
BEGIN
 SELECT pg_get_functiondef('gathering_recover_v3()'::regprocedure) INTO definition;
 IF strpos(definition,'provider-evidence-recovery-v1')=0 THEN
  IF strpos(definition,loop_marker)=0
   OR strpos(definition,'started_at IS NULL AND heartbeat_at<now()-interval ''2 minutes''')=0
   OR strpos(definition,'started_at IS NOT NULL AND heartbeat_at<now()-interval ''20 minutes''')=0
   OR strpos(definition,'status=''queued'' AND created_at<now()-interval ''1 day''')=0
  THEN RAISE EXCEPTION 'Unexpected gathering recovery definition'; END IF;
  definition:=replace(definition,loop_marker,loop_marker||E'\n  -- provider-evidence-recovery-v1: inconsistent queues need review, never a fresh start or zero-cost expiry.\n  UPDATE scraping_jobs SET status=''needs_review'',error_message=''PROVIDER_REFERENCE_REVIEW'' WHERE provider_account_id=a.id AND (status=''queued'' OR (status=''pending'' AND started_at IS NULL)) AND (started_at IS NOT NULL OR apify_actor_run_id IS NOT NULL OR dataset_id IS NOT NULL);');
  definition:=replace(definition,'started_at IS NULL AND heartbeat_at<now()-interval ''2 minutes''',
   'started_at IS NULL AND apify_actor_run_id IS NULL AND dataset_id IS NULL AND coalesce(heartbeat_at,dispatched_at,created_at)<now()-interval ''2 minutes''');
  definition:=replace(definition,'started_at IS NOT NULL AND heartbeat_at<now()-interval ''20 minutes''',
   'started_at IS NOT NULL AND coalesce(heartbeat_at,started_at,created_at)<now()-interval ''20 minutes''');
  definition:=replace(definition,'status=''queued'' AND created_at<now()-interval ''1 day''',
   'status=''queued'' AND started_at IS NULL AND apify_actor_run_id IS NULL AND dataset_id IS NULL AND created_at<now()-interval ''1 day''');
  definition:=replace(definition,'WHERE provider_account_id=a.id AND','WHERE provider_account_id=a.id AND billing_mode IS NOT NULL AND');
  EXECUTE definition;
 END IF;
END $migration$;
COMMIT;
