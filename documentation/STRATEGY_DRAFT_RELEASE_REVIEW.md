# Controlled strategy draft release — implementation checkpoint

15 November update: trusted operating controls are installed in 06C and normal
generation is enabled. This supersedes the paused/off installation checkpoint
below. No new model call, approval or send accompanied activation. See
`STRATEGY_OPERATION_20261115.md` for current state and acceptance limits.

Status (9 November 2026): built, scratch-tested and installed in local n8n through
its existing workflow API. Only the three reviewed Code bodies changed, with
activation, other workflows and business/control state preserved. No restart or
execution cancellation was performed. Global processing remains paused; the new
operator flag is off. No model/provider calls, sending or allowance changes were
made. Evidence: `.local/strategy-api-install-1794228795054/result.json`.

## Implemented and verified

`scripts/lead-strategy/v2/draft-release.cjs` adds a server-owned, opt-in native
email review boundary. `native.cjs` and `build-native.cjs` wire it through
`STRATEGY_DRAFT_REVIEW_ENABLED`. The generated 06C JSON changes only three Code
bodies; graph, settings, sticky notes and other node parameters are preserved.
Pure/offline builders and customer-template release behavior remain unchanged.

Seven release tests and 15 existing native tests passed. The real scratch
save/review/approve/revoke journey passed 15 checks, with mocked contact readiness,
zero provider calls and transaction rollback. Evidence:
`.local/strategy-native-release-20261109/result.json`.
These checks establish integration correctness, not real-recipient eligibility
or AI message quality, which remain UNVERIFIED.

The unsuccessful install is recorded under
`.local/strategy-checklist-1794219014130/`; its backup is preserved. No automatic
import retry, execution cancellation or global restart was performed. The
installer now checks idle state before making a new full backup.

Restart-free installation is now prepared in
`scripts/diagnostics/install-strategy-via-api.cjs`. The installed n8n API schema
and update handler were inspected: PUT updates and refreshes this workflow while
preserving its existing active state. Two focused mock tests passed, including
unknown PUT outcome reconciliation without replay and graph/activation checks.
It requires an operator-created key in `.local/n8n-api-key` (or `.txt`) with
workflow read/update access. The user supplied the key and the API update is now
verified. The updater stores the
exact prior workflow/rollback payload before mutation, verifies global pause and
the draft-release flag, and does not call an activation endpoint or restart Docker.

The separate email format conflict is resolved by explicitly approved local
migration 055. This does not install 06C, enable generation, release any campaign,
or enable sending. See the current completion plan for its installation evidence.

## Native email handoff closure

`scripts/diagnostics/test-native-email-handoff-scratch.cjs` now exercises one
normal native template generation/save/approval through the actual SQL reservation,
email executor and simulated receipt, under migrations 054/055. No plan body or
hash is edited to pass the dispatch marker. Exactly one mock transport call is
accepted; replay and revoked-approval step checks are denied. AI request count is
unchanged and the transaction rolls back. This focused check uses explicit
contact-readiness, eligibility/history and provider doubles; real managed sender,
contact acceptance, delivery and scheduled campaign behavior remain UNVERIFIED.
Evidence: `.local/native-email-handoff-20261109/result.json`.

## Default behavior and activation boundary

`scripts/lead-strategy/v2/contract.cjs` puts `v2_offline_only` on every generic v2
plan. The installed native adapter retains it while the operator release flag is
off. Consequently a default/offline plan cannot pass content approval. The
controlled native boundary can remove only that marker after validation when
explicitly enabled. Finding another clinic email does not enable this flag. The
separate global strategy processing switch also remains paused.

## Installed boundary (operator switch remains off)

Keep the pure/offline contract builder blocked by default. Add a controlled
release decision at the trusted native workflow boundary for **new** claimed plans.
Only a successfully validated plan with an actual permitted first channel/message
may become reviewable. Retain all other blocks, validation failures, conflict,
suppression, reply, tenant, lease and fingerprint checks. A fit-only result with no
permitted channel must remain blocked; removing its offline marker must not make
an empty plan approvable.

Keep the customer-template release flag separate. Configuration support does not
silently authorize its generation/execution. Do not replace AI with a template or
manufacture contact data to obtain a passing plan.

Content approval must still bind the authoritative database hash and return
`execution_authorized:false`. Migration 054 and existing expiry, acknowledgements,
current-context and owner/admin checks remain unchanged. Email/call/WhatsApp/SMS
dispatch gates, policies, schedules and provider connections remain unchanged.
No old stored plan is rewritten, unblocked or reapproved.

## Minimum verification

Use existing mocked provider/readiness seams and the existing scratch database to
check one valid native email draft through save/review/approval/revoke, plus denied
empty-channel, invalid-output, stale/fingerprint, suppressed and cross-org cases.
These checks do not need a clinic search, provider subscription, new paid run,
another model call or a message to a real recipient. Reuse the previous passed
checks rather than repeat a full historical suite.

Live marketing usefulness and real-contact acceptance remain explicitly UNVERIFIED
until a suitable contact and separately approved test are available. They do not
block implementation of this native release boundary.

## Activation and rollback boundary

Implementation/review is distinct from turning on scheduled processing. Keep the
processing switch paused while implementing and testing. Do not activate any
outreach executor or extend any AI allowance/trial ledger. Any activation must be
an explicit operator decision with the reviewed new code, empty/understood queue
and existing quota controls checked. Rollback keeps new generation paused and
restores the prior adapter; it never erases plan/approval history.

This changes an existing release gate. The user's earlier requirement to preserve
gates is the reason an explicit scope decision is required before implementation;
it is not a missing external account or a requirement to hunt for more emails.
