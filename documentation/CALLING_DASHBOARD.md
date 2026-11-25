# Calling calendar and pause controls — 14 November 2026

Installed locally in campaign review. No tables, migrations, calling schedules,
provider credentials or booking events were created. Production build:
`main.4ea0b595.js`. The dashboard gateway was reloaded; n8n was not restarted and
workflow activation was not changed. Both existing email start switches remain off.

## Supported operations

Owners/admins can read saved calling configuration, explicitly load writable
calendars through the existing organization-bound calling-tools connection, select
an explicit calendar ID, and offer meeting slots. Dashboard Google sign-in does
not authorize Calendar access. Unmapped organizations cannot use the operator's
Calendar connection. Only owner/writer calendars are offered; the alias `primary`
is rejected. A selected calendar is not proof of booking/write acceptance.

Offered slots require valid explicit-timezone instants, future starts within 90
days, positive durations no greater than a day, and no overlaps. The UI offers up
to ten slots (backend bound: twenty). Slot IDs are deterministic for the calendar
and normalized UTC instants. Empty slots intentionally offer no meetings. Existing
call tools still recheck availability at booking and require recipient confirmation.

Saving a calendar uses the existing versioned strategy_campaign_save function and
preserves trusted connection, quote, funding and recipient-permission data. It
always pauses calling and disables the release. Older plans need regeneration and
review. Calendar edits are blocked while any call in that organization is active
or uncertain. The write uses the same global advisory lock as call admission,
checks membership again, and locks the current campaign before saving.

Pause remains available without Calendar access and with an in-flight call. It
prevents future admission; it cannot recall an admitted call. No start/release
button was added without the remaining verified caller/route/budget integration.
Unknown writes remain locked until the next saved version matches the requested
paused state and exact calendar/slots. There is no automatic retry.

## Evidence and current dependency

Seven focused service checks and the fixed-route authentication/origin check
passed. Seven relevant React checks passed (four controls, three plan-review).
The normal production build passed with one minifier worker on the 4 GB host.

The actual read adapter passed. The existing Calendar-list request currently
returns a backend failure: HTTP 200 with `ok:false`,
`reason:tool_backend_unavailable`. The tool route rejects unauthenticated requests
with 401 and its workflow remains active. Sanitized log indicators did not
establish a revoked token, invalid grant, missing credential or unknown node.
Do not describe this as a proven Google reauthorization requirement. The custom
node's catch currently hides the underlying cause; that dependency needs diagnosis.
No calendar ID, token or raw provider payload was logged by the new diagnostics.

15 November diagnosis: the guarded two-file runtime update now emits only
allowlisted diagnostic codes. It was applied to the actual nested custom-node
directory (`/home/node/.n8n/custom/custom`) after matching original source hashes
and confirming no active executions or calls. Workflow activation was preserved.
The original files and installation result are in
`.local/calling-tool-diagnostics-20261114`. This later diagnostic reload is separate
from the earlier dashboard-only installation.

The subsequent read-only check returned `calendar_reauthorization_required`.
The existing Google Calendar authorization therefore needs renewal in n8n's
**Google Calendar account** credential. This supersedes the earlier generic,
unidentified backend-failure checkpoint above. The dashboard API exposes only
`CALLING_CALENDAR_REAUTH_REQUIRED`, never raw OAuth errors. No further Calendar
read or booking is needed until the account is reconnected. Evidence:
`.local/calling-dashboard-20261114/calendar-diagnostic.json`.

After the user's reconnection on 15 November, one read-only adapter check
succeeded and returned **two writable calendars**. Calendar authorization is
restored; no event, campaign change or call was created. The updated
`read-adapter.json` is the current connection result. Calendar choice and offered
times still belong to the owner; neither was guessed or saved by this check.

Call readiness now has a fixed authenticated read endpoint and an explicit check
button in campaign review. It uses existing step/runtime SQL checks for at most
20 call steps from ten current-version plans and shows workspace active/uncertain
records without provider IDs or credentials. It reserves nothing, enables no
release, performs no provider request, and never authorizes a call. Current read-only
adapter evidence found zero saved call steps and zero active/uncertain records for
the selected fixture workspace: `.local/calling-dashboard-20261115/read-preview.json`.
Nine calling-service checks and six relevant React checks passed. Authenticated
browser/customer acceptance remains UNVERIFIED.
The preview is installed locally in production build `main.ff840362.js`; runtime
checks confirmed the page is served and anonymous preview requests are rejected.
Evidence: `.local/calling-dashboard-20261115/runtime.json`. No n8n restart,
workflow activation, provider request or credit reservation accompanied this UI
installation.

Evidence: `.local/calling-dashboard-20261114/read-adapter.json` and `runtime.json`.
The adapter check used a trusted local membership fixture and read-only SQL; it
does not establish authenticated browser acceptance. No campaign was modified.

Still unfinished: owner-selected Calendar slots and real booking acceptance,
controlled browser-call binding, real audio/tool/outcome
acceptance, verified US caller/route/funding, and reviewed dialer/poller release.
No old call permission is reused for a new call. No actual audio, appointment or
phone delivery acceptance is claimed.
