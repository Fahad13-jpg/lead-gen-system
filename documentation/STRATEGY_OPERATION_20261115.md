# Normal strategy operation — 15 November 2026

The installed 06C planner now admits normal authenticated dashboard requests.
`strategy_controls.enabled` is true. The queue was empty before/after activation;
org 1's monthly allowance remains enabled at 10, with four reservations used and
six remaining. No request, plan, model call, content approval or send was created
by this operating change. Native and customer-template generation still require
the ordinary campaign/lead context, explicit mode and applicable quota/evidence.

`scripts/lead-strategy/v2/operating-controls.cjs` configures trusted flags in the
PostgreSQL claim query for native email content review and customer templates.
The query overwrites the top-level operator controls after `strategy_claim`;
browser campaign/job input does not select these flags. Prepare accepts those
trusted controls or the existing environment flags. Pure/offline native builders
still default off. Invalid/blocked/empty-channel plans are not made reviewable.
The native build script preserves the new trusted-control branch.

Only **Claim Strategy Jobs** query and **Prepare Strategy** code changed. n8n API
readback verified the exact resulting workflow; graph, credentials, settings,
provider retries, notes, other nodes and active state were retained. No container
restart occurred. Source workflow JSON records the explicit local configuration.
The installer requires an empty queue and stores an attempt marker before PUT;
unknown outcomes are read back, never blindly repeated.

Nine operating/release tests and fifteen actual bundled Code-node VM checks passed.
The real dashboard readiness adapter reports `generation_allowed:true` and no
admission reasons for org 1's AI campaign. This is admission readiness, not provider
availability, recipient eligibility or marketing quality. The corrected prompt's
prior blocked-contact success remains the only corrected live-model result.
An eligible-contact live AI message-quality check is still unverified. The four
previously scoped quality requests are exhausted; remaining allowance is not
standing approval for additional automated quality-test calls.

Evidence and rollback payload:
`.local/strategy-operation-20261115/{before-workflow,rollback-workflow,before-controls,attempt,result}.json`.
To stop generation, pause `strategy_controls` first. To restore the prior workflow,
use its saved rollback payload with the existing authenticated n8n update process
and verify readback. No stored plans/hashes or historical ledgers were edited.
