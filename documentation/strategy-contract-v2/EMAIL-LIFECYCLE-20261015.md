# Email lifecycle — local and scratch implementation

Migration 020 adds functions only, using existing outreach activity metadata. Applied only to `lead_diag_pg_20261011/scratch_v2_release_20261014`; not applied to live `lead_db`. No policies were seeded, no sender was activated and no model or email provider was called.

`outreach_email_begin` rechecks the existing reservation, locks the organization and approved plan, and rechecks again. It requires a genuinely transport-authorized plan (all current generated plans remain offline), the exact approved email subject/body and current recipient, and a matching sender policy in the current campaign version. It commits one attempting state and quota charge before transport. Calling again cannot start another attempt.

Configuration contract: `strategy_campaign_versions.config.email_dispatch` contains `enabled`, `credential_ref`, `sender_email` and `daily_limit` (1–9999). Nothing is configured in production. Reference matching verifies routing configuration, not actual ownership of the Gmail credential: actual credential identity must be checked before release. With several enabled campaigns, the smallest valid configured limit is enforced across the whole organization. Counters use UTC calendar days, not independent per-campaign allowances. Legacy email rows with sent_at on that UTC date count too. Invalid current-campaign limits block. Organization row locking serializes claims; uncertain attempts consume quota and are never recycled automatically.

`outreach_email_finish` records provider acceptance or an ambiguous outcome. It matches org, plan, step, hash and lease. Repeated identical results are idempotent. Conflicting receipts require reconciliation. Late receipts can be stored after expiry because they record historical outcomes rather than grant permission. Accepted does not mean delivered. Crash-after-begin records stay attempting and require reconciliation; there is no automatic recovery sender.

The injected `email-executor.cjs` adapter is disabled by default. It validates a draft, commits begin, invokes its injected transport at most once and persists the outcome. Begin commit uncertainty prevents transport. Receipt commit uncertainty stops with reconciliation_required. Provider exceptions are not logged with possible credentials and never cause blind retries. This adapter has no real Gmail transport and is not yet wired into 07A.

Verification:

- Scratch SQL tests passed under the non-superuser runtime role, using a transaction-scoped context double. Covered offline authorization, mapping, approved message/recipient matching, duplicate begin, org quota, malformed/foreign identity, ambiguous outcomes, identical/conflicting receipts and late receipts. Fixture changes were rolled back.
- Separate scratch clone `scratch_email_concurrency_20261015`: two concurrent database sessions with quota one; exactly one attempt began and one was quota-blocked. No provider was involved. Results are in `email-concurrency-results.json`. The clone retains fixture rows and a context double for diagnosis; it is not a production database.
- Six executor tests plus four handoff tests and existing dispatch-adapter regression passed using mock transports. Zero sends.

Still UNVERIFIED: real credential ownership, actual Gmail receipt schema, actual n8n sender execution and real delivery. Before deployment, integrate these functions into inactive 07A, add workflow-level scratch tests, and implement reconciliation visibility. Confirm a real org-specific sender and quota before any activation. Current plan offline/readiness gates and AI allowance remain unchanged.
