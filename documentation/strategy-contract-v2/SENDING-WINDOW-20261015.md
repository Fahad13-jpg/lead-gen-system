# Campaign sending windows — local/scratch

Migration 021 is not applied to live lead_db. It preserves migration 020 and replaces the email-begin function only in scratch, adding an explicit timing check. No activation, sender policy, daily allowance or AI budget was changed.

New v2 plans include `artifacts.schedule`: campaign timezone, allowed hours/weekdays, sequence and follow-up intent mappings. These fields belong to the saved plan body and therefore its approval hash. The AI brief hash and lease/reservation contract are unchanged. Timing metadata is assembled deterministically rather than invented by AI. `timing_enforced:false` records that planning has not executed the send-time check; it is not a permission flag.

Follow-up intents map to the corresponding campaign step only if their channels match. A mismatch gets `campaign_sequence_review_required` with no assigned delay. Matching intents still require an approved message and all execution checks. No scheduled date is invented before a previous confirmed send exists. Weak-fit strategy rules remain unchanged. This does not implement automatic follow-up sending.

The local 07A candidate query now excludes closed-window leads before reservation. They can be reconsidered on a later scheduler run without consuming quota. Migration 021 rechecks the window immediately before charging an attempt and requires the approved plan's timing to match the current campaign version. Missing, invalid or mismatched timing blocks. A reservation made just before closing that reaches begin after closing does not send or consume quota; its reservation remains subject to existing expiry/reconciliation rules rather than automatic recycling.

Hours are start-inclusive, end-exclusive, in the configured IANA timezone; weekdays use ISO Monday=1 through Sunday=7. Overnight windows remain unsupported by the existing campaign validator. Missing timezone is not silently replaced. Daily quotas retain their separate UTC-day accounting; campaign timezone affects allowed sending hours, not the quota calendar.

Verification passed: 33 contract regressions, nine native Code-body checks, two schedule tests; scratch SQL tests for exact boundaries, weekend, New York summer/winter offsets, invalid zones, malformed/null weekdays and infinite/null clock values; full scratch email lifecycle tests with matching schedule and mismatched-schedule rejection; actual 07A candidate SQL under the non-superuser runtime role. SQL tests use a context double and rolled-back fixtures. No provider or recipient was contacted.

Initial test failures caught a SQL CASE-parentheses issue and a proposed brief-hash change incompatible with the provider reservation contract. Both were corrected before passing tests; the existing brief hash is preserved. Existing approved plans are never rewritten in place; those missing required schedule metadata need a newly reviewed plan before future sending.

Further verification passed: isolated actual n8n generation and preview runs (six cases each), adapter and preview regressions, and focused email tests. No external provider was reachable from the scratch runtime.

Deployment attempt stopped at the preflight running-execution check, before backup/pause/migration/import. The latest read showed execution 47640 still running on workflow PhPwFzvnz5uOmYQN. No execution was cancelled and no live deployment change was made. `scripts/diagnostics/deploy-email-schedule.cjs apply` retains this guard and can be retried when n8n is idle. Its rollback restores the prior two workflows and migration-020 begin function, removing only the new window helper; it does not restore or erase application data.
