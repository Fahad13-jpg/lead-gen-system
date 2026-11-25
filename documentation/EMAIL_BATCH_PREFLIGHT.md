# Email batch preparation — 9 November 2026

Strategy review now includes a read-only batch preflight for owners and admins.
Select up to ten approved, current, unexpired first-email plans from the visible
page, then check the selected messages. The server reloads plan hashes, recipients,
latest approvals, campaign version and sender configuration rather than accepting
them from the browser. It invokes the existing read-only first-step eligibility
check and blocks any previous first-step activity, including uncertain attempts.

Sender checks include the saved binding/version, active membership, private account
ownership, sending/reply capabilities, check freshness and configured limits. The
initial bounded rollout remains at most ten daily and ten per rolling 24 hours,
with at least 300 seconds between messages. The review packet expires within 24
hours and no later than the selected plans. It includes exact plan hashes and
recipients, but no credential references, tokens or account-owner identifiers.

This is an advisory snapshot, not an issued transport release. The existing
operator-issued release, workflow binding and activation review remain mandatory.
The preflight changes no policy, creates no reservation, calls no provider and
grants no send authority. It does not evaluate the sending window or reserve quota;
the executor rechecks timing, quotas, suppression, freshness and all other gates.
Follow-ups are outside this first-message packet. Campaign pause remains available
through the previously implemented versioned policy action.

Files: scripts/dashboard/email-preflight.cjs, the fixed GET route
/dashboard-api/api/email-preflight, and dashboard EmailBatchReview. No migrations,
tables or n8n webhooks were added. No workflow imports or activation were performed.

Validation: 23 focused backend/HTTP tests and six batch/plan-review UI tests passed.
The SQL query also executed against local lead_db through the read-only connection.
The inspected historical plan correctly remained blocked by paused policy, stale or
changed sender/plan bindings and its previous dispatch record. Evidence:
.local/email-preflight-20261109/result.json. This was an operator SQL integration
check, not an authenticated browser journey. Full browser interaction and real
customer release/send acceptance remain UNVERIFIED.

Local installation: the optimized build main.09e30013.js is served by the reloaded
dashboard gateway. Campaign navigation returned 200 with the current bundle;
anonymous preflight returned 401. Smoke evidence:
.local/email-preflight-20261109/smoke.json. Only the dashboard gateway was reloaded;
n8n containers, workflows, schedule activation and database data were unchanged.
