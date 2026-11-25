# Calling production connection — 15 November 2026

The Outreach dashboard now displays saved calling outcomes, follow-up pause
reasons, booking status/time and unscheduled callback requests. Unknown values
remain unrecorded; pending/uncertain booking is not shown as booked. The API
projects only known result fields and explicit valid appointment timestamps,
without raw provider payloads or Calendar identifiers. Fourteen backend checks,
four React checks and the production build passed. Build `main.6f8422cb.js` is
served locally, with anonymous API access rejected. Evidence:
`.local/call-activity-20261115/`. The real read-only query found zero production
call activities; browser fixtures were not copied into lead history.

The user authorized publishing the browser-tested agent and aligning the backend.
Retell agent `agent_8ad1ab3a505d9b818a8035558e` **version 1 is published**.
Its linked response-engine version 1 is also published. Fresh provider readback
confirmed the tested prompt, tools, model, voice and 60-second limit. Local and
n8n private backend configuration now both pin agent version 1. No phone call,
campaign change, number purchase, budget authorization or workflow activation
accompanied this release. The sole calling campaign remains paused with release
disabled; the dialer and result poller remain inactive/uninstalled.

## Real lead persistence path

The existing authenticated tool worker routes phone tools to the existing
organization-scoped outreach activity. The worker verifies the ongoing call
directly with Retell. The gateway now additionally validates the provider's agent,
version, caller, recipient and dispatch metadata against that activity's original
`expected_request`. An absent or mismatched request blocks mutation.

The gateway resolves the activity/organization/connection itself; model tool
arguments cannot select them. Production tools use installed SQL functions:

- `outreach_call_tool_context`: resolve the authorized activity context and current
  Calendar configuration.
- `outreach_call_result`: persist outcomes, confirmed callback requests and review
  state on the lead's outreach activity. A callback request is not a scheduled call.
- `outreach_call_stop`: persist stop/suppression events using the existing stop
  mechanism. Opt-outs affect future calling eligibility for the lead/stored phone
  within its organization; they do not invent a global cross-channel unsubscribe.
- `outreach_call_booking`: durable booking claim and matching Calendar receipt;
  confirmed bookings stop the related follow-ups.
- `outreach_call_ingest`: record verified provider completion and DNC outcomes.

All five installed definitions matched reviewed source. The source checks were
read-only; no real lead received a fabricated outcome to demonstrate success.
The shared tools remain wired to production SQL for phone calls and isolated
fixture persistence for explicitly armed browser calls.

The phone identity changes and receipt mapping passed 28 focused checks; the
release preflight passed two checks. Installed gateway/receipt-validator files
were hashed and the idle reload preserved workflow activation. Publication
required both successful bound browser receipts and an unchanged tested agent
and response engine. Archived receipt enabled/disabled state is not mistaken for
whether its historical action succeeded.

## Evidence and recovery

- `.local/calling-production-20261115/release-journal.json`: published and pinned.
- `release-before-private.json`: old agent/engine/config backup.
- `release-after-private.json`: published configuration readback.
- `storage-verification.json`: installed production function comparison.
- `.local/calling-browser-test/`: archived browser opt-out and real Calendar
  booking receipts.
- Timestamped `.local/browser-call-tools-20261115-refresh-*` directories: runtime
  file backups, hashes and reload journals.

Private backups include credentials and must not be committed or shared. After an
uncertain publish or pin response, inspect the journal and retrieve the exact
provider version; never blindly repeat publishing. Publishing is not dialing.
Published versions are immutable: future tool URL/prompt changes require a new
draft, reviewed testing, publishing and explicit backend version alignment.
If rolling back local binding/runtime, keep calling disabled and check for active
or uncertain calls first. Do not restore the whole database over newer lead work.

## Remaining acceptance

1. Choose the deployment host/domain and replace the temporary tunnel with stable
   HTTPS. A new published version will be needed for the changed tool URLs.
2. Purchase or bind an authorized US caller number and verify its actual route.
3. Configure the paused campaign's complete connection using the tested published
   agent/version, credential reference, number and funding. It currently has no
   caller/agent connection object; no incomplete connection was marked ready.
   This change must use normal campaign versioning before plan generation/approval.
4. Verify recipient eligibility, timezone, fresh quote and bounded spend. Make one
   explicitly authorized owned-number call and verify real lead persistence,
   provider completion and complete billing settlement.
5. Only then install/review the dialer/poller and enable a bounded release.

Browser opt-out persistence and actual Calendar insertion have passed. Production
phone-to-lead acceptance, telephone delivery and billing remain unverified because
no telephone call has been made. Initial routing remains US English; other markets
are not implied by this release.

Provider publishing operation:
https://github.com/RetellAI/retell-python-sdk/blob/main/src/retell/resources/agent.py
