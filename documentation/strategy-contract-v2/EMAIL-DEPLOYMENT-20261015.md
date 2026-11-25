# Local Docker deployment — 15 October 2026

Deployed migration 020 and workflows 06C (`27W04lgTGdgFMWUx`) and 07A (`gTjsUEP8VLlxKfWf`). This supersedes earlier local-only status notes in the lifecycle/integration reports. Migration 016 remains outside this deployment.

06C now includes the exact email draft artifact in new saved plans. Existing approved plans were not rewritten. 07A includes reservation, atomic quota/begin checks and receipt persistence, but remains inactive with its entry and Gmail transport gates closed. No sender policy was configured. The planner was paused for import/restart and its previous setting restored after verification.

Verification passed:

- Imported node bodies and connections match local JSON.
- n8n health and strategy API smoke checks passed.
- Missing-plan begin request is denied; runtime function grants are present.
- Activity count, plan hashes, AI ledger counts and workflow activation states match the pre-deployment snapshot.
- AI allowance remains zero. No model calls or messages were sent.

Pre-deployment evidence: six actual scratch n8n scenarios with mocked database/provider operations, eleven focused offline tests, scratch non-superuser SQL lifecycle tests and a two-session quota race. Real Gmail identity, receipts and delivery remain UNVERIFIED; this deployment does not claim sending readiness.

Backup: `.local/email-lifecycle-deployment-20261015/before.dump` and `before.json`. These are private deployment artifacts. The database dump was created successfully; a fresh restore of this particular backup has not been tested.

Rollback command: `node scripts/diagnostics/deploy-email-lifecycle.cjs rollback`. It restores only the two saved workflow definitions/activation states and removes the two migration-020 functions. It refuses rollback when attempting, accepted or ambiguous dispatches exist, because those must be preserved and reconciled. No full-database restore or destructive data reset is performed. This rollback path is written but not executed against production.

Remaining release gates: verify an organization-specific sender, configure its quota, complete the reviewed transport/readiness release without modifying approved plans in place, and explicitly authorize sending. Follow-up intents are not yet approved executable messages. No automated delivery reconciliation or resend has been enabled.
