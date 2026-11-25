# Optional email verification — 2026-10-22

Status: deployed to local Docker on 2026-10-22 after isolated PostgreSQL tests. Migration 033 and the updated inactive 06C workflow were verified against their local source. No emails, model calls or paid verification occurred. A fresh database backup and rollback SQL are under `.local/email-policy-033`.

Campaign configuration supports `email_verification_policy: basic | provider_required`. Missing settings retain `provider_required` for existing campaigns. Basic mode is an explicit campaign choice; it does not rewrite contact verification status.

Basic eligibility requires a canonical email address, an eligible published business contact with supported source evidence, a contact record less than 30 days old, and no business conflict or known invalid/risky/review result. Placeholder domains and common non-contact addresses are rejected. Source-record evidence must match an eligible cleaning link. Website/Facebook evidence must include the recorded source URL. These checks use existing stored evidence; they do not independently establish ownership.

Allowed basic contacts are labelled `basic_unverified`, with deliverability unknown and DNS unchecked. No DNS lookup, SMTP probe or mailbox-existence check is performed. The small disposable-domain denylist is not comprehensive. Freshness currently uses the contact record creation time, not a separately renewed observation timestamp; old records remain blocked conservatively.

The same database eligibility function feeds strategy context and final dispatch. Eligibility participates in the context fingerprint, so changed eligibility invalidates old plans rather than silently reusing approval. Existing leases, budgets, sender limits, approval hashes, transport release, suppression, bounce/reply stopping and uncertain-send handling remain intact. Explicit paid-verification mode remains available.

## Files

- `database/migrations/033_optional_email_verification.sql`: eligibility function, dispatch integration and strategy context. No new tables or webhooks.
- `scripts/lead-strategy/runtime.cjs`: policy validation and planning eligibility.
- `workflows/06C_outreach_strategy_generator.json`: rebuilt embedded runtime only; graph, sticky notes and settings preserved. Not imported.
- `tests/lead-strategy/optional-email-verification.sql`: SQL eligibility edge cases.
- `tests/organization-policy/customer-campaign.test.cjs`: campaign and planning regression checks.
- `scripts/diagnostics/customer-strategy-scratch.cjs` and `customer-dispatch-scratch.cjs`: rollback-only policy and dispatch checks.

## Verification

The combined policy/email/package suite passed 73 tests before adding the final planning regression. The 15 native strategy Code-node checks passed. The isolated `scratch_email_release_20261019` database in network-disabled `lead_diag_pg_20261011` passed SQL checks and a complete basic-contact fixture dispatch lifecycle: approval, reservation, blocked unreleased transport, tamper rejection, one begin, mocked receipt, delayed follow-up, due follow-up and reply stopping. SQL changes rolled back; no AI ledger changes. Fixture source evidence and provider receipts were simulated, not live observations or sends.

The final campaign test file also passed all six checks, including the added planning regression (74 distinct tests across the combined suite and this addition).

Live SQL bodies, n8n_user EXECUTE grants, imported workflow content and internal n8n health were verified. Plans, approvals, activities and AI ledgers remained unchanged during deployment. Campaign 1 was then explicitly advanced to version 2 with basic verification and the approved Gmail sender policy: 10/day, 10/rolling 24 hours, minimum 300 seconds apart, enabled=false. No approved plans exist. Workflows remain inactive.

Read-only eligibility preview of org 1's 47 leads returned no eligible recipients: 38 email identity failures (including missing selected email), 4 without qualifying current published-contact records, 3 invalid/risky/review results, and 2 business-review cases. No lead evidence or verification status was rewritten to pass these gates.

UNVERIFIED: real delivery through this basic-policy path, inbox placement and mailbox validity. Final activation requires an eligible recipient, reviewed plan and existing transport release. Evidence: `documentation/strategy-contract-v2/email-policy-033-deployment.json`. The previous release 032 bundle is preserved unchanged.
