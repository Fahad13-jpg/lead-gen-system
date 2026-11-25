# Stored-contact readiness and daily-cap control — 9 November 2026

## Read-only contact audit

The current clinic campaign (org 1, campaign 1) was checked against the stored
email-bearing leads, with a hard bound of 20. Nine records matched the selection;
none had a permitted channel for this campaign. No site was fetched, no lead or
campaign was changed, and no model, Apify or outreach request was made.

| Lead | Actual blocking result |
|---:|---|
| 173, 176 | No eligible cleaning link; strategy context is intentionally unavailable |
| 230, 231 | Location mismatch and invalid/risky/review-required email status |
| 172 | Industry mismatch and missing eligible published-contact record |
| 171, 165 | Industry/location mismatch and missing eligible published-contact record |
| 170 | Industry/location mismatch and business/contact review required |
| 159 | Industry/location mismatch and invalid/risky/review-required email status |

The first audit labelled null contexts as unconfirmed failures. The diagnostic
now distinguishes the actual cleaning-eligibility fence from preparation errors.
No eligibility rule, email status or source evidence was altered to get a passing
result. Private metadata/briefs: `.local/strategy-email-candidates.json` and
`.local/strategy-email-candidate-briefs.json`. No email values appear in the summary.

The next authentic sendable-plan acceptance needs a campaign-matching contact with
current published source evidence, valid basic checks and no review/suppression
blocks. An email string alone is insufficient. Current AI processing remains
paused; 4/month are used and 6 remain. The existing release gate is unchanged.

## Daily email cap control

The campaign preferences form now exposes the saved daily email cap only when its
binding matches the organization-owned sender registry: org, connection, version,
provider, credential and email. The registry's daily_limit supplies the ceiling;
no new allowance or tier promise is invented. The snapshot's private fields stay
on the backend; the browser receives numbers, availability and scope only.

Saving a cap reuses the versioned campaign-save path and preserves enabled state,
sender binding, rolling limit and minimum spacing. Missing/mismatched/stale-version
bindings, non-integer values and values outside 1..ceiling are rejected before
writing. Registry changes after the read are still checked by the existing
execution-time sender gate, which rejects policies exceeding its current limit.

The existing organization-wide behavior is preserved and explained in the UI:
the lowest cap among enabled email campaigns is shared across the organization.
This is not a separate daily allowance for every campaign. Mailbox/provider/plan
limits and all dispatch checks still apply. The number is a requested configured
cap, not a promise that that many messages will be sent or delivered.

Read-only live verification found campaign 1 at 10/day with a 10/day sender
ceiling, sending disabled. Campaign 2 has no usable binding for this control and
shows the bind-sender instruction. Neither live configuration was changed.

Verification: 52 backend checks passed; six preference-screen UI tests passed.
The isolated scratch database `scratch_contact_refresh_20261108` accepted a lower
cap through the existing sender gate and rejected a cap above the sender ceiling.
Versioning, history/sender preservation, fingerprint invalidation and cross-org
checks also passed. All scratch changes rolled back and the container stopped.
The static UI detector reported no findings. No migration, workflow import or new
webhook/table was needed. Authenticated browser saving remains UNVERIFIED.

The first frontend build hit ENOSPC because C: had zero free space. Only the
recreatable npm downloaded-package cache at the verified non-link path
`C:\Users\hp\AppData\Local\npm-cache\_cacache` was cleared with filesystem
approval, recovering about 1.89 GB. Installed dependencies, source, credentials,
diagnostic evidence and database backups were retained. The retried production
build succeeded as `main.c495248a.js`. The local dashboard gateway was reloaded to
serve the expanded preference projection and bounded cap-write handler. No n8n
restart, live cap change or provider request was needed.
