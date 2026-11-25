# Enrichment storage rollout — 8 November 2026

Migration 016 and the signal-capable enrichment helpers are now installed on local `postgres_db / lead_db` and `n8n`. No new table/webhook was added. This supersedes earlier notes saying 016 is only in scratch.

## Validation and backup

A fresh live dump was restored into network-isolated `scratch_016_1794141179811`. The function chain ran as separate non-superuser owner/runtime roles; 50 malformed payload cases per role passed. Additional assertions proved failed refreshes preserve good basic/research JSON, both timestamps and freshness, retain attempt diagnostics, and label the template fixture with a warning rather than that warning being a conflict. Pause tests proved basic-only claims leave research unchanged and the paused LinkedIn helper makes no provider calls. Signal/source/observation suites also passed, including 84 stored source records, five benchmarks and 20 synthetic cases.

Private validation evidence: `.local/validation-016-1794141179811/`. The earlier first run passed its original fuzz suite; a subsequent startup race was corrected by waiting for the scratch Postgres initialization-complete marker.

Rollout/rollback bundle: `.local/rollout-016-1794141789968/`. It contains the exact prior controls/activation list, previous function definitions, helper directory backup, migration SQL, ledger baseline and a fresh paused database dump. That actual paused dump was restored successfully into isolated `scratch_016_rollback_1794141789968`, also verifying the workflow graph baseline. The dump is private and gitignored. Its SHA-256 is recorded in `progress.json`.

## Live results

The migration changed the computed fingerprint of **44** existing profiles, not the historical estimate of 43. Their old JSON was retained, with freshness invalidated until reassessed.

Five real basic canaries saved successfully:

| Lead | Result | Website presence | Important result |
| --- | --- | --- | --- |
| 167 | complete | present | `template_site_suspected` warning; fit strong but missing email/location still block outreach |
| 445 | partial | unknown | no website fetched; no false global absence claim |
| 446 | partial | unknown | no website fetched; email remains missing |
| 447 | partial | unknown | no website fetched; email remains missing |
| 449 | complete | present | current website evidence available; website offer fit weak; email still missing |

All five have assessment_status=assessed and fully_verified=false. Lead 449 contributes two facts to the current capped brief. Original trust/eligibility checks still block email. The other 39 profiles are queued through the restored 06A schedule; they are not claimed to be refreshed or verified yet.

Background handoff check at 13:06 UTC: the restored schedule had advanced freshness to **7/44**, with three complete tasks, four partial tasks and 37 pending. This confirms processing resumed; partial does not mean verified. Timestamped evidence is in the bundle's `background-progress.json`.

An operator-runner ID comparison initially stopped after the migration (worker IDs are strings, claimed IDs are numbers). No result had been persisted. The assertion was corrected, existing leases were reconciled through the normal mechanisms, the actual backup was restored in isolation, and the rollout completed. No migration replay or forced lease/attempt reset was used.

## Current controls

- Prior active schedules were restored, with 06A active for free basic refreshes.
- 06B research remains inactive until the basic refresh is reviewed; 06C remains inactive as before.
- Enrichment AI and LinkedIn collection controls remain disabled. Their limits/caps were not increased.
- Gmail sender/reply execution workflows remain inactive with closed gates.
- Strategy AI allowance remains zero. No model, Apify or verification API request was made by this rollout; only bounded website fetches were performed.
- AI/LinkedIn/Apify/wallet ledgers and outreach activity count matched the baseline. Existing workflow graphs, sticky notes, credentials and settings matched the restored backup.

Evidence: `progress.json` and `post-verification.json` in the rollout bundle. Five canary outputs are stored privately there.

## Limits and next actions

Allow the existing basic schedule to refresh the remaining profiles, then inspect failed/partial cases before resuming research. A missing website/email is not fabricated into a complete lead. Source absence semantics remain search-scoped; stale listing stamps require rechecking. Fresh basic evidence does not establish business ownership, email deliverability, consent or buying intent.

Research may be resumed separately after basic freshness review, keeping paid controls disabled unless explicitly authorized. Real AI plans still require an approved allowance; actual email sending requires reviewed content, current sender/campaign binding, recipient eligibility and bounded release.

Rollback uses the saved function definitions/helpers while stages are paused, followed by comparison of current evidence/fingerprints. Do not restore the whole live database over later activity or reset old leases/uncertain attempts. Newly refreshed rows require a separately reviewed targeted data rollback if one is needed.
