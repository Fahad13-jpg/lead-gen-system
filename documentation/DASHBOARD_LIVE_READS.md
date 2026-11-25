# Leads and search-progress read slice

Local integrated app, 2026-11-07. No schema/workflow changes, scraping runs, provider spending or outreach actions.

## Available

- `GET /dashboard-api/api/leads`: bounded pagination, literal business/city/category search and email-present/missing filters. Explicit field projection; no raw source records, provider credentials, internal errors or inferred qualification scores.
- `GET /dashboard-api/api/jobs`: paginated existing searches with stored gathering status and separate staged-record, linked-cleaned-business and assessment-record counts. The status of a completed scraper is not described as completion of cleaning/enrichment/outreach.
- Each request requires a Firebase token, current active membership and org_id. All lead/job/profile/staging/link joins are explicitly organization scoped. Query strings use raw SQL with manual single-quote escaping; no caller-selected SQL or function names.
- Reads run through the existing read-only local PostgreSQL pool. Internal n8n paths are never exposed as a generic browser proxy. Two fixed search actions are now connected as described below; other mutations remain unavailable.
- Leads, Find leads, Overview and Campaigns navigation open connected screens. The new search form uses the existing n8n preview and admission contract. Campaign mutations, outreach and settings remain integration-pending.

## UI behavior

Leads supports search, email filters, pagination and manual refresh. Search history refreshes every 30 seconds while visible, without overlapping requests. Initial errors do not pretend the organization has zero records. Failed refreshes retain a marked stale snapshot; authentication/authorization failures clear protected rows. Switching organization remounts the workspace and discards responses from the previous organization.

An email's presence is not called provider verification or permission to send. An assessment timestamp means an assessment record exists, not proof of freshness/completeness. Source staging records and cleaned businesses are labelled separately. Duplicate count is not presented as a count of reusable matches. No fabricated percentages or time-to-finish estimates are shown.

## Verification

- Confirmed database columns read-only before adding queries, including organization keys, cleaning links, profile timestamps and stored job counters.
- Actual read-only queries returned 48 cleaned records and 78 jobs for org 1 at inspection time. Only counts were printed; these stored records can include historical test data and are not claimed to be 48 verified prospects.
- A diagnostic unregistered org returned an empty result. The operator-only SQL diagnostic injects a test principal deliberately and is not exposed over HTTP; authentication is separately tested at the service boundary.
- 34 offline identity/client/query/HTTP tests passed, including membership-denial-before-data-query, cross-org join scope, search escaping and rejection of deprecated tenant fields.
- Three new React tests passed for initial-error handling, stale snapshots and revoked access, and visible-tab polling. The earlier four signed-in AuthProvider tests remain applicable.
- Optimized build and executable-auth-helper bundle check passed. After restarting the local gateway, unauthenticated requests to both live read routes returned 401.
- A user-controlled authenticated browser check of these new data screens remains pending. The successful owner login was already confirmed before this slice.

## Operational boundary

Use `http://localhost:3002`. Only the local dashboard gateway was restarted; the original Docker dashboard, n8n and PostgreSQL were not restarted or redeployed. No new table, n8n webhook, membership change, plan allowance or executor activation was introduced. Cloud deployment and a dedicated production read role remain separate work.

## Search-progress visual refinement

The user requested a more colorful, understandable search screen. The UI now includes a gathering-status donut, grouped stage-count bars, consistent blue/purple/teal processing colors, status filtering on the current page and individual search cards with exact saved counts. Chart libraries reuse the installed Recharts dependency. No additional API, query or provider call was introduced.

Charts explicitly cover the current page, not all searches or unique businesses across jobs. Grouped bars show overlapping stage counts separately; the gathering status donut groups searches into mutually exclusive status categories. A completed gatherer is not described as a completed end-to-end pipeline. Unknown statuses retain a visible recorded-status label.

The status legend and filter buttons are keyboard accessible. Exact numbers and explanatory text accompany charts, and animations respect reduced-motion preference. Six UI tests passed across status grouping/page scope/filter recovery and existing error/polling behavior. Chart libraries are mocked in component tests; these tests do not certify the rendered chart pixels. Desktop/mobile visual review in the user's authenticated browser remains to be confirmed.

## Live Overview

`GET /dashboard-api/api/overview` provides organization-scoped saved-record totals, daily search creation counts for 7/30/90 days, and five recent searches. Membership is rechecked before querying. The SQL diagnostic confirmed totals against the existing lead/job endpoints (48 cleaned records and 78 searches), 30 daily buckets, and database timezone Etc/UTC. Reads changed no database data.

Overview puts review items first, followed by four colored totals, search activity and email availability charts, and recent searches. Failed/needs-review statuses include historical results and are not presented as unresolved incidents. All-time totals and period activity have separate labels. Email availability is address presence, not verification, consent or delivery. Activity is grouped by database creation date; assessed totals do not imply current evidence. Empty/error states avoid invented metrics. Refresh runs every minute while visible.

Verification: 36 backend tests and 9 React tests passed. Tests cover authorization before data access, period/filter restrictions, organization joins, activity date bounds, period selection and empty/error states. Chart components are mocked; authenticated desktop/mobile visual review remains pending. No scraping, model, messaging, migration or executor activation was performed.

## New lead search integration

`/scraping/new` provides business type, named area, country, source, new-business target, website/contact filters, billing account and explicit provider/customer spending limits. Google Maps supports Pakistan and US; Yellow Pages requires US. Yellow Pages paid live quality remains UNVERIFIED. The existing workflow validator supplies request validation. Targets are new businesses for this organization, with one bounded provider attempt; no promise of filling the target or automatic paid refill.

The gateway exposes only `POST /dashboard-api/search/preview` and `/dashboard-api/search/submit`. Both require Firebase authentication, current organization membership, owner/admin role, exact same-origin JSON requests and bounded request bodies. The trusted gathering key is read server-side from the existing ignored file and never returned. No new n8n webhook or migration was needed.

Preview calls the existing `gathering-preview` route, which reads billing availability without reserving funds or running Apify. The returned review token is HMAC-bound to the authenticated subject, organization, exact request, spending settings and ten-minute expiry. Editing invalidates the browser's review; gateway restarts invalidate existing review tokens. Confirmation forwards only the signed request to existing `start-scraping`; database admission retains its locking, credit reservation, queue and request-ID checks. A successful response means accepted/saved, not completed. The gateway never retries admission automatically.

Before confirmation, the browser saves the request reference under a subject-and-organization-specific session-storage key. An uncertain result blocks replacement from that screen, including after reload. `GET /dashboard-api/api/search-request` rechecks membership and performs a read-only organization/request lookup; it can reconcile the job without repeating admission. No-match is explicitly inconclusive. Clearing browser storage or using another browser cannot provide global duplicate protection; existing backend request-ID idempotency remains authoritative. This UI does not promise that independently created new request IDs are the same job.

Search-history pagination now forwards page/limit to the server; previously the browser helper silently discarded them. The local PostgreSQL connection remains read-only: explicit user-confirmed admission runs through existing n8n functions, not direct gateway writes. n8n workflows and schedules were not modified, imported, activated or restarted.

Validation: 47 backend tests passed; 13 UI tests cover the new form and prior screens. Mocked admission verifies one confirmed request, bound settings, role/tenant rejection, tampering/expiry, budget blocks and no automatic retries. Browser tests cover preview-before-submit, double-click suppression, edit invalidation and reload reconciliation. The real n8n preview succeeded once and a subsequent diagnostic timed out; the UI handles preview unavailability without submission. Read-only database checks confirmed the provider budget is available but org 1 credits do not cover the $0.50 quote. No credits were changed, jobs created, paid providers called or outreach sent. Actual paid admission through the new dashboard and authenticated visual review remain UNVERIFIED.

## Lead detail and evidence review

Business names on Leads open `/leads/:leadId`. `GET /dashboard-api/api/lead-detail` validates the lead and organization IDs, rechecks membership, scopes the profile join by organization and invokes the existing `enrichment_report(c.org_id,c.id)` only for the selected organization's cleaned record. Other-organization and nonexistent leads both return `found:false`; a cleaned record without an eligible enrichment report remains viewable with `report_available:false`.

The gateway projects explicit, length-capped fields: cleaned contact details, saved description/research summary, assessment dates and freshness, report notes/warnings/conflicts, recorded email verification states and expiry, sourced website observations/service headings, saved LinkedIn profiles/posts, and bounded page-fetch diagnostics. Internal task errors, raw provider payloads, fingerprints, AI metadata and arbitrary report keys are excluded. External links allow HTTP/HTTPS only, reject embedded credentials, and omit query strings/fragments. Source text is escaped by React, never rendered as HTML. New-tab links use noopener/noreferrer.

Read-only inspection of the five benchmark leads confirmed live reports use an older format without trust.website_presence, warnings or basic.signals. The UI therefore shows unknown website presence and missing byte counts as Unknown; it does not infer absence from a missing website field or fresh assessment. No migration was applied. Paid verification notes in historical trust reports are distinguished from current campaign-specific basic/paid policy and sending eligibility. Opening or refreshing this page neither researches nor authorizes messaging.

Verification: 51 backend and 17 React tests passed, including field projection, unsafe-link filtering, malformed/legacy evidence, literal display of injected HTML text, report absence vs business absence, cross-organization scope and membership rejection before querying. The real read-only detail/isolation checks passed on repeat; the first aggregate diagnostic failed without enough information to establish its cause. No data was changed. Authenticated desktop/mobile visual review remains UNVERIFIED.

## Campaign overview

The connected Campaigns screen lists the selected organization's saved campaigns with current version, offer, CTA, strategy mode and configured channels. `GET /dashboard-api/api/campaigns` rechecks membership before running fixed, paginated SQL. Version joins and all plan/approval lookups are organization scoped. Only explicit display fields are returned; raw campaign configuration, templates, approval actors, provider settings and plan bodies are excluded. Bigint campaign IDs are strings.

Counts cover plans for the current campaign version. Approval records count plans whose latest recorded approval is approve and whose approval hash matches the stored plan hash; this is not a full dispatch/readiness check and can include expired plans. Expiry is counted separately. The screen never generates, approves or sends plans. Existing campaign creation/version controls and executor gates are unchanged.

Read-only verification found two campaigns for org 1 and none for an unregistered organization; existing lead and search counts remained unchanged. Nine query-service tests passed, including the new campaign scope/field-projection/authorization checks. Two UI tests cover current-version labels, literal source text, pagination and initial error handling. Authenticated visual review remains UNVERIFIED. Next integration: campaign creation and individual plan review through existing backend contracts.

## Saved strategy review

Campaign names open `/campaigns/:campaignId`. The authenticated read-only `/dashboard-api/api/plans` endpoint validates bigint campaign IDs, checks organization membership, and scopes campaign, plan, lead and latest-approval joins. Paginated history includes older campaign versions with explicit labels. The projection excludes raw plan bodies, fingerprints, approval actors and provider metadata while exposing bounded first-message parts and references, follow-up drafts/intents, call guidance, fit notes, generation method/model, fallback acknowledgement requirements, review flags and saved blocks. Message text is escaped by React.

Expiry, body/hash integrity, approval/hash matching and campaign version are displayed independently. These are saved-plan checks, not a dispatch eligibility decision or permission to send. Fact/benefit/copy reference IDs are not presented as underlying source evidence; the page links to lead evidence. Legacy records retain metadata visibility; unsupported old message structures are not reconstructed or treated as new v2 drafts. No approval, regeneration, AI or sending action is invoked.

Verification: eleven query/projection tests passed; read-only real plan lookup and cross-organization isolation passed. Two component tests cover old-version/expired/approved/fallback combinations, HTML escaping, reference labels and missing-campaign isolation. No database changes or provider calls. Authenticated visual review remains UNVERIFIED. Campaign creation and approval mutations remain pending.

## Campaign creation form

`/campaigns/new` collects offer/benefits/prohibited claims, target categories/locations, CTA and HTTPS link, sender identity, AI or template mode, preferred channels, offer qualification profile and IANA timezone. Supplied email templates preserve the existing allowed variables. The initial form uses English/professional copy settings, basic email checks, weekday 09:00–17:00 windows and the existing sequence defaults; supplied email copy has no automatically added follow-ups. Advanced scheduling, editing and additional channel template editors remain pending.

`POST /dashboard-api/campaign/create` requires existing same-origin JSON authentication and owner/admin membership. It calls the canonical strategyRuntime campaign validator before forwarding to the existing authenticated `strategy-campaign` n8n endpoint. Unknown root keys are rejected. Browser organization IDs are overwritten by the authenticated client context. Existing versioning and backend validation are preserved. The PostgreSQL pool remains read-only; saving invokes existing n8n campaign persistence only after user submission. It does not enqueue generation or invoke providers/sending.

Creation does not introduce a new database idempotency key. Instead, duplicate clicks are blocked, the save is never automatically retried, and an uncertain result is retained per subject/organization in browser session storage across reloads. Reconciliation currently requires checking Campaigns or an administrator; clearing storage/using another browser cannot guarantee duplicate protection. A confirmed save offers explicit creation of another campaign. No real campaign was created during development.

Verification: eighteen gathering/action HTTP tests passed, including canonical campaign validation, role restrictions and uncertain-save behavior. Three UI tests cover duplicate-click suppression, confirmation/create-another, retained uncertainty and member restrictions. First real campaign persistence through the dashboard and authenticated visual review remain UNVERIFIED. Plan approval and generation request controls remain pending.

### Campaign navigation correction

The Create campaign anchor triggered a document reload. PrivateRoute previously redirected the initial Firebase `loading` state to Access, which redirected authenticated users to Overview, losing the requested URL. PrivateRoute now holds the requested route behind a loading status until authentication and membership resolve. The same fix preserves other protected deep links on reload. Signed-out users still redirect to login and unconfirmed memberships remain protected. A routing regression test reproduces loading-to-ready at `/campaigns/new` and verifies the URL stays unchanged; a signed-out case verifies protected content stays hidden.

## Strategy draft requests

The campaign review page now includes business search/selection and explicit generation confirmation. `POST /dashboard-api/strategy/request` allows only org/campaign/lead/request identifiers, validates safe numeric IDs, rechecks owner/admin membership and forwards exactly once to the existing `strategy-request` n8n endpoint. The backend retains existing campaign context, queue, lease, AI allowance and idempotency checks. The gateway never extends allowance, calls models itself or approves/sends the result.

Request references use cryptographic random IDs and are retained per subject/organization/campaign in session storage before admission. An uncertain result blocks replacement and is not retried automatically. The authenticated read-only `/dashboard-api/api/strategy-request` lookup returns only job ID/status/attempt count and saved plan ID; all joins use org_id. A no-match result is inconclusive. Terminal jobs allow an explicit new request; completed plans appear after refreshing the saved-plan list. Batch generation and automatic progress polling remain future integrations.

Validation: 19 action/HTTP tests, 10 query-service tests and 3 strategy-request/review component tests passed. The actual read-only lookup and existing campaign/plan isolation checks passed. The existing generation webhook has not been invoked during this development, so first real admission/generation and authenticated visual review remain UNVERIFIED. No model, Apify, messaging, allowance or live data writes occurred. Approval controls remain pending.

## Content approval and revocation

Each saved plan now has explicit confirmation for approval/revocation. The UI explains that enabled executors may act after content approval and that revocation cannot recall sent/in-progress outreach. Fallback and customer-supplied claims require separate acknowledgements. Members cannot operate these controls. Expired, invalid, unsupported or visibly blocked plans cannot be approved from the screen.

`POST /dashboard-api/strategy/approval` validates exact fields, numeric IDs, action and hash, rechecks owner/admin membership, and derives actor from the verified subject. A fixed read-only preflight loads only the tenant's authoritative plan, checks body/hash integrity, context fingerprint/freshness, v2 completion state, empty validation/block arrays, and customer-content metadata. Fallback/customer acknowledgements must be actual booleans and their hashes are assigned server-side. Revocation remains available for stale plans, with a matching content hash. The existing n8n `strategy-approval` endpoint performs transactional rechecks; no approval SQL or migration was changed.

Writes are never automatically retried. The browser retains an uncertain action per subject/org/plan/hash and reconciles through refreshed latest approval state. Backend preflight read failures are distinguished from uncertain writes. Execution gates and schedules are untouched; approval responses do not directly grant execution authority. No actual plan approval/revocation was performed during development.

Verification: 16 backend approval/HTTP/projection tests and four UI approval/review tests passed. Read-only real preflight and tenant-isolation checks passed. First actual approval through the dashboard, end-to-end executor reaction and authenticated visual review remain UNVERIFIED. No provider calls, model calls, messages, migration or allowance changes occurred.

## Outreach activity screen

`/outreach` now reads the selected organization's saved activities using fixed, authenticated `GET /dashboard-api/api/outreach`. Channel filters and pagination are validated; every lead join is org-scoped. Projections include recorded activity/dispatch/delivery states, step, saved due/next-check values and created/sent/replied/bounced timestamps. Raw dispatch metadata, messages, internal error text, engagement scores and external provider identifiers are excluded.

Summary counts describe all matching activity records, recorded reply/bounce timestamps and explicitly uncertain/reconciliation/review dispatch states. Counts are not unique prospects, measured conversion or confirmed delivery. Historical tests remain included. Provider acceptance and delivery are displayed independently; missing events remain unknown. LinkedIn manual records remain customer-reported. Legacy timestamp-without-time-zone values are serialized by PostgreSQL JSON without conversion and displayed as saved wall times; the UI does not invent a timezone.

Reads refresh every 30 seconds while visible. Initial errors do not show fake zero totals; prior snapshots use the shared stale-data handling. There are no sending, retry, cancel or activation controls on this screen. Connected provider setup and production callback/event coverage are separate remaining work.

Verification: 11 query-service tests and two outreach component tests passed. The actual read-only query returned one activity for org 1 and none for an unregistered org. Delivery-unknown wording, filter behavior, timestamp display and initial-error behavior were tested. No database writes, model/provider calls or outreach actions occurred. Authenticated visual review and end-to-end event coverage for every channel remain UNVERIFIED.

## Workspace settings

`/settings` now shows organization name/status, the verified membership role, signed-in email, organization BYOK configuration status and visible registered sender connections. The fixed authenticated `/dashboard-api/api/settings` query projects connection provider/address, sharing/state, saved sending/reply capabilities, last-check timestamp and daily/rolling/spacing limits. Up to 100 visible connections are shown with the actual total. Raw credentials, credential references, owner subjects, provider identities and channel metadata are excluded. Apify key presence is reduced to a boolean in SQL; keys never leave the database.

Private/team sender visibility matches the existing connection authorization rule: owners/admins may view the organization's registry, while members see team senders and their own private senders. Organization and subject values are server-authenticated; interpolated subject strings use manual single-quote escaping. No cross-org sender is joined or returned.

All labels describe saved configuration and capabilities, not a current provider connection test. Ready registry state does not bypass campaign gates or establish recipient consent. Platform scraping credits remain separate from the organization's BYOK account. Sender connection/reconnection, limit editing, calling/Calendar settings and live provider diagnostics are not yet connected on this screen. The source files for those existing integrations remain unchanged.

Verification: 12 query-service tests and two Settings component tests passed, covering member/private visibility, admin visibility, membership denial, projection of metadata without credentials, recorded-capability wording and error handling. The actual read-only query returned one visible sender for org 1. No provider calls, credential exports, registry changes or limit changes occurred. Authenticated visual review remains UNVERIFIED.

## Existing sender lifecycle actions

Settings now offers confirmed pause, disconnect and request-recheck actions for manageable registry entries. `can_manage` is computed server-side from the verified role/subject and returned without owner identity. The UI exposes the existing permission rule: owners/admins manage organization senders; members manage their own senders. Other team senders remain visible but have no controls.

`POST /dashboard-api/sender/manage` accepts only org/connection/expected-version/action. Firebase membership is checked before execution, subject is derived server-side and string interpolation uses single-quote escaping. The only mutation query is the existing `sender_connection_manage` function, which locks the row and rechecks membership, ownership and version. There is no generic SQL or credential endpoint. The authentication/data PostgreSQL pool remains read-only. A separate lazy registry-write pool is instantiated only on an authenticated confirmed action and closed with the gateway; startup and anonymous probes never instantiate it. No schema, grants or n8n webhooks were changed.

All three existing actions clear saved send/reply capabilities. Pause disables registry dispatch; disconnect changes registry state without revoking a provider token. Request-recheck sets pending_check and requires a later trusted check before readiness; it does not itself run a provider check or replace credentials. Sent/in-progress outreach cannot be recalled. A per-subject/org/connection session marker blocks uncertain retries; refreshing a newer registry version clears the uncertainty and asks the user to review current state.

New Gmail OAuth enrollment, SMTP credential provisioning, provider token revocation/replacement and WhatsApp new-account signup remain pending dashboard bridges. This slice does not pretend registry recheck is OAuth reconnection.

Verification: 23 registry/query/HTTP tests and four sender-actions/Settings component tests passed. Read-only Settings queries verified versions and permission projection against local records. No real sender was paused/disconnected/rechecked, no write pool was instantiated in tests or route probes, and no provider calls occurred. First actual registry mutation and authenticated visual review remain UNVERIFIED.

## Organization Apify enrollment

Settings now offers an owner/admin-only BYOK key form with explicit organization/provider-billing confirmation. The password field is cleared on submission. Neither the key nor its provider response is stored in browser storage; only a per-subject/org pending marker is retained for uncertain submissions. An uncertain replacement is not automatically retried or marked reconciled merely because an older key is already configured. Administrative reconciliation is required before another replacement.

The fixed authenticated `/dashboard-api/apify/connect` action validates org/key format, checks role and reads the existing `connect-apify` workflow's retention settings before forwarding the key. Exactly one matching active header-authenticated workflow must have success/error/manual execution persistence disabled and progress saving disabled. Failure or inability to read this preflight blocks forwarding. This is a query-only check; no workflow is modified. The existing connection workflow verifies provider identity and uses its transactional organization-owned BYOK linking function, including account uniqueness and unsettled-job guards. Only a sanitized connected/BYOK result or allowlisted error code returns to the browser. No raw provider errors or keys are returned.

Connecting authorizes verification and account linking only; it neither starts scraping nor increases provider credits, organization allowance or spending caps. Existing platform billing remains available separately. New Gmail/SMTP credential provisioning and WhatsApp signup bridges remain pending.

Verification: 20 action/HTTP tests and four Apify/Settings component tests passed. Read-only live workflow inspection confirmed the key-bearing connection workflow meets the retention preflight. Role rejection, no key in responses, pending-marker-only storage and no automatic retry were tested against mocks. No real key submission, provider call, account replacement or scraping run occurred. First actual connection from the dashboard and authenticated visual review remain UNVERIFIED.

## User-requested SMTP recheck — 2026-11-08

The user's Settings screenshots showed a successfully saved recheck request and the existing org 1 SMTP sender in pending_check. Read-only workflow inventory found the existing inactive `managedSmtpcheck`, with manual trigger and one CUSTOM.managedSender operation=check, release=null. The existing diagnostic was hardened to assert organization 1 and exactly one manual trigger before execution.

The manual checker then completed successfully: sender state ready, version 6, send_capable=true, reply_capable=true, checked_at 2026-11-08T04:49:27.156603Z. It authenticated SMTP and opened INBOX read-only. This verifies account access, not end-to-end email delivery or actual reply matching. Raw credential/CLI output was suppressed. The before/after outreach activity count was unchanged and zero emails were sent. No workflow was imported or activated, and sender limits were unchanged. The safe result is recorded in documentation/strategy-contract-v2/smtp-org1-check.json.

Dashboard recheck requests still only set registry pending_check; this verification was an explicit operator-run manual workflow. Automatic processing of future rechecks remains pending. Refreshing Settings reads the updated capability state.

## Automatic SMTP rechecks — deployed 2026-11-08

The existing check-only workflow now runs every minute for the configured org 1 `fahad-gmail-smtp` sender, retaining its original SMTP/IMAP binding and sticky notes. Only pending_check reaches provider credentials. Ready, disabled, disconnected and reconnect_required senders stay idle. This is not a generic checker for every newly registered sender; additional bindings need their own trusted provisioning.

The worker takes a connection-scoped PostgreSQL advisory lock for checks and holds it on its dedicated client until close. Overlapping checks return busy without provider access. The existing version-fenced `sender_connection_checked` persists both successful and failed verification; failure sets reconnect_required and requires a fresh user request. If the database is unavailable when persisting failure, the pending state may remain and the next tick may attempt it again; durable failure/backoff during a database outage remains UNVERIFIED. Send/poll logic and all dispatch leases/budgets remain unchanged.

Deployment saved the prior workflow and worker under ignored `.local/sender-recheck-20261108`, verified no new/running/waiting executions before restart, copied the worker, imported only the checker and activated its one-minute schedule. n8n health passed. Other workflow nodes/connections/active flags and the activity count were unchanged; SMTP send and reply-poll workflows remain inactive. No migrations, credentials or new webhooks were introduced.

Sixteen worker/adapter/diagnostic regression tests passed. The end-to-end automatic test completed at 2026-11-08T04:59:41Z: sender ready, version 10, sending and read-only inbox capabilities confirmed. Zero emails were sent and the outreach activity count was unchanged. Safe deployment/test results are saved in the ignored deployment directory. This verifies provider account access, not delivery or real reply matching.

Rollback is prepared, not executed: deactivate only managedSmtpcheck with `n8n update:workflow --id=managedSmtpcheck --active=false`; restore `before-worker.cjs` to the existing custom worker path; import `before-workflow.json` into the checker's existing shared project; restart n8n only when executions are idle. The original checker was inactive, so rollback must leave it inactive. Keep send/poll workflows inactive throughout. The backed-up files retain the original credential references and must remain private.

## Selecting a campaign email sender

Campaign review now shows its current saved sender connection and a selector of visible registered Gmail/SMTP accounts. The selector reads the same private/team-scoped Settings projection. Sending/reply capabilities must both be recorded ready before the UI permits confirmation. Owners/admins can save the selection; the backend still performs canonical connection permission/readiness checks.

The fixed `/dashboard-api/sender/bind` endpoint accepts org, connection, campaign and expected campaign version only. It derives the actor subject from Firebase membership and invokes existing `sender_connection_bind` through the separate lazy registry-write pool. No credential reference, SMTP password, sender policy or enable flag is accepted from the browser. The canonical function saves a new campaign version with email_dispatch.enabled=false; the UI explains that plans need to be generated/reviewed for the new configuration. It does not authorize or activate sending. WhatsApp/calling campaign bindings are not handled by this email-specific form.

Uncertain results retain a subject/org/campaign marker and are never automatically retried. Refreshing a newer campaign version reconciles its actual saved sender; a different binding is reported as changed configuration, not assumed success. The current binding projection contains only the public connection ID, not owner/credential information.

Verification: 14 management/plan/HTTP tests and four campaign-sender/review component tests passed. Tests cover server-derived subject, expected version, owner/admin restriction, unknown-field rejection, confirmation, duplicate-click prevention and blocking an unready sender. Real read-only campaign/sender queries passed. No actual campaign binding was changed, no workflow or provider was invoked, and no outreach was sent. First real binding and authenticated visual review remain UNVERIFIED.
