# Email follow-up queue — 10 November 2026

Strategy review now shows saved email follow-up steps with their current eligibility
state: waiting for the previous email, waiting for the approved delay or sending
window, stopped, plan refresh required, blocked, needing reconciliation, accepted
by the provider, or ready for release review. Acceptance is not labelled delivery.
The queue reads existing approved schedule data and the existing PostgreSQL
outreach_followup_check function; it does not recalculate or shorten delays.

Only the selected organization's campaign is queried. The read is paginated before
eligibility checks (at most 25 rows/request), and JSON array access uses CASE type
guards. Unknown/malformed states fail closed. Existing activities, especially
uncertain sends, remain visible and never become permission to retry. No new
tables, migrations, n8n webhooks or workflows were introduced.

API: authenticated GET `/dashboard-api/api/email-followups`, with organization and
campaign identity plus bounded page/limit. The panel has a refresh action and no
send/start action. It returns no credentials or provider response bodies.

## Existing release boundary

The existing rollout expires within 24 hours and permits at most two approved email
steps. The new batch path currently releases first messages only. Extending its
expiry to span a multi-day campaign or renewing its authority automatically would
change the existing operator-issued release decision. Neither was implemented.
The queue labels later steps as outside the current release scope rather than
claiming they can run. A due step still needs a fresh reviewed release, current
plan/sender readiness and the original reply, suppression, timing and quota checks.

This increment completes follow-up visibility, not multi-day sending authorization.
Future renewal/exact-follow-up release work must preserve the old activity and
thread identity and must not regenerate a first email or replay uncertain steps.

## Verification

Twenty-two focused backend/HTTP tests and four queue/plan-review UI tests pass.
State fixtures cover delay, window, previous acceptance, reply/opt-out stop, expiry,
old campaign versions, uncertainty and unsupported later steps. The read-only SQL
integration check selected a real stored campaign with four follow-up steps; all
four remained blocked by existing eligibility checks. No records were modified and
no provider, model, inbox, Apify or send calls occurred. Evidence:
`.local/email-followups-20261110/result.json`.

Real due-to-send acceptance and authenticated browser interaction remain UNVERIFIED.
Multi-day release management remains unfinished under the unchanged 24-hour bound.

Local installation: optimized build main.83656b05.js is served by the reloaded
dashboard gateway, with dashboard starting explicitly disabled. Campaign navigation
returned 200 with the current bundle; the anonymous follow-up route returned 401.
No n8n workflows or schedule activation were changed. Smoke evidence:
`.local/email-followups-20261110/smoke.json`.
