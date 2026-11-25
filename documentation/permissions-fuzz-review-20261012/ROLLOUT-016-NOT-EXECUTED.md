# Migration 016 rollout — written only; NOT executed

This runbook requires separate approval. It is for the production database `lead_db` in `postgres_db` and the existing `n8n` container. Do not substitute a scratch database name or run these commands automatically. No model/Apify/outreach calls are part of this rollout.

## Preconditions and pause

1. Review migration 016, helper files, current function-owner report and scratch tests. Confirm a restorable backup and disk space. Record the current controls, task statuses/fingerprints, campaign versions and provider-ledger counts/totals with the queries below. Preserve this output privately.
2. In the n8n UI, open each workflow below and set its Active toggle to OFF (or Deactivate in its menu). Confirm the inactive state in the workflow list and with the SQL query. Do not press Execute Workflow.
   - `6A - Evidence Based Business Enrichment` — `Every Five Minutes` schedule.
   - `6B - Evidence Based Research and LinkedIn` — `Every Five Minutes`, `Advance LinkedIn Collection`, AI research and its report/submission webhooks.
   - `6C - Campaign Outreach Strategy Planner` — `Every Minute` and campaign/request/approval webhooks.
   - Pause all currently active gathering, cleaning, contact verification, outreach and follow-up workflows as a maintenance window. Record their IDs and prior active states using `workflow_entity`; do not infer IDs from local JSON files.
3. Apply the following controls **only after approval**, recording their original values first:

```sql
UPDATE enrichment_controls SET enabled=false WHERE id;
UPDATE enrichment_ai_controls SET enabled=false WHERE id;
UPDATE enrichment_linkedin_controls SET enabled=false WHERE id;
```

`enrichment_controls.enabled=false` is the existing hard stop for both basic/research claims and `linkedin.advance`. The latter checks this before enqueueing/starting jobs. `enrichment_linkedin_controls.enabled=false` alone stops new reservations, but does not stop polling already-running jobs, so it is not sufficient by itself.

4. Wait until there are no processing enrichment tasks, running n8n executions, or LinkedIn jobs in starting/running/needs_review with unsettled provider work. A pause does not cancel an in-flight worker or an already-started provider run. Reconcile existing runs before starting; do not launch another run. If they cannot be reconciled without prohibited external work, stop the rollout.

```sql
SELECT id,name,active FROM workflow_entity ORDER BY name;
SELECT id,status,"workflowId" FROM execution_entity
 WHERE status IN ('new','running','waiting');
SELECT id,org_id,lead_id,kind,status,lease_until FROM enrichment_tasks
 WHERE status='processing';
SELECT id,org_id,lead_id,kind,status,reference FROM enrichment_linkedin_jobs
 WHERE status IN ('starting','running','needs_review');
SELECT * FROM enrichment_controls;
SELECT * FROM enrichment_ai_controls;
SELECT * FROM enrichment_linkedin_controls;
SELECT org_id,enabled,account_id FROM enrichment_linkedin_policy;
```

UI deactivation is operationally specified here, not exercised in scratch because activation/import changes are outside this task. The SQL global pause and actual LinkedIn helper's early-return behavior are covered by `pause-test-results.txt`. A rollback-only basic claim also proves it does not mutate research tasks. Keeping 06B inactive is essential: existing research tasks can otherwise be claimed before basic is refreshed.

## Fresh backup and saved rollback definitions

From the repository in PowerShell, choose a unique approved backup directory; commands below use an example name. Never overwrite a previous backup.

```powershell
New-Item -ItemType Directory -Path .local/approved-016-backup
docker exec postgres_db pg_dump -U n8n_user -d lead_db -Fc -f /tmp/lead_before_016.dump
docker cp postgres_db:/tmp/lead_before_016.dump .local/approved-016-backup/lead_before_016.dump
docker exec postgres_db pg_restore --list /tmp/lead_before_016.dump
docker exec postgres_db psql -X -U n8n_user -d lead_db -At -c "SELECT pg_get_functiondef(oid) FROM pg_proc WHERE oid IN ('enrichment_fingerprint(integer,integer,text)'::regprocedure,'enrichment_task_input(bigint,text)'::regprocedure,'enrichment_finish(jsonb)'::regprocedure,'lead_trust_report(integer,integer)'::regprocedure) ORDER BY proname" | Set-Content -Encoding utf8 .local/approved-016-backup/functions-before.sql
```

Capture the controls/query outputs above and pre-refresh `enrichment_profiles`/`enrichment_tasks` in the full backup. Save the currently installed helper directory privately:

```powershell
docker cp n8n:/home/node/.n8n/enrichment-stage .local/approved-016-backup/enrichment-stage
```

Restore the dump into a separate disposable database and verify counts before relying on it. Do not restore over production as a routine rollback.

## Install reviewed helpers and apply SQL

While all stages remain paused, install the reviewed signal-capable helper files. Old helpers that omit required array fields are intentionally rejected by the hardened finish function. These copy commands are deployment and need approval alongside the migration:

```powershell
docker cp scripts/lead-enrichment/worker.cjs n8n:/home/node/.n8n/enrichment-stage/worker.cjs
docker cp scripts/lead-enrichment/runtime.cjs n8n:/home/node/.n8n/enrichment-stage/runtime.cjs
docker cp scripts/lead-enrichment/observations.cjs n8n:/home/node/.n8n/enrichment-stage/observations.cjs
docker cp scripts/lead-enrichment/signals.cjs n8n:/home/node/.n8n/enrichment-stage/signals.cjs
docker cp scripts/lead-enrichment/ai-research.cjs n8n:/home/node/.n8n/enrichment-stage/ai-research.cjs
Get-Content -Raw database/migrations/016_signal_sheet.sql | docker exec -i postgres_db psql -X -v ON_ERROR_STOP=1 -U n8n_user -d lead_db
```

Migration 016 is transactional. Any error means stop and investigate; do not continue to refresh. Do not import 06C as part of this runbook. Its local qualifier changes need their own later deployment review.

## Post-apply checks

```sql
SELECT p.oid::regprocedure,pg_get_userbyid(p.proowner),p.provolatile,p.prosecdef
FROM pg_proc p WHERE p.proname IN
 ('enrichment_stamp_source','enrichment_source_checks','enrichment_fingerprint',
  'enrichment_task_input','enrichment_finish','lead_trust_report');
SELECT has_function_privilege('n8n_user','enrichment_stamp_source(text,jsonb,text)','EXECUTE'),
       has_function_privilege('n8n_user','enrichment_source_checks(integer,integer)','EXECUTE');
SELECT enrichment_source_checks(1,167),enrichment_fingerprint(1,167,'basic');
SELECT lead_id,basic->>'input_fingerprint' AS stored,
 enrichment_fingerprint(org_id,lead_id,'basic') AS expected
FROM enrichment_profiles WHERE org_id=1 ORDER BY lead_id;
SELECT lead_trust_report(1,167);
SELECT enrichment_report(1,167);
SELECT strategy_context(org_id,id,167) FROM strategy_campaigns WHERE org_id=1;
```

Expect the old 43 fingerprints to be stale until refreshed. Legacy JSON without required diagnostic arrays must degrade to unknown, not throw or appear verified. Do not approve a stale plan to make checks pass.

## Refresh the 43 basics, with research/LinkedIn paused

Keep 06B and 06C inactive, AI disabled and LinkedIn disabled. Leave 06A inactive while doing the first manual smoke batch. Restrict the existing allow-list:

```sql
UPDATE enrichment_controls SET enabled=true,lead_ids=ARRAY[167,445,446,447,449] WHERE id;
SELECT value AS task FROM enrichment_claim('basic',2) value;
```

For each returned task, use its **actual ID and lease**; do not invent/reuse a lease:

```powershell
docker exec n8n node /home/node/.n8n/enrichment-stage/worker.cjs ACTUAL_TASK_ID ACTUAL_LEASE
```

Capture the JSON result without editing it and pass the full object to `enrichment_finish` using the existing Save Result PostgreSQL node or a reviewed SQL literal with every single quote escaped by `.replace(/'/g, "''")`. Prefer manually running the existing **06A** workflow, which already claims, runs and saves each result, after its helper/migration smoke check. Do not manually execute 06B. Do not claim a task manually and then run 06A expecting it to reuse that lease; either complete the manual claim or use the workflow end-to-end.

After the benchmark review, set the complete allow-list, preserving the same controls:

```sql
UPDATE enrichment_controls SET lead_ids=ARRAY[
159,161,162,163,164,165,166,167,168,169,170,171,172,230,231,
445,446,447,448,449,450,451,452,453,454,455,456,457,458,
459,460,461,462,463,464,465,466,467,468,469,470,471,472] WHERE id;
```

Only after separate approval, activate **06A alone** or run it manually in bounded batches of two. Its existing claim logic uses at most three task attempts and a ten-minute retry delay. Do not reset attempt counters to force success. A failed refresh preserves old data and timestamps; it does not count as a successful refresh. No website URL means the basic helper performs no website HTTP fetch; old listing checks are still old and may need later source rechecks.

Verification after each batch:

```sql
SELECT lead_id,status,attempts,error,next_attempt FROM enrichment_tasks
 WHERE org_id=1 AND kind='basic' ORDER BY lead_id;
SELECT lead_id,basic_at,basic->>'status',
 basic->>'input_fingerprint'=enrichment_fingerprint(org_id,lead_id,'basic') AS matches
 FROM enrichment_profiles WHERE org_id=1 ORDER BY lead_id;
SELECT t.lead_id,a.started_at,a.finished_at,a.result->>'status',
 a.result->'result'->'pages' AS attempt_diagnostics
 FROM enrichment_attempts a JOIN enrichment_tasks t ON t.id=a.task_id
 WHERE t.kind='basic' ORDER BY a.started_at DESC LIMIT 50;
SELECT lead_id,lead_trust_report(org_id,lead_id)->>'website_presence',
 lead_trust_report(org_id,lead_id)->'warnings'
 FROM enrichment_profiles WHERE org_id=1 ORDER BY lead_id;
```

When the batch ends, set `enrichment_controls.enabled=false` and deactivate 06A again. Review before restoring any schedule, research, LinkedIn or strategy execution.

## Prove no paid-provider usage was introduced

Record these read-only snapshots before and after and require no new rows/reservations, no changed usage/cost values, and no new provider run IDs. This is stronger than checking only a dollar sum; an unsettled reservation may not yet have an actual cost.

```sql
SELECT count(*),max(reserved_at) FROM enrichment_ai_requests;
SELECT count(*),max(reserved_at) FROM strategy_ai_requests;
SELECT reference,run_id,status,max_cost_usd,actual_cost_usd,finished_at
 FROM apify_diagnostic_runs ORDER BY reference;
SELECT id,lead_id,status,reference FROM enrichment_linkedin_jobs ORDER BY id;
SELECT id,provider_account_id,apify_actor_run_id,max_cost_usd,actual_cost,status
 FROM scraping_jobs ORDER BY id;
SELECT org_id,reference,amount_usd FROM gathering_wallet_entries ORDER BY org_id,reference;
SELECT id,mode,monthly_budget_usd,gathering_account_spent(id) FROM gathering_accounts;
```

Use read-only snapshots; never reset or extend an AI trial ledger. Current snapshot predicts $0 paid-provider cost because basic is free of paid APIs, AI is disabled and platform credits are absent. Do not depend on the empty wallet alone: explicit pauses are required.

## Rollback

Pause workflows and controls again; wait for in-flight tasks to finish. If migration failed inside its transaction, its function changes rolled back automatically. If it committed, restore the saved pre-016 function definitions with ON_ERROR_STOP while paused:

```powershell
Get-Content -Raw .local/approved-016-backup/functions-before.sql | docker exec -i postgres_db psql -X -v ON_ERROR_STOP=1 -1 -U n8n_user -d lead_db
docker cp .local/approved-016-backup/enrichment-stage/. n8n:/home/node/.n8n/enrichment-stage/
```

Restoring function definitions does not undo refreshed profile data. If a data rollback is required, restore the full dump into a separate database, compare affected rows, and obtain approval for a targeted restoration. Do not overwrite live data or use `pg_restore --clean` on production automatically. The two new source functions can remain unused until separately reviewed cleanup; never drop them with CASCADE. Keep workflows paused until old/new fingerprint behavior and original controls are verified. Restore only the recorded prior active states, never enable every workflow indiscriminately.
