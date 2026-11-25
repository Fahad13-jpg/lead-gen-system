> Current connection status: see [2026-10-28 tool deployment](CALLING_TOOLS_DEPLOYMENT_20261028.md). Earlier local-only statements below are historical.

# Requested calling features — local development

Scope: Calendar booking, backend opt-out synchronization, structured outcomes and
callbacks, and approved follow-up calls. Deployment, funding-plan development,
dashboard integration and live testing were explicitly deferred. No remote agent
configuration, phone/browser calls, model requests, live DB migrations or n8n imports
were performed in this feature pass.

## Calendar tools

`scripts/calling/tools.cjs` implements authenticated backend ports for
get_available_slots and book_meeting. Identity comes from the gateway, not agent
arguments. The database context binds organization, activity, provider call and
connection, and supplies the owner calendar/slots. Up to five availability checks
offer at most three slots; failed/unknown checks never count as free. Duplicate slot
IDs are rejected. Bookings require explicit recipient confirmation, durable interval
claim, fresh Google availability, deterministic event ID and matching receipt.

Booking persistence now writes the meeting-booked stop event in the same transaction,
so a crash between saving an event and recording the conversation outcome cannot
leave another call eligible. Opt-out takes precedence if it races with booking.
Claims and stop writes share a consistent lock order. Uncertain inserts retain their
claim for reconciliation. Google transport/OAuth and the external tool gateway are
not connected yet; existing API mappings remain mock-only.

## Opt-out and structured outcomes

Migration 043 adds outreach_call_ingest, outreach_call_result and
outreach_call_tool_context using existing JSON columns. Correlated Retell GET results
with the documented user_requested_dnc reason create durable idempotent opt-out
events. This is separate from untrusted AI summaries. No summary can confirm a
booking or grant permission. Phone-call receipt validation remains mandatory.

The existing result-poller workflow now writes through DNC-aware ingest. Structured
agent-tool results include interested, busy, not_interested, callback_requested,
wrong_person, human_requested, opt_out and unknown. Replayed event IDs are idempotent;
conflicting reuse is rejected and event history is bounded. Not-interested/human
requests pause further calls; later busy/interested results cannot clear that pause.
Provider line-busy/no-answer reasons remain technical outcomes, not buying intent.

## Callbacks and later approved calls

Callbacks require a confirmed complete date/time, explicit offset, and matching named
timezone. Relative/ambiguous text is rejected. Recording a callback returns
requested_pending_approved_step, not scheduled. If there is no suitable approved
strategy step, the request remains for review. Callbacks cannot override signed
delays or owner/plan windows. A callback more than 15 minutes overdue requires review
instead of silently dialing late.

Migration 044 supplies outreach_call_step_check. The existing scheduled dispatcher
can now reserve a later approved call step with its own plan/step identity, lease
and approved call brief. Current approval/hash/context, stop/reply state, campaign
and plan windows, spacing, daily limits, global concurrency and existing budgets all
still apply. Call parents must have ended and settled without cost conflicts.
Campaign followup_outcomes explicitly allow only desired busy/line-busy/no-answer/
callback dispositions; unknown/interested outcomes require review. Optional
followup_after_email also requires the existing email conversation gate and fresh
reply checks. No extra step, retry or automatic redial is created.

The opt-in strategy handoff now attaches the exact follow-up message to each approved
call brief before save/hash/approval. Template sequences may include other permitted
channels under that opt-in, with unmatched steps still requiring review. Existing
approved plans are never mutated and the default integration remains disabled.

## Artifacts and verification

- Migrations 038/039/041/042 were extended locally; 043/044 are new and unapplied.
- 07g_retell_call_executor and 09d_retell_result_poller remain inactive; routing and
  existing sticky-note text are preserved, with an appended current-scope note.
- 06C retains its graph/routing/notes; its generated Code bundle includes the
  generation-time follow-up handoff. No import occurred.
- tool-contract.json is the backend contract, NOT a guessed Retell HTTP-tool payload.
- AGENT_PROMPT.md has a local tool revision; it has not been uploaded to Retell.
- Offline regression: 106 test entries passed, zero failed, covering calling plus
  native strategy, contract, preview, schedules and existing follow-up behavior.
- calling-features-scratch.cjs passed in scratch_email_release_20261019 inside
  isolated lead_diag_pg_20261011; migrations 037–044 and all fixture writes rolled back.

UNVERIFIED until the next connection phase: real Retell custom-tool payload/signature
authentication, reachable existing ingress, Google Calendar OAuth/round trips,
browser-call identity binding and end-to-end provider DNC behavior. No new table or
webhook was added. This work does not assert that a browser call is ready to run.

API references checked: Retell Get Call (disconnection_reason), Update Retell LLM
(general_tools) and Google Calendar freebusy.query. Provider tool attachment is
deliberately left for the backend connection phase instead of inventing an endpoint.
