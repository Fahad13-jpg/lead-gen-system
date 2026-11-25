# Email handoff status — 15 October 2026

Local changes only; not imported or deployed. No migration, provider request, reservation, ledger change or message was made.

New v2 email plans contain `artifacts.email_draft` with a deterministic subject derived from the campaign offer name and the exact validated step-1 parts joined with blank lines. The artifact is created before hashing and saving the plan. It is covered by the database approval hash. Existing plans remain readable; old plans without this artifact require a newly generated and reviewed plan before dispatch. No previously approved body is rewritten.

The local 07A JSON now reads org-scoped strategy plans and calls the existing read-only dispatch check. Existing dispatch identities are excluded. Suppression lookup escapes strings and malformed suppression results block. Empty Postgres results cannot accidentally count as an eligible item. Original connections and sticky notes were preserved; the original note describes the historical sender, not this read-only implementation.

This is deliberately a **read-only handoff, not a completed sender**. The old ineffective per-run daily-limit slice is replaced by a closed transport gate. Gmail's recipient expression throws even on manual node execution. Legacy activity inserts and enriched-lead updates are replaced by read-only blocked results, so no fake success or legacy follow-up is produced. Workflow activation is false. Restoring those legacy writes would bypass the v2 contract.

`email-handoff.cjs` checks artifact consistency and recipient/header shape. It does not independently verify the database MD5 or approve sending: authoritative database checks are still required. Its receipt classifier is offline utility code only, not a persisted delivery reconciler. A valid Gmail-shaped ID means provider acceptance, not delivery; ambiguous outcomes never authorize retry.

Tests: contract (33 checks), adapter (13), native Code bodies (9), preview regression suite, existing dispatch-adapter suite, and four new email-handoff tests passed. The initial Node test runner failed to spawn under the sandbox (EPERM); the same offline test command passed outside it. No provider/model/network transport was included. New 07A SQL and execution in actual n8n remain UNVERIFIED. Receipt handling against real Gmail remains UNVERIFIED.

Remaining before a real sender release:

- Bind an actual sender credential to the correct organization. The user requested using our own; the assistant has no email account. Demo Sender / Example Studio is fixture data only.
- Implement an atomic org quota and a durable pre-send transition using the existing dispatch metadata. The old per-run slice was not a daily quota.
- Wire confirmed provider outcomes to durable activity records; ambiguous outcomes require reconciliation, not a resend. The current classifier alone does not do this.
- Resolve readiness/offline blockers through a reviewed release, without silently changing approved plans. Preserve the zero AI allowance until separately configured.
- Run scratch integration and concurrency tests, then deploy the resulting complete inactive sender. Real sending requires explicit authorization. Follow-up intents still require reviewed message content and delivery/reply checks.

No claim is made that the outreach stage is production-ready. The source changes eliminate unsafe legacy selection and fabricated send records while the remaining transport work is finished.
