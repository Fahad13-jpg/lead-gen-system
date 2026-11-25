# Backend status and recovery summaries — 17 November 2026

The authenticated Settings and Campaigns reads now return additive, fixed-vocabulary
product summaries. This prepares the later dashboard redesign without changing
channel release, billing, eligibility, membership, approval or retry rules.

## Response fields

- Settings `connections[].health`: paused/disconnected/pending capability checks,
  missing/expired/future-dated checks, or recently recorded sending/reply checks.
  A saved `ready` flag alone is insufficient. Recent checks are not a new live
  provider verification or permission to send.
- Settings `apify.health`: not connected, paused, active searches, unsettled
  searches requiring reconciliation, or saved configuration. Separate active and
  unsettled counts use the current organization's exact provider account. The API
  does not claim to verify the live provider balance or credentials.
- Campaigns `campaigns[].lifecycle`: Draft, Awaiting approval, Scheduled, Running,
  Paused or Needs attention. Each includes a fixed `reason` and a labelled
  `next_action`. Uncertain outcomes and unsettled call costs take priority. Plan
  review/approval counts require unexpired, intact content in a completed draft
  state and latest hash-matching approval for the current campaign version.
- Gmail reconciliation `recovery`: distinguish an in-flight operation, unavailable
  reconciliation, an unresolved link, a confirmed reconnect receipt and a proven
  opportunity for explicit fresh authorization. Existing `safe_to_restart` and
  receipt fields retain their meaning. Recovery never replays the OAuth exchange.

All summaries include `execution_authorized:false` and
`automatic_retry_allowed:false`. Campaign summaries also state
`eligibility_checked:false`: detailed execution checks remain authoritative.
Internal assessment inputs, campaign scope/configuration, credentials and raw
provider error text are not returned by the new summaries. Existing private
sender visibility and membership checks remain in place.

## Important distinctions

- A content approval never shows a campaign as Running by itself.
- Enabled automation with no active work can show Scheduled only with an intact,
  unexpired campaign approval, enabled email policy and available renewal service.
- A queued item is recorded work, not a guarantee of eligibility or delivery.
- Provider-accepted email with a recorded reply is stopped work. Local readback
  found this exact case in the owned-recipient acceptance campaign. It now reports
  Paused rather than incorrectly deriving Running from the old dispatch metadata.
- Failed/expired drafts do not count as usable content. Historical approval
  record counts remain available but cannot promote those drafts.

## Verification and rollout

Twenty-seven focused status/data/Gmail checks passed, including tenant/private
visibility, expiry, uncertainty, operation races, preserved no-retry behavior and
safe projection. Actual organization 1 Settings/Campaigns queries ran through a
read-only pool and verified the stored reply-stop case. No provider request,
outreach, campaign/connection mutation or migration was needed. Evidence is in
ignored `.local/backend-status-20261117/verified.json`.

Only the local gateway needs a reload. The current frontend remains compatible
and can consume these summaries during the later dashboard redesign; this pass
does not claim the new labels/actions are already rendered. Automatic repair of
ambiguous provider writes, live calling billing settlement and pending channel
acceptance are separate remaining tasks.
