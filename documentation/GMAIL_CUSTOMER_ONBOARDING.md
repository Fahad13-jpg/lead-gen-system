# Gmail customer onboarding — local integration awaiting user consent

## Current increment — 9 November 2026: same-account reconnect

Settings now offers an explicit reconnect action for customer-enrolled Gmail
accounts. The private account owner, or an administrator of a team-shared account,
must acknowledge the recheck and authorize the same mailbox again. OAuth retains
the existing state, nonce, PKCE, signature, scope and profile checks. Tokens never
return to the browser; token exchange is attempted once. A lost completion response
can use the short-lived completion receipt, without replaying the exchange.

Replacement preserves the credential ID, mailbox, connection ID, limits and reply
history. Credential ciphertext and the registry version/capability reset commit
atomically. A trusted initial permission check can restore readiness; existing
campaign bindings need explicit rebinding and review after the version changes.
No campaign release or send is implied. No tables, migrations or n8n webhooks were
added. The existing OAuth callback is reused.

The immutable Google subject is pinned inside encrypted credential data, outside
oauthTokenData. The installed n8n OAuth refresh implementation preserves that root
field. Legacy credentials may use their previously stored ID-token identity as a
migration pin; missing identity proof or a changed OAuth client fails closed with
GMAIL_RECONNECT_IDENTITY_REVIEW_REQUIRED. Matching email alone is insufficient.

Validation: 36 focused backend tests and 11 Gmail/Settings UI tests passed. The
scratch database confirmed rollback after a simulated partial token update,
unchanged credential IDs, ownership checks and version fencing; all changes rolled
back and providers were mocked. Real Google reauthorization and browser completion
remain UNVERIFIED. This local implementation uses process-memory five-minute OAuth
state/receipts. After an uncertain outcome, reconciliation can retire the old
callback and allow explicit fresh consent, without claiming the earlier operation
succeeded. Durable multi-instance operation remains UNVERIFIED.

Installed locally: dashboard build main.57c19e89.js and gateway reload completed.
Settings returned 200 with that build; anonymous reconnect returned 401. The real
installed n8n Cipher round-tripped the rotation helper with an ephemeral random key
and invented tokens, preserving the identity pin. No actual credentials were read
by that check. No provider calls, sends, workflow imports/activation or live database
writes occurred in this increment. Smoke evidence:
`.local/gmail-reconnect-20261109/smoke.json`.

Use a separate Web application OAuth client in the existing Google Cloud project. This isolates the dashboard callback and sender scopes from n8n's current client, without changing existing sender connections or creating another Google project. Firebase sign-in continues to authenticate dashboard membership; it does not grant Gmail access.

## Operator setup to prepare

1. Open Google Cloud Console → APIs & Services → Credentials in the existing project. Create Credentials → OAuth client ID → Web application.
2. Name: `LeadGen Gmail onboarding`.
3. Register the local authorized redirect URI `http://localhost:3002/oauth/gmail/callback`. The local callback is now implemented. Do not substitute n8n's existing callback or modify that existing client.
4. Download the new client JSON and save it privately as `C:\Users\hp\Downloads\gmail-oauth-client.json`. Do not paste its client secret into chat or commit it.
5. The Gmail API must be enabled in the selected project. Consent configuration needs sending and read-only inbox scopes for sender/reply processing. Public rollout requires review against Google's current Gmail scope verification rules; do not assume Firebase or an existing n8n consent configuration covers the new client.

## Implemented local core

`scripts/sender-connections/gmail-onboarding.cjs` is an offline-testable, dependency-injected orchestration module. It has no HTTP route, default provider client or credential writer. It stays unavailable until enabled configuration and every trusted dependency are supplied.

Begin verifies current org membership and sharing permissions, creates a five-minute server-held state/nonce/PKCE verifier, and returns a Google authorization URL requesting offline consent for openid/email/gmail.send/gmail.readonly. Finish rechecks membership, consumes state bound to subject/org/client/callback, exchanges the code once, requires refresh access and both Gmail permissions, verifies Google identity through a trusted signature-verifying adapter, compares canonical mailbox identity, provisions a credential and registers a pending_check sender with the existing initial 10/day, 10/24h and 300-second-spacing limits. Tokens and credential references do not return to the browser. Failed registration quarantines a known credential reference. No sending or campaign binding occurs.

The injected ID-token verifier must perform signature/key validation plus issuer/audience/expiry checks; the core's claim checks are NOT cryptographic verification. The provisioning adapter must encrypt/store tokens within the trusted credential boundary, enforce tenant ownership and handle ambiguous provisioning before returning a reference. Quarantine is not itself provider token revocation. A process-local session map is suitable only for this initial single-process local flow; production restart/multi-instance coordination requires a deliberate session-store adapter. No new table/webhook was introduced.

## Remaining adapters and verification

Implemented locally: fixed-destination token exchange/profile clients, Google-library ID-token verification, encrypted credential provisioning and ownership checks, Firebase-to-registry registration, authenticated begin/finish/status routes, a clean callback relay and dashboard control. Remaining: real-account consent/credential interoperability, refresh/revocation lifecycle validation, and a Gmail-specific trusted capability check. The SMTP checker does NOT verify Gmail OAuth accounts. No live Google token exchange or account connection has been performed during development.

UNVERIFIED: actual Google PKCE exchange with this Web client, consent/refresh behavior for the chosen project, live Gmail mailbox identity, n8n credential provisioning schema for the installed version, end-to-end callback security in the browser, provider revocation and failure cleanup. Five mocked tests cover successful state/PKCE flow, single-use replay protection, cross-subject rejection, missing scopes, quarantine after registration failure, setup gating, expiry and invalid identity.

## Client configuration received — 2026-11-08

The downloaded client JSON was validated without printing its client secret: Web client, client ID, client secret and exact local callback are present. The secret file remains in Downloads. Ignored `.local/gmail-onboarding/config.json` stores only its absolute file path, the local origin/callback and enabled=false. No secret was copied into source or browser assets.

## Local wiring completed

### Enrichment storage rollout completed — 2026-11-08

The separately approved migration 016/helper rollout is now complete on local n8n/Postgres; earlier pending-016 notes below are historical. See `ENRICHMENT_016_ROLLOUT_20261108.md` for backup, tests, real canaries, controls and rollback. Five profiles have modern fresh signal sheets; 39 remain queued for free basic reassessment. Research/LinkedIn and the strategy planner remain paused; AI allowance is unchanged. Missing emails are still blocking outreach. No delivery/reply result is implied by this enrichment rollout.

### Legacy enrichment evidence compatibility — 2026-11-08

Read-only inspection confirmed the live enrichment fingerprint/finish/report/trust functions still predate migration 016, and all seven inspected profiles lack basic.signals, website_presence and assessment_status. Migration 016 was NOT applied. The live enrichment controls remain enabled, but no task was enqueued/refreshed by this work. Legacy report freshness is already fingerprint- and time-gated (website 30 days/research seven days); it is not proof that a website exists.

The v2 planner now uses `legacy-evidence.cjs` for older profiles only. Prior valid complete/partial assessments become assessed rather than misleadingly not_assessed. Website presence becomes present only when current trusted report metadata, observed time, canonical recorded website and same-site successful usable pages agree. Failed/blocked/cross-domain/unproven fetches remain unknown; no missing URL becomes none_found. Only service excerpts tied to recorded successful pages and valid original observation times survive. Modern explicit presence/assessment fields are preserved. No signals, quality verdicts, contact paths, ownership verification or new observation times are invented. The brief carries the legacy profile's limitations. Fingerprint, approval and dispatch semantics are unchanged; v1/customer-template paths are preserved.

Real replay: lead 449 retained eight eligible stored service excerpts; the existing conservative brief cap retained one present-polarity cosmetic-dentistry excerpt from its recorded source. Its observation remains 29 days old and will expire under the existing 30-day gate; it was not refreshed. Leads 445–447 remain unknown for website presence; all five benchmark leads still lack email and remain blocked for outreach. Lead 167 still has zero service excerpts. Assessment was recognized as performed, with fit unclear because no signal sheet exists.

Validation: nine compatibility tests, 15 embedded Code-node tests and 33 contract cases passed. Social/directory URLs cannot become company-website evidence; empty excerpts are dropped. Actual local Prepare/Preview replay of stored lead 449 restored an excerpt while preserving its fingerprint, fully_verified=false, missing-email block, AI controls/ledger/plans and zero provider calls. Evidence: `.local/planner-legacy-evidence-verification.json`, `.local/clinic-gmail-preflight-benchmarks.json`. Final three-Code-node-only deployment/backup: `.local/planner-email-readiness-1794139420847/`; the earlier compatibility import is preserved in `.local/planner-email-readiness-1794139199454/`. SQL, graph, sticky notes and activation remain unchanged. The broader legacy writer risk (failed refresh can replace good evidence) and full migration 016 rollout remain unresolved; this planner adapter does not claim to fix enrichment storage or supply missing emails.

### Planner Gmail drafting readiness integrated — 2026-11-08

This supersedes the earlier blanket executor_not_integrated gap for the connected Gmail account. The existing claim and preview SQL nodes now append a server-owned email_sender_snapshot alongside the evidence input, without altering strategy_context, its fingerprint, reservations, leases or schema. Snapshot queries read the exact registered sender, org/membership/access, connection version, granted capabilities, health age, limits and installed sender/reply workflows using the same credential. No credential data or token is selected. Array guards use CASE.

`email-readiness.cjs` permits draft planning only when this snapshot is current (60 seconds), sender health is within the existing 24 hours, all bindings/access/limits match, and both account-specific workflow copies exist. It then removes only executor_not_integrated. All existing suppression, reply, email eligibility, conflict and targeting reasons remain. Disabled dispatch is compatible with drafting; execution_authorized remains false. Campaign-provided pretend snapshots are ignored. Preview and generation use the same adapter; v1 and customer-template paths are unchanged.

Validation: six focused readiness tests, 15 actual embedded Code-node tests and 33 contract cases passed. Real SQL preview, EXPLAIN-only claim SQL, and offline embedded Prepare/Preview passed using stored lead 446. The AI controls, AI ledger and plans were unchanged, fingerprint was preserved and missing email still blocked. The five-lead offline preflight now omits only the obsolete integration blocker; no lead gained email permission or evidence.

Targeted import applied to the current live planner: three Code bodies and two SQL query texts only. The planner was inactive and remains inactive. Live graph, sticky notes, modes, credentials, settings, other workflows and outreach activity were preserved. No restart, migration, activation, model call or send occurred. Backups/rollback input and deployment result: `.local/planner-email-readiness-1794138098584/`. Restore `before.json` through the existing n8n import path only after comparing current live state; keep the planner inactive. Evidence: `.local/planner-email-readiness-verification.json`. Local builders: `node scripts/lead-strategy/v2/build-native.cjs`, then `node scripts/lead-strategy/v2/build-email-readiness.cjs`.

### Campaign binding and offline lead preflight — 2026-11-08

The existing DRAFT Islamabad Dental Clinic Website Introduction campaign (org 1 / campaign 1) was bound to the ready Gmail sender through sender_connection_bind, producing campaign version 3. AI mode and offer were preserved; email_dispatch.enabled remains false. There were no plans. An initial conservative attempt refused to run because of a pending job; a read-only reconciliation confirmed version 2 was unchanged. The installed strategy_claim definition was then checked for its existing older-version supersession guard, and binding proceeded with no processing leases. No queued job or lease was edited; the old version remains handled by the normal planner. The strategy AI ledger count stayed unchanged.

Offline preflight used real strategy_context evidence for five stored dental-category leads (230, 231, 167, 445, 446). None currently permits email drafting: missing or risky/review contacts, target location/category mismatches, no assessed basic evidence, and the legacy executor_not_integrated readiness marker remain. The direct contract preflight did not inject synthetic readiness. The marker is a known remaining planner/installed-executor readiness integration gap, not a reason to remove other contact/trust blockers. Qualifier results were not_assessed and present-fact counts were zero; do not describe these leads as verified/enriched or spend model requests to invent missing facts.

Current org 1 strategy_ai_controls: enabled=false, monthly_limit=0, zero requests this month. No allowance/trial ledger was expanded, model called, plan created, content approved or email sent. Private local artifacts: `.local/clinic-gmail-binding.json`, `.local/clinic-gmail-preflight.json`, `.local/clinic-gmail-briefs.json`. These observations supersede assumptions that the current campaign can already generate an executable personalized email strategy.

### Inactive sender/reply installation — 2026-11-08

Prepared and imported two copies of the existing Gmail executor/reply workflows for the connected org 1 sender, using `gmail-package.prepare`. Installation evidence and full JSON are in `.local/customer-gmail-1794135745319/`. Workflow IDs: `gmailSend_9805c8eb4489b3b7`, `gmailReply_9805c8eb4489b3b7`. Both are inactive. The send transport still throws EMAIL_TRANSPORT_NOT_ENABLED, the selection binding remains null, and the mailbox gate returns null. No synthetic plan/release was introduced. Queries were additionally scoped to the organization, embedded identity checks use the new credential, existing connections/sticky notes were preserved, and execution-data retention is disabled.

Thirteen packaging/connection/release tests passed. Import verified both inactive, preserved every other workflow's nodes/connections/activation and left outreach counts unchanged. No workflow was executed, provider called or email sent by this installation. The existing bounded release builder remains the route for enabling reviewed plans; campaign binding, current approval hashes, recipient eligibility, limits and release expiry remain mandatory. Actual delivery/reply behavior for this sender remains unverified. These are current-account installation artifacts, not automatic provisioning for all future customers.

### Requested Gmail rechecks deployed locally — 2026-11-08

`09g_gmail_connection_check.json` is a check-only template with a five-minute Schedule Trigger and manual trigger. The installed org 1 copy binds the current Gmail sender and existing PostgreSQL/Gmail credentials. `ManagedGmailCheck` runs inside n8n, uses native authenticated GET getProfile and reads the granted scopes from the credential without exposing it. It requires an active org/membership, exact credential binding, a session advisory lock and the existing version-fenced sender_connection_checked function. Ready/disabled/disconnected/reconnect_required records are skipped; only pending_check is processed. Unknown provider/network failures remain pending for the next five-minute tick, with no inline retries. Known 401/403 or identity/scope mismatches require reconnection. This does not send email or read message content.

Live validation: native workflow execution first returned idle for the ready connection, proving node loading. One explicit registry recheck was then requested for the unbound Gmail sender; the real workflow processed it and returned ready with both capability flags true. Outreach activities were unchanged. Other workflow definitions/activation were preserved. Native token refresh interoperability had separately passed in scratch. Evidence: `strategy-contract-v2/gmail-scheduled-recheck-20261108.json`.

Scope: the installed checker covers this initial sender; additional sender-bound copies must be provisioned for later enrollments. It services requested checks, not automatic daily reassessment of ready senders. Existing 24-hour freshness/version-bound campaign gates remain unchanged; a later recheck changes the connection version and can require campaign rebinding. End-to-end send/reply tests for this sender remain unverified. No email/reply executor was activated. No migrations were applied.

### Real customer credential interoperability verified — 2026-11-08

The enrolled org 1 Gmail credential was selected read-only from the ready registry entry (exactly one required). A disposable container from the installed n8n image imported an encrypted copy into isolated SQLite. Only the scratch copy's access token was replaced with an invalid value, then n8n's native HTTP/OAuth helper fetched Gmail getProfile. Mailbox identity matched, refresh completed, and a fresh access token was persisted in scratch. The live encrypted credential hash was identical before/after. No message content was read, no email was sent, and no live workflow/registry/credential was changed. Scratch container and temporary encrypted export were removed. Sanitized evidence: `documentation/strategy-contract-v2/gmail-customer-refresh-1794134230703.json`.

This supersedes the earlier UNVERIFIED claims for this account's n8n credential schema, profile interoperability and token refresh in isolation. Delivery, reply/thread behavior for this new sender, revocation handling and later scheduled Gmail checks remain unverified. The generic diagnostic now accepts `--customer-org=<id>` while retaining its original legacy mode. It never changes the live token to force refresh.

Recovery UX: uncertain enrollment now offers Check connection status. Its authenticated same-origin POST uses a conservative read-only credential existence check. The local single-process service refuses recovery while a finish is active or its generation changes during the read, and cancels the old callback relay before allowing the browser to clear sessionStorage. Existing managed/quarantined Gmail credentials anywhere block automatic recovery, including orphans: operator reconciliation is then required. This is intentionally conservative, not per-attempt durable attribution for multi-instance production. Failed checks preserve the browser lock. No provider calls, sends or credential writes occur during reconciliation. Tests cover empty/nonempty/error outcomes, concurrency and browser lock retention.

Initial capability check (local): after successful Google signature/nonce/identity checks, required scope validation, matching Gmail getProfile and encrypted credential registration, an internal continuation calls the existing sender_connection_checked function. It requires a short-lived, single-use registration receipt bound to org, authenticated owner, mailbox, credential and saved version. Pause/disconnect/recheck races are fenced by that version. This can mark the connection ready based on authenticated identity and granted send/read permissions; it does NOT prove delivery or refresh interoperability. No email or inbox-message content is accessed. Campaign approval, sender binding, limits and release gates remain unchanged. If the continuation fails, the registered account remains pending; it is not quarantined or silently re-enrolled. Gmail-specific later scheduled rechecks/refresh lifecycle remain UNVERIFIED/unimplemented; the existing SMTP checker does not handle Gmail. The actual DB currently has no managed Gmail enrollment, so real verification still requires the user's completed consent/finish flow.

Validation for this increment: 25 backend tests (bridge/provider/core/HTTP), 3 focused Gmail UI tests, and a successful React production build. The UI explicitly distinguishes granted permission checks from actual delivery testing.

Real-attempt diagnosis: the new stage log identified credential_storage/STEP_FAILED. Read-only inspection confirmed both n8n credential ID columns are varchar(36), while the initial generated ID was 38 characters. Provisioning now uses a standard 36-character UUID; the bridge regression test enforces that installed contract. No credential existed after the failure. Real provisioning after this fix remains UNVERIFIED. A separate Google 403 access_denied screenshot shows the selected mailbox must be on the testing OAuth project's approved test-user list; Firebase dashboard sign-in does not grant Gmail scopes.

First real linking attempt returned unconfirmed. A subsequent read-only reconciliation found zero managed/quarantined Gmail credentials and only the existing ready SMTP sender; operator project binding exists. The cause of that attempt is UNVERIFIED because the original error omitted stage diagnostics. Fixed allowlisted stage/transport diagnostics now log only stage, fixed reason, endpoint label, HTTP status and recognized network class; never provider bodies, email, authorization codes, tokens or credential references. Eleven focused provider/bridge/core tests pass, including diagnostic redaction. The diagnostic script `scripts/diagnostics/gmail-onboarding-state.cjs` selects counts/states only and is read-only. No failed code exchange is retried automatically.

Google return navigation fix: browsers retain cross-site Fetch Metadata through the callback redirect. The gateway now permits only GET `/settings?gmail_return=1` with navigation/document metadata and no Origin header. API requests and other cross-site requests remain blocked. The focused HTTP suite passes 11 tests, including the return document and negative API/origin cases. Restarting the gateway discards pending authorization state, so authorization must start fresh afterward.

The local enabled flag is now true after wiring the adapters (superseding the disabled scaffold above). The secret remains outside source. google-auth-library 11.3.3 is an explicit private-backend dependency. Startup checks the credential-table/function permissions and keeps onboarding unavailable if setup fails.

Begin binds state to Firebase subject and org, and requires the canonical localhost:3002 origin. Google callback GET is the sole cross-site exception: it captures the authorization code in process memory, returns no code/token in its body or Location, and redirects to Settings. The browser stores only the opaque state nonce. Authenticated finish rechecks org/subject before exchanging the code once. Codes expire with process-local state after five minutes; restarts require fresh authorization. Uncertain finish results block another enrollment pending reconciliation.

After verified Google identity and Gmail profile matching, raw credential data is piped through stdin to an n8n-container encryption helper. The n8n encryption key stays inside the container. Only ciphertext returns to the private backend. One atomic CTE inserts the encrypted gmailOAuth2 credential and the existing operator-managed n8n project ownership. The project is resolved from the existing SMTP check workflow; native n8n projects are operator-managed, while the new sender registry and dashboard enforce organization/subject ownership. Registration uses the existing sender function and defaults to pending_check; sending remains disabled. Unknown/failed registration quarantines known newly provisioned references by disabling a matching registry entry and renaming the encrypted credential. Quarantine does not revoke Google access. Ambiguous credential insert before a reference returns may require operator reconciliation.

Verification: 19 provider/bridge/onboarding/HTTP tests and four Gmail/Settings UI tests passed. Actual n8n encryption round-tripped a non-secret fixture; no credential was created. The optimized build passed. Synthetic callback testing verified a clean redirect, and anonymous status/begin calls were rejected. No real Google code was exchanged, mailbox read, Gmail credential provisioned or email sent. Real consent, n8n token refresh/interoperability, trusted Gmail capability verification, browser end-to-end behavior and revocation remain UNVERIFIED. Existing SMTP automatic rechecks are unchanged.

`scripts/dashboard/gmail-provider.cjs` now provides a server-side config loader, fixed-destination token exchange and Gmail profile adapters, and a Google-library ID-token verification port with explicit audience/nonce checks. Token exchange uses one bounded POST with redirects refused and no automatic retry. Provider errors return fixed classifications; raw responses/tokens never become exception messages. Seven onboarding/provider mocked tests passed. No live Google token exchange or profile request was made. These adapters are not wired into a live HTTP enrollment route yet; encrypted credential provisioning, sender registration and callback/UI integration remain required before enabled can become true. The installed Google auth library was located, but its production verifier adapter still needs explicit construction/wiring and dependency declaration.

Official references: [Google Web server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [OAuth best practices](https://developers.google.com/identity/protocols/oauth2/resources/best-practices), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes).
