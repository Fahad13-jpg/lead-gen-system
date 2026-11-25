# Campaign-level email approval — backend foundation, 10 November 2026

The user approved one explicit campaign approval for exact recipients/messages,
delays and end date, followed by short automatic release renewals. This increment
implements the approval/renewal contract and prepares storage. **It does not enable
automatic sending, change the installed rollout validator, or issue live authority.**

Scope binds organization, current campaign version/config hash, exact plan IDs and
approved content hashes, recipients, sender/connection version, the approved email
sequence and an explicit end date no later than any selected plan's expiry. The
initial scope is at most ten selected plans. It supports the existing strategy
sequence of up to ten email steps; transport integration beyond two remains pending.
Daily/rolling limits and spacing are unchanged.

The pure renewal decision selects only the next unsent step, using the previous
confirmed send as the delay origin. Revocation, expiry, changed scope, inactive
membership, stale sender readiness, missing/out-of-order history, replies, bounces,
opt-outs and uncertain/reserved/failed sends stop renewal. Current SQL step
eligibility must pass. Each proposed release expires within 24 hours, before the
campaign end and before the original plan expiry. Nothing extends an old release
or plan. Renewal requires the original approver's active identity.

## Files and proposed storage

- scripts/sender-connections/campaign-authority.cjs: pure scope/renewal contract.
- scripts/dashboard/campaign-authority.cjs: mockable authenticated preview and
  acknowledgement/hash-bound approval/revoke adapter, plus read-only loader.
- database/migrations/056_email_campaign_authority.sql: **installed locally**.

Migration 056 uses `_email_execution` in existing campaign config JSON. No tables,
columns or webhooks are added. The new fixed function is granted to n8n_user only.
A narrow strategy_context patch omits this operational key before output and
fingerprinting, preserving the remaining definition/grants. Approval does not
invalidate existing plans or expose operational metadata to strategy prompts;
business configuration changes still invalidate their fingerprints.

Approval rechecks current plan fingerprints, hashes, latest approval, recipient,
sequence, future drafts and sender. Approval/revocation use an expected revision;
a changed campaign version cannot inherit authority. Preview hides credential
references and requires its exact review hash plus explicit acknowledgement.

## Verification and remaining integration

Seven focused core/service tests pass. Isolated network-none scratch database
scratch_contact_refresh_20261108 exercised approval/revoke, role/revision checks,
scope validation, malformed arrays, fingerprint preservation, hidden operational
metadata and business-change invalidation. All DDL/data changes rolled back. The
sender, recipient and plan approval were explicitly synthetic fixtures. The read
adapter also executed through the read-only local database connection. Evidence:
.local/campaign-authority-20261110/result.json and read-adapter.json.

Update, 10 November: migrations 056/057 are installed in local lead_db. A fresh
backup and rollback SQL are recorded in
`.local/campaign-automation-install-1794320330041/result.json`. Existing function
owners/grants and campaign/plan/approval/activity state were preserved. No
campaign authority was created, no schedule enabled and no provider called.

The authenticated gateway and campaign review screen now expose exact-scope
preview, approval, start, pause and revoke. Uncertain writes remain locked until
the same saved scope and a newer revision confirm the intended action. Start is
globally disabled; pause remains available. The build and seven focused UI checks
passed. A replied lead stops itself without invalidating other approved leads.

See EMAIL_CAMPAIGN_RENEWAL.md for runtime and supervision status. Real customer
multi-day execution remains UNVERIFIED. Existing manual first/second-email paths
retain their old limits.
