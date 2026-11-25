> Current connection status: see [2026-10-28 tool deployment](CALLING_TOOLS_DEPLOYMENT_20261028.md). Earlier local-only statements below are historical.

# Calling executor — local implementation

## Requested feature completion — local only

Calendar tool orchestration, provider-DNC synchronization, structured outcomes,
confirmed callback requests and later approved call steps are implemented locally.
See CALLING_FEATURES_LOCAL.md for exact behavior, tests and remaining connection
work. Migrations 043/044 are unapplied. No deployment, funding-plan change, dashboard
work, remote agent update or live test occurred in this pass. The agent prompt has
a newer local tool revision which still needs upload when the backend is connected.

## Retell draft connected — 2026-10-28

The user's agent `agent_8ad1ab3a505d9b818a8035558e` was configured via Retell metadata
APIs and verified by read-back. Both agent and response engine remain unpublished
version 0. Dynamic approved-brief prompt, English (US), 60-second maximum,
10-second silence ending, End Call, voicemail/IVR hangup and built-in DNC detection
are configured. Existing voice/model were preserved. No model inference or telephone
call was run, no number assigned, no n8n workflow imported and no database migrated.
See RETELL_ACCOUNT_SETUP.md for evidence and remaining Calendar/backend tool,
number/organization and billing integration. These remain blocked for live release.

## Dispatcher, strategy handoff and tools — 2026-10-28

Added the actual inactive n8n workflows `07g_retell_call_executor.json` and
`09d_retell_result_poller.json`, alongside the preserved read-only previews.
Schedule -> scoped atomic claim/begin -> single Retell POST -> correlated receipt
-> durable result. The separate schedule polls known call IDs. No POST retry exists.
Unknown outcomes and costs retain reservations and stop the global calling queue.

Migration 041 adds runtime checks for approval/hash/freshness, US/English connection,
reviewed recipient permission/timezone, campaign and plan windows, spacing, release,
daily quota and shared/BYOK budget. Migration 042 adds durable Calendar slot claims
and tenant/call-bound opt-out events using existing activity JSON. No tables or
webhooks were added. Tool storage is wired to SQL through an injected backend port;
actual authenticated provider tool ingress and Calendar transport remain unconnected.

The v2 strategy Code bundle now has an explicit operator-only generation handoff
(`CALLING_INTEGRATION_ENABLED`, default off). It can mark reviewed call readiness
and clear only the offline marker from successful validated call drafts before
save/hash/approval. Plans keep `execution_authorized: false`, matching strategy_finish.
No approved plan is modified and no approval is automatic. Existing v1/default,
email, customer-template, graph, routing tails and sticky notes are preserved.

Scratch checks for 037–042 passed and rolled back. Independent-session tests in a
temporary scratch clone proved two dispatch sessions authorize one call and two
overlapping booking sessions acquire one slot; that clone was removed. No production
database, workflow import/activation, provider call or Calendar write occurred.

Final offline regression: **88 test entries passed, 0 failed** across calling,
embedded native strategy, contract and preview tests. Correlated provider summaries
are length capped and stored as untrusted review data. They cannot confirm booking,
grant permission, trigger suppression or release funds. Only authenticated tool
actions and verified receipts can do those operations. The default calling handoff
flag remains off; account setup has not been performed.

Connection steps and remaining account-dependent checks are in CALLING_SETUP.md:
Retell account/number/voice, credential binding, authenticated tools within approved
ingress, Calendar OAuth and final billing mapping. Live provider/n8n round trips
remain UNVERIFIED. These local artifacts do not imply a deployed or live-ready agent.

## Cost settlement — validated locally, 2026-10-28

Added migration 040 and settlement.cjs. All required billing providers must supply
verified final USD receipts bound to the organization, connection and provider call.
The adapter adds integer micro-USD costs and computes stable receipt evidence identity.
SQL accepts settlement only after the provider has ended the attempted call, rejects
conflicting outcome state, releases the reservation once, and handles identical replay.
A changed bill or actual cost above reservation requires review and blocks subsequent
reservations for the affected funding scope. Actual provider-unit conversion and
provider/carrier coverage mapping remain UNVERIFIED; no billing API was called.

Validation: **67 offline tests passed**. The isolated container
`lead_diag_pg_20261011` was started after finding it stopped. Migrations 037–040
passed the reservation/observation/settlement scratch suite in
`scratch_email_release_20261019`; the transaction rolled back. No live database
changes, provider calls, Calendar writes or workflow imports occurred. The earlier
automatic-approval usage-limit blocker was resolved through the normal approval path.
Migrations remain unapplied to the live database.

The normalized outcome reducer no longer treats a cost event as authority to release
funds: only durable all-provider settlement does that. Calendar input now rejects
impossible dates instead of allowing JavaScript date rollover, and equivalent time
offsets produce the same event identity. These changes are covered by offline tests.

The later dispatcher/tools section above supersedes the implementation gaps recorded
at this milestone. Real account/credential/tool/billing connections still require
setup and verification; no live deployment or account creation has occurred.

## Calendar adapter — 2026-10-28

Validation: `node --test tests/calling/*.test.cjs` — **60 tests passed**, all offline.

Added `google-calendar.cjs`: mock-only Google API mapping for free/busy, event insert
and lookup of an uncertain event by its deterministic ID. Explicit organization and
calendar binding is required; the ambiguous `primary` alias is rejected. Missing,
errored or incomplete availability is unknown, never free. Overlapping busy intervals
block booking. Receipt checks require the event identity, confirmed status, matching
times and organization/call metadata. Offset-free timestamps are rejected.

The booking orchestrator now uses this adapter in an offline integration test.
No attendee invitations, conferencing or reminder notifications are requested; event
requests omit attendees and specify sendUpdates=none. This is not a guarantee about
provider-generated notifications when later connected live. Calendar OAuth, durable
slot locks, agent tool authentication and live verification remain UNVERIFIED.
External edits can race between free/busy and insertion; the adapter does not claim
atomic exclusion across external Calendar clients. A timeout or 404 keeps the booking
uncertain and does not permit a fresh insertion. No actual Calendar requests occurred.

API references checked during implementation:
https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query
https://developers.google.com/workspace/calendar/api/v3/reference/events/insert

## Durable provider observation progress — 2026-10-26

Validation: **50 offline tests passed**. Migrations 037–039 and observation binding,
replay, stale-status, terminal-conflict and retained-budget checks passed on
`lead_diag_pg_20261011/scratch_email_release_20261019`; the transaction was rolled
back. No live database changes or provider requests occurred.

Migration 039 (unapplied) stores provider observations in existing dispatch_metadata.
It requires the matching org, activity, lease, connection, approved content hash and
call identity, plus a previously started attempt. A reservation alone cannot become
a provider-accepted call. Replay is idempotent, late statuses cannot regress an ended
call, and conflicting terminal states are marked for reconciliation. Provider text,
transcripts and AI-inferred sales claims are not copied into this factual state.
Ended/error/not-connected observations retain the cost reservation until separate
all-in cost settlement. No call authorization or budget release is implemented here.

`reconcile.cjs` is a mock-only lookup/storage adapter. Missing IDs and failed lookups
remain unresolved; a 404 is not evidence that it is safe to dial again. It validates
the returned call against the expected sender, recipient, agent, version and tenant
metadata before writing. The final begin gate must persist this expected binding
before dialing; that production path remains unimplemented. No new webhook was added.

039 has no public ingress. The worker must authenticate the provider connection;
the database function trusts only the restricted backend role, not arbitrary webhook
payloads. Production signature verification, durable suppression and cost settlement
remain outstanding. Scheduled JSONs remain read-only previews.

## Current rollout decision — 2026-10-26

The user changed the initial target to **US / English**. Pakistan and Urdu are
deferred. This supersedes the Pakistan-first requirements below. The policy now
blocks non-US destinations and non-English language for the initial rollout.
The existing Retell-hosted US number remains the proposed sender, but no number,
credential or account binding was configured during this work.

Added a mock-only Retell adapter (`retell.cjs`) which builds the documented create-call
payload, pins agent/version, requests a 60,000 ms maximum duration, carries approved
brief data and checks response correlation against organization, dispatch, agent,
sender and recipient. No arbitrary request overrides, credentials or network client
are exposed. Unknown or timed-out create results are not retried. A +1 prefix alone
does not prove a US destination; a trusted country confirmation is also required.

`windows.cjs` intersects plan and campaign windows in the verified recipient timezone,
including daylight-saving changes and 60 seconds of room before closing. It rejects
unknown zones, malformed and unsplit overnight windows. It does not invent allowed
legal calling hours or infer a timezone from the sender's location. This pure check
still needs to be wired into the atomic begin gate; Schedule Trigger timezone alone
is insufficient.

`scripts/calling/AGENT_PROMPT.md` is an English agent draft, not uploaded. It limits
claims to approved brief data, identifies the AI assistant, ends on opt-out, and
requires backend receipts before claiming a callback or meeting was booked. No tool
endpoints are deployed. Legal eligibility is a separate pre-dial gate, not a prompt.

Documentation checked: https://docs.retellai.com/api-references/create-phone-call
(request fields, HTTP 201, metadata and statuses). Live acceptance of the selected
agent configuration and duration-limit behavior remains UNVERIFIED. Cost normalization
and separate carrier charges are deliberately not inferred from a response example;
snapshot mapping keeps cost settlement pending. No automatic provider-cost settlement.

**43 offline tests passed** after this addition. No migration was applied, workflow
imported, live call made, Calendar event created or model invoked. Final begin gate,
authenticated result persistence, real Calendar adapter and controlled live validation
remain outstanding. Existing scheduled workflows remain read-only previews.

2026-10-25. Mock-only execution, read-only SQL/workflow previews and durable reservation
SQL. Migrations 037 and 038 were tested in rolled-back scratch transactions only;
both are unapplied on live DB.
No workflow imports, provider calls, Calendar changes or sending. Existing email
executor and strategy generator unchanged.

User clarified that Pakistan routing is NOT yet confirmed. Number/provider setup
will be the last step; do not mark any connection ready based on the earlier message.

## Confirmed requirements

- Pakistan first; English and Urdu; US later through a separately approved route.
- One active call globally for initial rollout; all organizations share this lock.
- Target 45–55 seconds, maximum 60 connected seconds, subject to provider verification.
- Scheduled queue processing in customer-selected windows, start/pause/resume controls.
- Shared platform calling budget **USD 10/month across all organizations**. It is not
  a per-organization entitlement. Oldest eligible request first, with a small daily
  per-organization allowance. Numeric allowance and window length are unconfigured;
  neither is silently invented or treated as unlimited.
- Customer-funded Retell workspace is separate from the shared pool. API credentials
  belong to org_id; payment details stay in the provider billing portal. All plans
  retain the earlier BYOK capability. Subscription fees do not purchase carrier usage.
- Google Calendar availability and booking; a callback request is a queue task,
  not a confirmed meeting. No live transfer in this first slice.

## Implemented offline

`scripts/calling/policy.cjs`: tenant/funding binding, destination route check, existing
approval/readiness/suppression gates, calling windows, daily allowance, concurrency,
quote freshness, billing period, reservation-aware shared/customer budget preview.
The USD 10 ceiling is fixed for platform funding; supplied larger ceilings cannot
override it. Cost quotes must include AI, carrier billing increments and applicable
fees. Fixed recurring charges consume the same pool if platform-funded. Nonzero
reservation quotes and explicit safety buffers are required. No production budget
reservation occurs here.

`executor.cjs`: mock-only scheduled tick selecting one eligible job; consumes the
existing strategy call brief. Atomic reserve/begin port must recheck approved hash,
paused/cancelled state, suppression, limits, funding and global lock. It retains the
lease and reservation when call creation/receipt is uncertain. No automatic redial.
Provider acceptance does not mean connection, completed call or confirmed outcome.

`calendar.cjs`: mock-only confirmed future slot booking, organization/calendar
authorization, serialized booking claim, fresh availability check, deterministic
event identity and uncertain-insert reconciliation. Slot lock and idempotency are
storage responsibilities; these tests do not prove database concurrency safety.
External calendar edits can still race with free/busy checks; final integration must
handle conflicts honestly. No invitation or email is sent by this slice.

## Next implementation boundary

1. Reservation storage now uses existing outreach_activities.dispatch_metadata (038).
   Next add an independently gated begin transition and durable outcome settlement,
   without weakening email gates or adding tables/webhooks. If existing storage cannot
   express this safely, report the conflict before changing the structural scope.
2. Extend the inactive read-only queue/reconciliation previews into a dispatcher only
   after durable reservations and provider adapters are implemented. Dispatcher polls rather
   than holding a workflow open for a call. Its interval is not a promise to dial at
   that frequency. Event ingestion must be authenticated, bound to org/connection and
   idempotent by event identity/type. Schedule reconciliation recovers missed events.
3. Bind approved strategy hash, trusted lead number and configured caller number to
   provider payload. Never accept arbitrary caller ID, calendar or credentials from
   agent-generated content. Agent tools need authenticated access; production tools
   do not exist yet.
4. Outcome handling: factual provider lifecycle separate from AI interpretation;
   opt-out immediately suppresses eligible subsequent outreach; requested callbacks
   get timezone-aware due dates; meetings require a saved Calendar receipt.
5. Persist real costs and reconcile unknown calls before releasing locks/reservations.
   Any charge exceeding a quote closes the budget gate for review; provider invoices
   are authoritative and an internal estimate is not a provider-enforced hard cap.
6. Only after offline and scratch checks: explicit deployment and controlled live
   testing, with destination route and permission checks verified.

## UNVERIFIED / remaining

- Pakistan route, onboarding eligibility, caller ID authorization and actual SIP rate.
  Retell-managed destination list does not list Pakistan:
  https://docs.retellai.com/deploy/international-call
- Plivo candidate integration (not selected or connected):
  https://docs.plivo.com/docs/voice-agents/sip-trunking/integration-guides/retell
- Customer workspace billing documented at
  https://www.retellai.com/use-cases/white-label-ai-voice-agents ; embedded payment
  integration into our dashboard remains unverified.
- Urdu/English speech quality, provider duration enforcement, account balance API,
  exact carrier billing increments, local calling policy, real event schemas.
- Google Calendar OAuth scopes/account binding, timezone conversions, conflict and
  uncertain-insert reconciliation against the actual API.
- Reservation/cancellation SQL and a storage adapter are implemented, scratch tested,
  and unapplied. A production begin gate, outcome settlement, authenticated event/tool
  transport and tests against actual n8n are not implemented. Preview JSONs remain
  read-only, implemented but unimported.

## Scheduled previews and outcome processing added

- `workflows/07f_call_queue_preview.json`: one-minute Schedule Trigger, explicit
  operator org_id configuration, read-only PostgreSQL preview. Initially unconfigured
  and inactive; cannot dial even if activated. It lists first-step call plans and
  approval/staleness/recipient blockers, not an authorized dispatch queue.
- `workflows/09c_call_reconciliation_preview.json`: five-minute read-only scan of
  unresolved call metadata. Does not contact Retell or retry anything.
- Both use zero-row-safe PostgreSQL nodes and explicit Code modes. No new webhooks.
- `037_calling_preview.sql`: three additive read-only functions using existing
  strategy tables and outreach_activities.dispatch_metadata. No tables added.
  Phone suppression, legal eligibility, routing, windows, leases and budget checks
  remain separate execution prerequisites; plan_eligible is NOT authority to call.
- `outcomes.cjs`: normalized internal event reducer with tenant/call binding,
  replay protection, out-of-order end/cost handling, conflicting-cost detection and
  opt-out suppression requirement. Real Retell signature verification and field
  mapping remain UNVERIFIED. No actual suppression or balance write happens here.

Validation: 27 offline tests passed. Migration 037 compiled and read-only functions
ran in `lead_diag_pg_20261011/scratch_email_release_20261019`, including a temporary
plan fixture and malformed JSON-array cases. Transaction rolled back; functions and
fixture rows did not persist. This does not establish production concurrency safety
or a complete authorized dispatch path.

## Durable reservations added — 038, unapplied

`outreach_call_reserve` takes organization, plan and approved content hash. It takes
one global transaction advisory lock and the existing plan row lock, then rechecks
the preview. One unresolved reservation blocks all other organizations and campaigns.
Unknown legacy call states also block pending reconciliation. Expiry never permits
automatic reclamation or redial. The existing unique plan/step index prevents duplicates.

Costs are integer USD millionths. Shared platform monthly cap is fixed at 10,000,000;
BYOK uses its own organization ceiling. Quotes and limits come from current campaign
configuration, not request fields. The smallest enabled organization campaign limit
applies to daily calls and BYOK monthly allowance. Missing or malformed quotes/costs
block. UTC defines accounting day/month; customer-local calling windows must still be
checked separately before dialing. Actual settlement and fixed recurring carrier fees
must be accounted for before enabling a production begin gate.

Reservations capture funding, connection reference, cost, accounting period, hash and
lease in the existing JSON column. They ALWAYS return execution_authorized=false.
`outreach_call_cancel_reserved` releases only the matching organization/lease in the
reserved state, with zero attempts and no provider call identity. Attempted or uncertain
calls require reconciliation. A cancelled plan step is terminal; it is not requeued
under the same identity. Pause is a separate campaign control.

Configuration contract under existing campaign config.call_dispatch:
enabled, funding (platform/byok), connection_ref, org_daily_calls,
safety_buffer_micro_usd, monthly_ceiling_micro_usd (BYOK),
quote { verified, max_call_micro_usd, expires_at }.
These fields are not exposed as customer authorization. A trusted operator must verify
the route and all-in cost; customer config alone never authorizes transport. No real
configuration, limit, verified quote or funded connection was seeded.

Validation after this addition: **31 offline tests passed**. Scratch SQL checks passed
for reservation, hash mismatch, replay prevention, second-plan blocking, expired lease,
wrong tenant/lease, unsafe cancellation, shared cap, malformed cost/quote and separate
BYOK budget. All SQL changes and fixture rows were rolled back. These tests used
sequential transactions; concurrent independent-session race testing remains UNVERIFIED.
Database-error paths also preserve no-retry results for uncertain calls and bookings.

## Tests

`node --test tests/calling/calling.test.cjs tests/calling/integration.test.cjs tests/calling/retell.test.cjs tests/calling/reconcile.test.cjs`

`node scripts/diagnostics/calling-preview-scratch.cjs` (isolated scratch only)

`node scripts/diagnostics/calling-reservation-scratch.cjs` (isolated scratch only)

Fixtures use invented call IDs, snapshots and prices solely for behavior testing.
They do not assert provider support, live availability, real cost or legal eligibility.
