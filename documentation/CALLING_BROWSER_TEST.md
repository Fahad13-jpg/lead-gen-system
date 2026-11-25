# Browser tool acceptance

Booking checkpoint, 15 November: the user's browser test completed availability
lookup and booking (two tool requests), with durable `booking.state: booked` and
`meeting_booked` outcome. The Google transport accepted only a matching confirmed
event receipt before saving this state. Event ID:
`9ec867771d6110c379ac11e56efb81d85932539458181d27f798e9d76447d35c`.
Interval: 16 November 19:31–19:36 UTC, equivalent to **17 November
00:31–00:36 Asia/Karachi**. The private test event is preserved. The receipt was
archived and session disabled; no customer lead was updated. Evidence:
`.local/calling-browser-test/1c4cf72d4191359ccffa1550598eb2ba-receipt-private.json`.
This verifies real browser-to-tool Calendar insertion for the isolated fixture;
production lead updates, telephone routing and final billing remain separate.

Verified checkpoint, 15 November: the user's retry successfully bound one browser
call and persisted one `opt_out` event with `stop_reason: opt_out`. The receipt
was read back, archived and the session disabled. Evidence:
`.local/calling-browser-test/94b62282e051559a730d51d703945961-receipt-private.json`.
This proves browser-to-tool opt-out persistence in the isolated fixture; it does
not prove production lead suppression. No Calendar booking was requested in this
test. Booking acceptance is next. Historical pending statements below describe
the initial installation before this successful retry.

Installed 15 November 2026 on the existing authenticated Retell tools webhook.
No new tables, webhook, caller number, dialing schedule or campaign release.
The browser fixture is **not a production lead**. Saved test outcomes and opt-outs
are durable in n8n's private session file; they do not update customer leads or
prove production SQL suppression. Calendar booking uses the real existing OAuth
transport and creates a private `[TEST] Lead workspace browser meeting` event,
without guests, emails or reminders.

## Run the first test

1. The operator prepares the fixture from the paused campaign's saved Calendar:
   `node scripts/calling/browser-test-session.cjs prepare 1 3`.
   This uses read-only campaign queries, verifies the local workspace and writable
   Calendar, and saves only the existing future owner-offered slots. Test timezone
   is explicitly Asia/Karachi. It never edits campaign settings or creates a call.
2. Open `.local/calling-browser-test/approved-call-brief.txt`. Copy its entire
   contents into Retell **Test Audio → { } → approved_call_brief**. Include the
   first `Browser test session:` line. Do not add that value as an agent-wide
   default or use this fictional offer in a customer campaign.
   The editor may flatten the brief into one line; both newline and space
   separation are supported. The exact session code is still required.
3. Arm immediately before testing:
   `node scripts/calling/browser-test-session.cjs arm`.
   The session expires ten minutes later. The operator does not start a call.
4. In Retell, use **Run Test** on draft 1. Say “Don't contact me further.” The agent
   should acknowledge, invoke opt_out and end_call without asking again.
5. Read the durable receipt:
   `node scripts/calling/browser-test-session.cjs status`.
   Expect `bound_to_call: true`, outcome `opt_out` and stop_reason `opt_out`.
   Spoken acknowledgment alone does not prove persistence. No receipt means the
   test has not passed. Do not replace an uncertain booking session blindly.
6. Disarm after collecting the result:
   `node scripts/calling/browser-test-session.cjs disarm`.
   This archives the private receipt locally and disables the session.

For a separate booking test, prepare a fresh session, copy the new brief, arm it,
and ask to book a demo. Choose a time returned by get_available_slots and explicitly
confirm its date, time and timezone. Check both a `booked` receipt and the matching
test event in the selected Calendar. An expired/past slot needs an owner update
through the existing dashboard; the operator does not invent another slot. Delete
only that exact test event manually after acceptance, if desired.

Retell browser audio can consume credits. The integration/installation itself
launched no calls or inference and created no event.

## Authority and failure behavior

- Both ingress and worker require the existing secret header. The worker then
  retrieves the call directly from Retell, verifies ongoing web_call status,
  agent/version and start time, and checks the session nonce against provider-held
  dynamic variables. Incoming model/body metadata alone cannot authorize anything.
- Only the first matching call can bind; other calls are rejected. No browser
  request opens the production SQL connection. Agent version 1 applies only to this
  browser fixture; the telephone pin stays version 0 until reviewed release.
- A ten-minute session permits at most 20 ordinary tool requests and one booking
  claim. Explicit opt-out remains available at that request limit and uses one
  canonical event ID. A persisted opt-out prevents later interest/booking actions.
- The same tools, slot checks, booking orchestrator, Google Calendar transport and
  receipt validation serve the fixture. Only its persistence port is isolated.
  This does not replace production SQL acceptance or telephone routing tests.
- Durable file locking and atomic replacement prevent two booking claims. A failed
  or uncertain Calendar insertion retains the claim; another request cannot insert
  again. An unresolved booking blocks arming a replacement session. Reconciliation
  and exact-event lookup are required before retrying or clearing that condition.
- Missing nonce, inactive/old call, expired/disabled session, wrong agent/version,
  identity arguments, uncertain file write or lock failure fail closed. There is
  no automatic retry, booking simulation reported as success, or fallback to real
  leads. Lock or `.next` files are evidence to inspect, not files to delete blindly.
- A real event receipt proves Calendar insertion for this fixture; opt-out here
  proves the browser tool and fixture persistence path. Customer lead suppression,
  callback scheduling, actual dialing and billing remain separate acceptance work.

Runtime files live under `/home/node/.n8n/` in the persisted n8n volume. Secrets and
session files stay out of tracked source. Rollback copies and reports are in
`.local/browser-call-tools-20261115/` and the `-refresh` directory. Final readback
verified all five installed files, n8n readiness and the existing active webhook.
The focused 20 checks passed; real audio/tool/Calendar acceptance remains pending.

The first audio opt-out attempt reached the tool but was rejected: the provider
brief contained the correct nonce with its newline flattened into a space. The
original parser incorrectly required the nonce to occupy a separate line. The
corrected parser supports both formats, rejects duplicate/extended nonce values,
and passed five focused regression checks, including an offline comparison with
the actual provider brief. The ended call was not replayed and no saved opt-out
is claimed for that failed attempt. Evidence:
`.local/calling-browser-test/format-regression.json`.

Provider call fields used for the verified lookup follow Retell's official SDK:
https://github.com/RetellAI/retell-python-sdk/blob/main/src/retell/types/web_call_response.py
