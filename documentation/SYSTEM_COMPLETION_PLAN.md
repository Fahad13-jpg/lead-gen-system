# System completion plan

17 November backend handoff: the agreed status, recovery, restart-safety and cost
presentation improvements are implemented. The import/isolated-test source inventory
now also includes all four workers, with three in-memory checks and no server/import
started. Use `BACKEND_HANDOFF_20261117.md` for the remaining integration/acceptance
boundaries. Calling live cost integration and new-customer tool/Calendar provisioning
are not completed by the generic improvements; other live/provider prerequisites
remain visible. Dashboard refinement can use the new summaries without hiding them.


17 November job recovery: migration 069 and all four search workers now preserve
provider-start evidence through interruptions. Partial/malformed references cannot
trigger a fresh actor start; only proven unstarted jobs may expire at zero cost.
Legacy rows are excluded from current-pipeline recovery. Job reads now expose fixed
status/next-action and recorded cost/ceiling summaries with unknown values kept null.
One hundred focused code checks, eight rollback-only SQL cases and read-only API
projection checks passed. No paid/provider request or test job committed. See
`JOB_RECOVERY_20261117.md`.


17 November Apify save recovery: new connection attempts retain a signed,
subject/org/key-bound recovery reference before submission. Lost-response/reload
reconciliation compares only saved fingerprints, never repeats the connection
POST and never claims a fresh provider check or balance. References survive a
local gateway restart; legacy pending markers still need explicit review. No new
table/migration, provider request, account change or paid run was needed. Backend,
HTTP, UI and read-only database checks passed. See `APIFY_RECOVERY_20261117.md`.


17 November backend status: authenticated Settings/Campaign reads now expose fixed
status/reason/next-action summaries. Gmail reconciliation explains active, blocked,
confirmed and safe-fresh-authorization outcomes without retrying OAuth. Summaries
are read-only, never execution authority, and preserve private sender visibility.
A real stored reply-stop case no longer appears Running from old email acceptance
metadata. Twenty-seven focused checks and read-only local queries passed. Dashboard
rendering, uncertain-write repair and final live acceptance remain separate. See
`BACKEND_STATUS_20261117.md`.


17 November Yelp source: migration 068, the guarded Yelp worker and explicit
orchestrator routing are installed. US-only, up to 50 businesses/150 candidates,
provider ceiling $0.50, existing BYOK/platform and cleaning pipeline. No Yelp job or
paid run was started. Actor output is mapped from its documented schema; real
result/contact/cost acceptance remains unverified. This supersedes the earlier
note that Yelp had enrichment references only. See `YELP_GATHERING_20261117.md`.


17 November combined gathering: Find leads now offers Google Maps + Facebook
using two existing source-specific signed previews and admissions. Total target
and ceilings are split rather than doubled. Partial/uncertain admission preserves
per-source request IDs and is reconciled without automatic paid retries. No paid
search was run for this change. Yelp is referenced by enrichment but has no active
gathering adapter/workflow; Yellow Pages remains a separate US-only source. See
`COMBINED_GATHERING_20261117.md`.


17 November current checkpoint: use `REMAINING_ACCEPTANCE_20261117.md` for the
short remaining-work list. The Android phone/SIM is connected and a genuine signed
heartbeat has arrived through the explicitly approved temporary SMS ingress.
Sending remains paused; the owned-recipient test waits for SIM balance/package.
Calling local brief/tool/transport checks pass, but no caller number or real call
exists. Final-cost SQL is installed; the live billing adapter remains unimplemented
and the settlement wrapper stays mock-only. Do not count calling as end-to-end
accepted. Dashboard redesign and stable production URLs remain deferred.


16 November owned tool/Calendar scope: the local n8n worker now resolves the saved
organization account, key and exact versioned connection reference, with a trusted
workflow-specific Calendar credential. Dashboard Calendar loading verifies that
returned scope. Organization 1 has two writable calendars; live local checks and
focused isolation tests passed. No agent, campaign, workflow activation, event or
call changed. The single approved public check could not connect; the temporary
hostname returns ENOTFOUND. Stable public ingress remains deferred to deployment,
calling stays disabled and no transport authorization was added. See
`OWNED_CALL_TOOLS_20261116.md`.

16 November owned calling transport: provider configuration checks and a vault-backed
single-attempt worker are implemented. Settings can inspect the published agent,
pinned engine, reviewed prompt/tool schemas and optional number without calling.
Migration 067 stores version-scoped metadata checks only. The worker commits the
existing SQL reservation/attempt before one POST, preserves uncertain outcomes,
and can poll known IDs while sending is disabled. It is unscheduled and installed
with sending disabled and no trusted tool/route attestations. Real customer
tool/Calendar mapping, number/voice/route and funded quote acceptance, verified
all-provider settlement and the actual phone test remain before unattended use.
See `CALLING_TRANSPORT_20261116.md`.

16 November calling lifecycle: account updates/add-number/reconnect, disconnect
and paused campaign binding are implemented with exact versions, shared call locks,
current membership checks and durable request receipts. Account changes pause
affected campaign versions; disconnect deletes encrypted credentials and removes
campaign bindings. Migration 066 and a rollback-only real SQL walkthrough completed
without provider requests, real campaign changes or calls. Agent/tool verification,
route/funding proofs, production transport binding and live calling remain.
See `CALLING_RESOURCE_MODES_20261116.md`.

16 November calling resources: the three-tier quota proposal is superseded by
customer-owned resources plus an optional prepaid Managed Calling service.
Organization-scoped Retell onboarding now stores encrypted keys and checks a
published agent/version and optional US number using read-only provider requests.
Saved accounts remain pending setup; no dispatch binding, provider funding or
calling is enabled. Managed billing stays unavailable until wallet settlement and
production calling integration are complete. See `CALLING_RESOURCE_MODES_20261116.md`.

16 November no-phone work: self-service workspace enrollment is implemented for
verified accounts with no memberships. Creation atomically assigns only a new
zero-credit freemium workspace and owner membership; existing memberships and
revocations are preserved. Duplicate and uncertain creation use saved receipts,
with membership reloaded before access. No free provider/AI/calling allowance is
created. See `WORKSPACE_ENROLLMENT_20261116.md`. The earlier tier limits in `PLAN_LIMITS_PROPOSAL_20261116.md` are superseded
and must not be activated; legacy tier column values remain internal placeholders.

16 November Android SMS implementation: SMSGate device connection/settings,
organization rolling quotas, timezone slots, exact approved-message release,
bounded single-attempt submission, status reconciliation and signed reply/STOP
handling are implemented for the first single-device/SIM rollout. SMS strategy
copy is channel-specific and capped at two correctly counted segments. Rollback
SQL checks and focused code/UI checks passed without provider/model calls.
No phone or real recipient is connected/queued by installation. Public HTTPS
receipt routing, physical-phone verification and owned-recipient acceptance remain
pending. Automatic SMS follow-ups/multi-device routing remain separate work;
do not count the full SMS scope as accepted. See `ANDROID_SMS_20261116.md`.

16 November Messenger strategy: the native agent now supports an explicit
single-step AI Messenger campaign and a hash-bound manual message artifact.
After approval, the lead composer prefills the exact current message and rechecks
approval, context, target and stops before copy/open. Migration 062 and nine
planner Code bodies installed, dashboard rebuilt, existing contexts preserved.
No live model requests or sends were made; real generation/browser acceptance
remains the next walkthrough. See `MESSENGER_STRATEGY_20261116.md`.

16 November manual Messenger: Facebook lead details now offer editable message
composition and Copy message & open Facebook. Saved Messenger links are used
where observed; otherwise the business Page opens. Authenticated preparation
rechecks source linkage and known stops, with no provider call or database write.
Sending stays manual; no delivery/reply tracking or Messenger strategy approval
is implied. Installed build and read-only preparation verified; user browser
walkthrough remains. See `FACEBOOK_MANUAL_20261116.md`.

16 November category refinement: general Accept/Exclude category controls are
available across gathering sources. Facebook also has a query-aware, overridable
filter for common unrelated Page kinds; it is not limited to clinics and does
not establish full semantic fit. Saved-result replay excluded the creator,
regulator and association while retaining the clinic/office records. No new
scrape, AI call or old-lead mutation occurred. See
`BUSINESS_CATEGORY_FILTERS_20261116.md`.

16 November Facebook refinement: at the user's request, future keyword/location
searches now use the documented contact-rich pages-google mode, rather than the
discovery-only mode tested in search 121. Facebook selection defaults the existing
usable-contact filter on. The later user-started search 123 verified live contact
extraction: five records with phones, three emails, three business websites, at
$0.169 within its $0.30 ceiling. One Maps-link website error was corrected and
filtered for future runs. Prospect fit remains separate: the results include a
regulator and association, not five proven clinic prospects. No extra paid run,
AI or outreach was used during verification. See `FACEBOOK_CONTACT_SOURCE_20261116.md`.

Latest Facebook checkpoint, 15 November: Facebook Pages is installed as another
bounded gathering source, including preview/admission, authenticated worker,
dedup/cleaning, source links in lead detail and source-specific cost/result caps.
The user-confirmed search 121 passed live acceptance: five new Page leads reached
the lead list at $0.091 within its $0.10 cap. This search mode returned names/Page
URLs but no contact or Messenger-link fields, so all five need contact discovery
and their locations remain unverified. No extra enrichment was started. Messenger
sending remains a separate eligible-conversation integration, not implied by discovery. See
`FACEBOOK_GATHERING_20261115.md`.

Latest 15 November LinkedIn checkpoint: the user supplied a personal test profile
with no business affiliation. Dedicated no-send campaign 5 / plan 14 / task 15
passed the customer open/copy/dismissal walkthrough using the combined button.
Final state is skipped, sent_at null, provider_verified=false. No AI, scraping
or LinkedIn message was used. This closes the no-send manual UI acceptance;
real sent/accepted/replied outcomes and production person-discovery acceptance
are not proven by this test. Earlier empty-queue/no-test-target statements are
historical. See `LINKEDIN_MANUAL_DASHBOARD.md`.

Latest strategy checkpoint, 15 November: normal dashboard generation admission is
enabled with trusted review controls. The funded Apify connection and search 119
passed (five new businesses, $0.1341). Native strict-schema generation now passed
live provider acceptance. The separately user-authorized v2.9 request generated
plan 12 for Smile Center, with conditional existing-website wording, no incidental
quotation, weak-fit warning and no routine follow-ups. Sending remains disabled
and this plan is not approved. Usage is 8/10, leaving two requests. This verifies
the weak-fit draft path; strong-fit/persuasive quality is not established by this
case. Older failed plans are retained and displayed as earlier attempts when a
newer draft is available. See `STRATEGY_SMILE_REVIEW_20261115.md`. Earlier paused,
unverified-provider and 4/10 usage statements below are historical.

15 November latest checkpoint: the owner Gmail test passed real scheduled initial
send, follow-up in the same thread, reply persistence and reply-based denial of
email three. The test campaign is paused and all its schedules are inactive.
This supersedes earlier pending email statements below. SMTP live acceptance,
production OAuth approval and elapsed next-day observation remain separate limits.
See `EMAIL_COMPLETION_20261115.md`; do not repeat the passed owned-account sends.

The user explicitly deferred comprehensive dashboard work and deployment. Next
backend work is WhatsApp: connect existing installed registry/inbox functions to
Firebase organization membership. Sender/inbox reads, versioned lifecycle actions
and admin inbox review are implemented in `scripts/dashboard/whatsapp.cjs` with
fixed authenticated gateway routes. The installed read adapter passed with zero
senders/incoming messages. Meta signup/provider checks and messaging are still
unavailable through these routes; they do not create consent or send authority.
See `WHATSAPP_AUTHENTICATED_BACKEND_20261115.md`.

The Meta signup backend is now implemented with one-use sessions, fixed provider
adapters and encrypted atomic credential/registry storage. The inert encryption/
SQL storage probe passed and rolled back. The routes remain disabled on HTTP local
hosting without private Meta setup; real v4 provider acceptance, account subscription
and number readiness remain pending. No dashboard change or live Meta call occurred.

The Firebase-authorized connected-number checker is also built. It verifies registry
access before encrypted credential loading, uses a bounded Meta account GET, and
rechecks membership/version under locks before saving identity readiness. It grants
no sending capabilities. Focused checks and a rolled-back SQL/encryption probe
passed with provider observations explicitly mocked. Organization-owned WhatsApp
account/number connection remains part of scope; real Meta setup/acceptance is pending.

User decision: defer live Meta signup until the product has a suitable public
domain/business details. Add manual WhatsApp messaging now. A functional Lead
details composer and authenticated read-only click-to-chat preparation are built;
known stops and changed recipient data block preparation. No automatic sending,
delivery claims, reply tracking or activity rows accompany this manual option.
See `WHATSAPP_MANUAL.md`. This small requested feature does not reopen the deferred
comprehensive dashboard redesign or waive Meta verification requirements.

15 November calling update: browser conversation, saved isolated opt-out and real
Calendar test booking passed. Tested agent version 1 is published; local/n8n
backend pins version 1. Production phone tool identity now also checks the original
caller, recipient and dispatch metadata. Existing production SQL storage functions
match reviewed source. No real phone call or lead mutation was fabricated for
acceptance. Campaign calling/release and dialer schedules remain disabled.
See `CALLING_PRODUCTION_RELEASE.md` and `CALLING_BROWSER_TEST.md` for current
evidence; earlier pending calling statements below are historical.

Calling outcomes are also installed in the local Outreach dashboard, including
opt-outs, booking review states and callback requests. Build `main.6f8422cb.js`
passed focused checks and runtime verification. No provider test or lead mutation
accompanied this view. Remaining calling work requires the deployment endpoint,
actual caller number/route/funding and a bounded telephone acceptance test.

Checkpoint: 10 November 2026, streamlined after the user's request to remove
unnecessary work. Scope is finishing the local product before
choosing cloud/Hostinger deployment. This is the working backlog; older stage
documents contain historical checkpoints and must not override newer evidence.

## Active completion path

This section governs current work. The package details below are reference and
remaining scope, not permission to reopen completed checks or invent new blockers.

1. **Strategy review boundary installed locally.** The native email release passed
   7 release tests, 15 native tests and 15 scratch journey checks. API installation
   changed only the three reviewed Code bodies, preserving activation and other
   workflows; no container restart or stale-execution edits were needed. Evidence:
   `.local/strategy-api-install-1794228795054/result.json`. Global processing remains
   paused and `STRATEGY_DRAFT_REVIEW_ENABLED` remains off. Enabling generation and
   releasing an email campaign are separate operator actions; installation does
   neither. See `STRATEGY_DRAFT_RELEASE_REVIEW.md`.
2. **Resume email execution closure.** Reuse prior transport/thread/reply evidence
   and existing scratch checks. Implement only demonstrated remaining integration
   gaps. Do not demand another real send for every configuration/UI change.
   Update 10 November: exact campaign scope approval/start/pause/revoke UI and
   gateway routes are built; migrations 056/057 are installed locally with a
   fresh backup and rollback. The one-minute renewal supervisor is built and
   defaults off and is loaded in the gateway. The separate campaign SMTP runtime
   is installed and loaded; the existing manual SMTP worker is unchanged.
   Sending remains disabled; real multi-day campaign acceptance
   and concrete workflow installation/activation remain UNVERIFIED. See
   EMAIL_CAMPAIGN_RENEWAL.md for the current runtime checkpoint.
3. **Finish the remaining promised executors, one at a time.** Manual LinkedIn,
   Retell calling, WhatsApp and SMS remain in scope; this simplification does not
   silently remove channels or customer-owned accounts.
4. **One final local walkthrough.** Group authentication, campaign configuration,
   strategy review and executor controls into a single acceptance pass. Use clearly
   labelled fixtures when real provider/contact data is unavailable. Record those
   limits as UNVERIFIED; do not pretend they establish live delivery or AI quality.

### Work removed from the critical path

- Repeated whole-repo inventories, blanket regression runs and per-step reports.
- More AI calls on the same blocked-contact inputs, or automatic repeats of the
  three original quality tests. Monthly quota is not test permission.
- Repeated clinic-email hunts as a condition for developing the strategy stage.
  Authentic contact acceptance remains a named data dependency for live outreach.
- Reopening drained queues, passed ownership/HTTP guards, versioning or approval
  checks without a new failure or relevant code change.
- New styling, animations, localization, enterprise team administration and cloud
  deployment work while the executor path is unfinished. Existing functionality
  remains; these tasks are queued later rather than added to every stage.
- New paid provider runs without a specific acceptance question and approval.

Do not remove evidence/consent, suppression, hash/approval, lease, tenant or budget
checks to shorten this list. Do not delete source, sticky notes, audit evidence or
backups as "cleanup". Run a build only for changed frontend code, batch related
checks, and reuse the documented result unless a changed cause warrants retesting.

## Status rules

- **Built**: source exists and relevant local tests passed.
- **Installed**: reviewed code/functions are installed in local Docker.
- **Connected**: actual authentication/provider wiring has been exercised.
- **Accepted**: the intended customer journey and outcome have been checked.
- **Blocked**: a named dependency, configuration or approval is missing.

These labels are independent. An installed inactive executor is not operational;
an active callback is not proof of delivery; a generated workflow is not proof of
installation. Missing contact details can be a valid finished result. Do not keep
rewriting a working stage because a business has no published email.

## Current evidence

Read-only inventory: `.local/system-completion-inventory.json`, generated with
`scripts/diagnostics/system-completion-inventory.cjs`. No provider calls or writes.
The database includes unrelated/test workflows; do not change them as part of this
project's cleanup.

- Gathering connection/orchestrator/Maps/Yellow Pages and cleaning are active.
  Maps has prior live evidence; Yellow Pages paid quality is still UNVERIFIED.
  Yelp has no implemented supported scraper and is rejected by admission.
- Contact discovery is active. Migration 052 and the protected-email decoder are
  installed. Two current dental-site checks completed without finding an email.
  Paid Facebook discovery and external verification remain disabled at control
  level, regardless of active workflow labels.
- Basic enrichment's last queue-drain checkpoint: **8 complete, 27 partial,
  9 failed, zero pending/processing**. All 44 received their permitted refresh
  attempts. This is dated evidence, not a live count. Partial is not verified.
- 06B research remains inactive. 06C management is active, with global processing
  paused. Org 1 has an explicitly approved 10/month AI allowance; three approved
  quality calls completed but failed validation. One separately approved corrected
  prompt test passed for a blocked-contact lead; 4/month used, 6 remaining.
  Sendable-message quality and approval acceptance remain unverified. Dashboard
  review now exposes the failure causes and recorded usage. Historical trials are unchanged.
  See [STRATEGY_QUALITY_20261108.md](STRATEGY_QUALITY_20261108.md).
- One Gmail registry entry is ready; the SMTP entry is disabled. Gmail/SMTP checks
  are active. Sending and reply execution workflows are inactive/closed.
- LinkedIn helper is installed and inactive. Calling SQL/tools are installed;
  the authenticated tool webhook is active. This does not prove dialer deployment.
- WhatsApp SQL/registry/inbound support is installed. Callback is active; dispatch
  and check workflows are inactive. The previous message attempt is uncertain,
  not delivered, and must not be replayed blindly.
- Firebase/org access and significant React read/action screens work locally.
  They are not a completed self-service customer journey.

## Ordered work packages

Progress update: the first stage-one slice is installed and tested; see
[STAGE_ONE_COMPLETION_20261108.md](STAGE_ONE_COMPLETION_20261108.md). All 44 basic
tasks have received a first refresh attempt: the drain checkpoint is 8 complete,
27 partial, 5 terminal failures and 4 normal retries pending. Failure classification
and dashboard assessment-progress counts are installed. Work package 01 is not
fully accepted: retry outcomes, Yellow Pages/provider acceptance and the new-search
end-to-end check remain explicit gaps.

Second slice: [STAGE_ONE_ACCEPTANCE_20261108.md](STAGE_ONE_ACCEPTANCE_20261108.md)
records the 24-search trace, eight scratch SQL cases, installed empty-queue guards
in five workflows, approved convention exceptions and live dashboard outcome fields.
At 14:41 UTC the queue had 8 complete, 27 partial, 7 failed and 2 normal retries
pending. Remaining convention-review flags and provider acceptance are itemized
there; they are not hidden under a blanket "stage complete" claim.

Final basic-queue checkpoint at 14:47 UTC: **8 complete, 27 partial, 9 failed,
zero pending/processing**. All 44 received their allowed refresh attempts; nine
source failures remain for review. The queue-drain acceptance item is closed.

Scraper safety closure: [SCRAPER_SAFETY_20261108.md](SCRAPER_SAFETY_20261108.md)
records installed ownership/HTTP guards, 77 offline checks, actual scratch SQL
fencing and three native n8n cases. The native probe exposed an ineffective Wait
expression; the final release uses one explicit Code guard per scraper instead.
The remaining Error Trigger static flags were reviewed against existing inline
handlers and bounded SQL recovery, not counted as eight known bugs. Work can
proceed to package 02 while paid provider acceptance remains visibly unverified.

### 01 — Close gathering, cleaning and evidence processing

**Already present:** org-owned BYOK/platform budgets, request identity, leased
background gathering, new-business targets with shortfalls, cleaning/dedup/review,
bounded discovery and evidence/trust signals.

**Remaining:**

1. Queue draining, search-link tracing and demonstrated workflow safety fixes are
   closed by the evidence above. Do not rerun them without a relevant change.
2. Keep partial/no-website/conflict/recheck-needed cases truthful. Treat inaccessible
   sites as data/source outcomes; reopen development only for a demonstrated defect.
3. Close the Yellow Pages live-quality gap with a separately approved bounded
   test, or visibly label it unavailable/unverified in the initial release.

**Acceptance:** one traceable request reaches a truthful terminal outcome; a
duplicate/replayed job and an unavailable website do not corrupt counts/evidence.
No paid provider run is implicit in this package. Yelp is deferred, not promised.

### 02 — Finish AI research and strategy as a usable product

**Already present:** evidence-based enrichment, signal sheet, deterministic fit,
strategy v2 facts/benefits references, permitted channels, content validation,
customer-template path, approval hashes, failure/fallback states and reservations.

**Remaining:**

1. Reconcile the refreshed inputs with research/strategy freshness. Restore only
   reviewed research scheduling; retain independent paid/AI control gates.
2. Closed: configure the approved 10/month allowance and confirm model availability.
   The corrected prompt passed one separately approved real test. Validate useful
   sendable-message quality under a separately approved scope before full acceptance.
3. Finish one grouped dashboard campaign → generation request → saved plan →
   review → approval/revocation acceptance pass. Use fixtures for blocked-data
   branches; reserve any new real-model call for a specific, approved quality gap.
   Gateway-service and PostgreSQL approval/revocation passed in scratch, including
   blocked/stale/hash/acknowledgement cases; see
   [APPROVAL_JOURNEY_20261109.md](APPROVAL_JOURNEY_20261109.md). Actual browser and
   eligible-contact acceptance remain outstanding. Migration 054 was explicitly
   approved, backed up and applied to local lead_db; owner/grants and business/
   processing state were verified unchanged. The existing release gate is retained.
4. Closed for the supported English slice: campaign editing, daily cap, working
   windows, delays, tone and supported channel preferences. Existing validators
   and versioning remain authoritative; do not reopen for cosmetic expansion.
   Timing/tone/freshness, offer/channel and English email-copy editing are built;
   see
   [CAMPAIGN_PREFERENCES_20261109.md](CAMPAIGN_PREFERENCES_20261109.md). The saved
   daily email cap control is also built, bounded by the existing sender ceiling;
   see [STRATEGY_CONTACT_READINESS_20261109.md](STRATEGY_CONTACT_READINESS_20261109.md).
   Localization is later work; authenticated browser acceptance joins the single
   final local walkthrough.
5. Supported English customer-email template editing is built. Keep unsupported
   template editors explicit; do not add them as a prerequisite for email closure.
6. Verify LinkedIn company/person/posts evidence under the existing approved budget
   when collection is enabled; otherwise show research unavailable. No invented CEO,
   post or personalization claim is acceptable.

   Read-only acceptance preflight found no eligible contact for the current clinic
   campaign among nine stored email-bearing leads. Contact/identity/source blocks
   were retained. This is a data prerequisite, not permission to weaken readiness
   or spend further AI requests on blocked contacts.

**Acceptance:** AI generates a valid personalized plan from current facts, or a
clear failed/blocked outcome. Customer mode follows supplied approved content.
Neither mode bypasses fit, evidence, suppression, approval or budget checks.

### 03 — Close email execution and customer senders

9 November local hardening: dashboard sender lifecycle now confirms the exact
requested state and expected next registry version before reporting success.
Four focused tests passed, including mismatched receipts and no automatic retry.
This gateway change is installed in the locally reloaded dashboard gateway.

Campaign email pause is now implemented through the existing authenticated,
versioned preferences save (`pause_email:true`, no new webhook/table/migration).
Only owner/admin may use it. It disables the saved email policy, retains limits
and sender binding, and invalidates prior-version dispatch through existing
current-campaign checks. It does not recall an in-flight send or stop reply scans.
Start/resume remains unavailable until the transport authorization conflict below
is resolved; the UI must not imply approval alone enables dispatch.
The 16 campaign-preference checks, 3 pause UI checks and 3 existing plan-review
UI checks passed. The dashboard production build passed (`main.b499bafb.js`).
No migration, campaign-state write, sending activation or provider call was made.
Authenticated browser interaction and a production-dispatch pause race remain
UNVERIFIED; the local tests use mocked persistence. Existing SQL current-version
checks are retained, so pausing is not a guarantee of recalling an in-flight send.

**Email marker conflict resolved, 9 November:** explicitly approved migration 055
is installed locally. The three email begin functions recognize the validated
native email review format while retaining legacy compatibility. They still
require approval/current context, eligible contact, enabled matching sender
policy, quota and one-attempt leases; bounded workflow transport gates remain.
The format predicate alone never grants execution authority. Customer-template,
fallback, failed and blocked formats were not enabled by this change. Plan bodies
and hashes were not changed. Scratch SQL checks rolled back successfully; the
local install preserved function owners/grants and plan/approval/activity state.
Evidence: `.local/native-email-055-install-1794228144417/result.json`, with fresh
backup and rollback SQL in that directory. No release or schedule was enabled.
The focused native draft -> save -> approval -> lease -> email executor ->
simulated provider receipt journey now passes, with duplicate transport and
revoked-approval checks. The approved body/hash and false execution marker stayed
unchanged. All fixture changes rolled back. Evidence:
`.local/native-email-handoff-20261109/result.json`. Contact readiness, eligibility,
contact history and provider transport were mocked explicitly; this is not proof
of a real eligible contact, managed-sender connection, inbox delivery or live
scheduled campaign. Those remain UNVERIFIED. Existing blocked plans remain blocked.

**Already present:** Gmail OAuth enrollment, ready sender/check lifecycle, inactive
sender-bound send/reply packages, email/SMTP gates, limits, threading/reply-stop,
bounce/uncertainty handling, optional paid verification and campaign sender binding.

**Remaining:**

1. Close the reviewed campaign release and coordinated send/reply controls using
   prior live evidence and existing scratch coverage. A new-account live campaign
   check is optional acceptance work under fresh approval; otherwise retain its
   UNVERIFIED label. Do not repeat sends the user has asked to skip.
2. Confirm reply, opt-out and bounce stop subsequent approved steps; preserve
   quarantined uncertain sends. Never reuse an old test approval for a new message.
3. Customer SMTP/IMAP credential enrollment is now in the authenticated Settings
   screen, with atomic encrypted storage, org/owner checks, nonce reconciliation
   and pending/false-capability registration. See `SMTP_CUSTOMER_ONBOARDING.md`.
   Per-account check/send/reply workflow provisioning is now wired to enrollment
   and recheck. Send/poll remain inactive; only the guarded connection checker may
   activate. Runtime/project/ownership and uncertain-outcome checks are preserved.
   Real customer API provisioning/authentication acceptance remains UNVERIFIED.
   Enrollment alone is not connected/ready.
4. SMTP password replacement/reconnect is implemented with explicit acknowledgement,
   owner/team-admin permissions, atomic encrypted updates, retained credential IDs,
   fresh checks and mandatory campaign rebind/review. Real-account acceptance is
   UNVERIFIED. Same-account Gmail reconnect is now implemented locally with pinned
   Google identity, atomic encrypted token replacement, version fencing and explicit
   campaign rebinding. Its 36 backend/11 UI tests and scratch rollback checks pass;
   actual Google reauthorization and browser completion remain UNVERIFIED.
   Disconnect remains a registry action rather than provider-side token revocation.
5. Expose campaign start/pause/stop/review safely through existing release gates;
   content approval alone must not appear to be an unrestricted sending switch.
   Batch preflight is now implemented: current selected approvals, hashes,
   recipients, sender/version/readiness, limits and existing attempts are checked
   read-only. Up to ten first messages can form a short-lived review packet, with
   no credential references and no send authority. See EMAIL_BATCH_PREFLIGHT.md.
   The local operator controller now prepares exact Gmail/SMTP pairs, installs
   inactive, starts reply monitoring before sending, and pauses sending while
   retaining replies. It revalidates before mutations and reconciles uncertain n8n
   results without blind replay. Seventeen focused tests pass; no batch installation
   or activation was executed. See EMAIL_BATCH_OPERATOR.md. Real batch acceptance,
   The dashboard now implements delegated-batch status/start/pause through this
   controller, requiring the exact operator-reviewed bundle, user acknowledgement
   and a default-off server start switch. No delegation or activation was performed.
   Thirty-two backend/controller/HTTP and six UI tests pass. See
   EMAIL_BATCH_DASHBOARD.md. Real acceptance and multi-day follow-up release
   management remain unfinished; resuming a paused batch requires a new release.
   Follow-up visibility is now implemented in Strategy review with existing SQL
   eligibility checks, approved delays, stop/reconciliation states and pagination.
   Twenty-two backend/HTTP and four UI tests pass; a real read-only query found four
   saved steps, all blocked. See EMAIL_FOLLOWUP_QUEUE.md. This does not extend the
   24-hour release, enable automatic renewal or authorize follow-up sends.
   A fresh explicitly reviewed second-email packet is now implemented within the
   existing two-step/24-hour contract, with confirmed same-sender/recipient parent
   evidence, existing SQL due/stop checks and a new exact packet. It does not extend
   an old release or plan, auto-renew authority, or permit step 3. See
   EMAIL_FOLLOWUP_RELEASE.md. Real customer second-email acceptance remains UNVERIFIED.
   The user then approved campaign-level authority with short automatic renewals.
   The exact-scope approval/control UI, authenticated gateway, migrations 056/057,
   renewal supervisor, and isolated v3 SMTP runtime are installed locally. The
   runtime is loaded; legacy SMTP files and workflow activation were preserved.
   Both start switches remain false, no campaign scope was approved, and no
   campaign workflow was created or activated. See EMAIL_CAMPAIGN_AUTHORITY.md
   and EMAIL_CAMPAIGN_RENEWAL.md. Remaining: one approved-customer walkthrough
   exercising concrete workflow installation and multi-day outcomes. Keep this
   UNVERIFIED until exercised; it does not reopen completed implementation checks.

**Acceptance:** correct org/sender/approved recipient and content, no duplicate
dispatch, configured spacing/quota, correlated reply stops, understandable dashboard
status. Any intentionally skipped live check is recorded as UNVERIFIED.

### 04 — Finish the dashboard operating loop

**Already present:** Firebase sign-in, verified membership, Overview, search
preview/admission/history, leads/evidence, campaigns, plan request/review/approval,
activity reads, sender lifecycle/binding and Apify/Gmail connection controls.

**Remaining:**

1. New-customer organization setup or a clearly defined administrator-enrollment
   flow; team invitations/role management and org switching as needed for the
   agreed owner/team product. Signing up currently does not create authorized access.
2. Job detail/stage progress, blocked reasons and actionable attention items.
   Separate evidence freshness, contact availability and channel readiness.
3. Finish campaign editing/progress, start/pause/stop controls, reply/conversation
   review and manual-task actions. The current activity list is primarily a read view.
4. Connect per-channel account forms, calling slots/start controls, and actual
   saved plan/usage allowances; do not expose unimplemented actions as functional.
5. Authenticated desktop/mobile, keyboard, error/stale-state and cross-org checks.
   Polish charts/visual details after the working journey is complete.

**Acceptance:** an organization owner can operate the supported workflow without
database edits or hidden scripts for normal daily work. Administrative setup may
remain explicit, but must not be presented as self-service.

### 05 — Finish manual LinkedIn

**Already present:** installed inactive helper, draft/task preparation and org-bound
event/gate functions with no automated LinkedIn sending.

**Remaining:** dashboard task queue; copy connection note/message; open the checked
profile; user-reported sent/accepted/replied/skipped outcomes; due reminders and
suppression. Connect authenticated member mapping and bounded activation.

Update 10 November: queue and authenticated member mapping, checked-profile links,
copy actions, acknowledged lifecycle/stop reports, snooze, skip, and admin assignment
to self are built. Plan review prepares exact approved manual steps on demand;
the scheduled helper stays inactive. Unknown writes reconcile by saved event or
plan/step/hash without repeat. See LINKEDIN_MANUAL_DASHBOARD.md. Remaining:
manual LinkedIn campaign authoring/artifact-generation configuration and one
eligible customer task walkthrough. No real LinkedIn action has been performed.

14 November: the campaign-authoring configuration is installed locally and its focused
checks passed. Creation/preferences support explicit enablement, task cap and
optional note for dedicated English AI LinkedIn campaigns. Existing operator
generation opt-in, evidence, quota and approval gates remain mandatory. Production
build `main.229002dc.js` passed with one worker after host memory/disk pressure;
the dashboard gateway is started with email start switches off. The eligible
customer walkthrough remains UNVERIFIED; do not reopen
completed queue, identity or lifecycle checks without a relevant failure.

**Acceptance:** complete one manual task lifecycle. A customer click/report must
not be described as independently verified LinkedIn delivery or reply.

### 06 — Finish Retell calling (US first)

15 November checkpoint: owner/admin Calendar selection, explicit offered slots and
versioned calling-pause controls are installed in campaign review. Saving availability
pauses calling and disables release; active/uncertain calls block Calendar edits.
The production build and focused backend/UI checks passed. The existing tool backend
now returns a sanitized, actionable diagnostic: Google Calendar authorization needs
renewal in n8n's **Google Calendar account** credential. No call or Calendar event
was created. See CALLING_DASHBOARD.md. After reconnecting, verify access once, then
resume browser binding and the remaining controlled calling setup below.

The user reconnected Calendar on 15 November. The verification read succeeded with
two writable calendars; the authorization blocker is closed. Owner selection of
calendar/slots and actual booking acceptance remain separate. The call-readiness
read endpoint/UI is installed locally (`main.ff840362.js`) using existing SQL gates, with no credit reservation
or sending authority; the real read adapter found zero current call steps in its
selected workspace. No plans, permissions, calling release or budget were fabricated.

**Already present:** dynamic brief, under-one-minute agent configuration, five
authenticated backend tools, Calendar lookup access, outcomes/callback/opt-out
functions, single-call/budget/approval logic and local dispatcher/poller sources.

**Remaining:** owner-selected meeting times and actual booking acceptance; controlled
browser-call binding; actual audio → tools → booking/outcome/opt-out test; verified
US number/connection and billing mapping; reviewed dialer/poller installation and
activation. Verify duration, one-call concurrency, settlement and uncertain-call
reconciliation. Complete the applicable consent/country eligibility review before
real campaign release. Current agent remote settings have not been rechecked here.

**Acceptance:** a bound test call records the right outcome; confirmed booking
creates one correct event; opt-out stops further calls; no over-budget parallel call.
Pakistan telephone routing remains a later explicit scope, not a release promise.

### 07 — Finish WhatsApp

**Already present:** approved-template artifacts, consent/budget/lease gates,
per-step follow-ups, signed callbacks, inbox/suppression, registry and recheck SQL.

**Remaining:** wire real Meta Embedded Signup exchange/inspection/provisioning to
Firebase-authenticated org membership and the React button; complete required Meta
business/app review dependencies; finish sender/template check operations; install
the reviewed provider-error diagnostics if still absent; reconcile the old uncertain
attempt without resending; then separately approve a new bounded delivery/reply test.
Connect inbox and sender controls to the dashboard. Choose a body-retention policy.

**Acceptance:** one approved, eligible template to an opted-in owned test recipient
has a correlated receipt/status/reply and STOP handling. Customer signup works for
an authorized test customer, or is explicitly unavailable pending provider approval.
An app publication screenshot or webhook test alone is insufficient. Current Meta
requirements/provider readiness remain UNVERIFIED by this local inventory.

### 08 — Build the SMS executor properly

The existing `07c_sms_outreach_executor.json` is a legacy Twilio draft reading old
enriched_leads fields; its selection query lacks org scoping and it is not connected
to the current approved-plan/lease architecture. It is inactive and must stay so.

**Remaining:** decide supported country/provider/number and approved budget; define
sender onboarding and recipient eligibility; integrate exact approved SMS steps,
quota/segment costs, lease/reservation, receipts/reconciliation, reply/STOP callbacks,
follow-ups and dashboard controls. Reuse existing structural decisions rather than
activating or cosmetically adjusting the legacy draft.

**Acceptance:** isolated tests plus an explicitly approved owned-recipient test;
tenant isolation, duplicate prevention, limits and STOP work. SMS may be visibly
deferred for an email-first release, but cannot be counted as finished scope.

### 09 — Finalize Freemium / Standard / Premium

**Already present:** policy/customer-strategy modules and draft catalog. The catalog
has unconfigured numeric allowances and policy previews are not a complete billing
or entitlement system.

**Remaining:** decide concrete quotas/features; connect trusted assigned tier and
usage to authoritative backend enforcement plus Settings; keep user daily/channel
preferences inside hard provider/plan/org limits; support BYOK where integrated;
show actual credits/reservations/usage. Determine shared free-call allocation under
the previously agreed $10 total, separately from customer-owned calling funding.
Paid verification may remain optional without calling basic checks verification.

**Acceptance:** quota consumption/release is correct across concurrent jobs and
customer preferences cannot raise a hard limit. Tier switching, exhaustion and
cross-org access behave consistently. Automated payment/subscription collection is
a separate decision; administrator-assigned test plans suffice for local acceptance.

### 10 — Whole-system acceptance and release preparation

Run one traceable journey: authorized organization → provider connection → search
preview/admission → gathering/cleaning → evidence/contacts → offer/campaign → AI or
customer plan → content approval → separately authorized channel release → outcome
and follow-up stop → dashboard progress. Check a second org for isolation.

Exercise restart/expired lease, duplicate request, missing evidence, quota exhausted,
provider outage, revoked access and ambiguous send. Reuse existing unit/scratch
evidence and focus live checks on remaining integration gaps. Confirm cross-channel
stops; do not activate the old generic follow-up workflow alongside newer per-channel
dispatchers without an ownership audit.

Inventory intended schedules and legacy workflow entry points; archive/label only
reviewed project artifacts, preserve notes, and leave unrelated workflows untouched.
Produce a reviewed release manifest, configuration/secret inventory, fresh backup
and tested restore/rollback instructions. Reconcile old docs/README with the final
implemented behavior. No broad refactor or extra release framework is required.

**Acceptance:** every promised feature is accepted, or explicitly deferred/disabled
with its remaining gap recorded. No silent model/template fallback, guessed facts,
invented delivery metrics or exhausted ledger extension.

## Work rhythm

Work on one package at a time. For each: reproduce the gap, implement the smallest
compatible fix, run relevant local/scratch checks, install only what is authorized,
then record the observed outcome. Do not rerun successful unrelated checks or expand
the feature list while closing a package. An external blocker can be parked while
independent local work continues. Keep this document current instead of issuing a
new roadmap after each small step.

Start with **01**, then **02 and 03** to complete the email-first vertical slice.
Complete the dashboard controls alongside those integrations. Then close manual
LinkedIn, calls, WhatsApp, SMS, plan enforcement and final acceptance in that order.
The draft commercial tier catalog may be finalized earlier if its missing limits
block a specific package; no new quota is inferred from this ordering.

Only after local acceptance decide Hostinger topology, stable domains/HTTPS,
callback replacement for temporary tunnels, production OAuth registrations,
durable multi-instance sessions, service supervision, backups/monitoring and
deployment operations. Those are deployment work, not proof of local completion.

## Decisions/approvals needed later

- Additional AI quality tests beyond the three completed approved calls, and any
  new paid discovery/provider test ceiling. The approved org 1 allowance is 10/month.
- Exact plan quotas and customer/provider funding choices; no invented prices.
- Required provider accounts/numbers and Meta/Google review setup when applicable.
- Explicit new-send/call permissions for any live acceptance test; previous uncertain
  attempts and historical test permissions cannot be replayed automatically.

No such approval is needed merely to inspect and implement offline fixes. This
planning pass changed documentation and a read-only diagnostic script only.
