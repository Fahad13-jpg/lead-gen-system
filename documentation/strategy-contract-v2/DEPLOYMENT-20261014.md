# 06C draft-only deployment — 14 October 2026

User authorized completing remaining work and deploying. Deployed to local Docker n8n and postgres_db/lead_db. This is a staged draft-generator rollout, not release of automated outreach or proof of AI reliability.

## Applied

- Migration 017 only: reservation-context checks and v1/v2 save/approval compatibility. Existing grants and authoritative content hashes retained. No new tables, budget changes or ledger extension.
- Local 06C workflow imported under existing ID 27W04lgTGdgFMWUx and project ownership. Forty nodes, existing connections and non-Code settings preserved. Nine Code bodies differed from the previous live workflow, reflecting the cumulative local runtime work; no nodes were added or removed.
- Compose settings: STRATEGY_CONTRACT_VERSION=strategy_v2, NODE_FUNCTION_ALLOW_BUILTIN=crypto, N8N_RUNNERS_ENABLED=false. All other configured environment values matched the previous running container. Only n8n was recreated; no image pull or upgrade was requested.
- Planner claims were paused during rollout and restored to the previous enabled state after verification. Workflow retains its prior active state. AI allowance remains zero (no enabled nonzero control rows). Sending workflows remain inactive and v2_offline_only remains on plans.

## Evidence

- Fresh database dump and workflow/functions/runtime backup saved privately under .local/strategy-v2-deployment-20261014. Do not share this directory; it contains runtime configuration and database contents.
- Fresh dump restored to isolated lead_diag_pg_20261011/scratch_v2_release_20261014. Migration 017 tested there WITHOUT migration 016. Non-superuser SQL tests passed for quota gates, tenant isolation, lease expiry, fingerprints, save/replay, approval hashes, fallback acknowledgement, stale/malformed approval and v1 compatibility. Fixture writes rolled back.
- Latest workflow Code bodies passed all six cases in isolated n8n with crypto allowlisted and network disabled.
- Live verification compared nodes and connections exactly with the imported file; checked active state, environment settings, migration presence, zero AI allowance and inactive senders.
- Live API smoke tests passed authentication rejection, invalid IDs/config/batch/approval/expiry and unknown-job 404. No campaigns or jobs were created, and no provider or send calls were made by these tests.
- n8n health check passed after restart. Long-duration monitoring and a real production job completion are UNVERIFIED; the safe API tests do not prove them.

## Deliberately pending

Migration 016 and enrichment helper rollout remain unapplied. Their fingerprint changes invalidate existing evidence and require a separate enrichment refresh rollout. Unknown/missing signals must remain unknown; this deployment does not refresh or certify any lead.

Prompt v2.6 is deployed but not live-model tested. Earlier v2.5 matrix produced one accepted plan, one semantic rejection and one rate limit. Human quality review remains pending. Existing preview behavior remains legacy v1; claimed-job generation uses v2 when opted in. Review UI/preview parity is not claimed.

The 07/08 execution workflows have not been integrated with v2 approval and event prerequisites. Follow-up requirement metadata is not a functioning executor. No sending activation, Retell integration or Flutter integration is included.

## Rollback

For failure of workflow/function/runtime checks before real v2 jobs are admitted, the targeted rollback command is:

`node scripts/diagnostics/deploy-strategy-v2.cjs rollback`

It pauses planner claims, imports the saved prior workflow under the same ID/project, restores prior strategy_finish/strategy_approval definitions, removes the new reservation-context function, restores compose settings, recreates only n8n and restores the prior planner control. It does not restore the whole database or alter provider ledgers. Before using it after new jobs/plans exist, review compatibility and active jobs; do not blindly roll back while work is in flight. Backup restore was tested into scratch; the production rollback command itself was not executed.

For normal restarts, the updated docker-compose.yml contains the non-secret v2 runtime settings. Repeating the deployment apply command is blocked by migration and exclusive-marker preconditions.
