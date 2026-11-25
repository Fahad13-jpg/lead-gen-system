# WhatsApp Meta executor — local foundation

**Current state:** see `WHATSAPP_RELEASE_STATUS.md`. The sections below retain the foundation history; their original “not installed/first step only” statements are not a current release checklist. The recorded installed baseline is 046; current 047–050 source and latest worker remain local/unapplied. Customer self-service sender onboarding and real delivery/recheck verification remain incomplete.

Status: developed offline on 2026-10-29. Migration 046 is **not applied live**. Workflow sources are **not imported or activated**. No provider calls or messages were sent. The approved callback exception covers one path, `whatsapp-meta`, with GET verification and signed POST events.

## Implemented behavior

1. A strategy may select WhatsApp only when explicitly enabled by the operator integration flag and a current sender, approved template, documented marketing permission and budget quote are available. A scraped phone number alone is insufficient.
2. The backend renders an approved text-body marketing template with campaign/lead variables. The exact template, variables and rendered message become part of the plan before hashing and human approval. Any subsequent plan, campaign, template or evidence change blocks dispatch.
3. The SQL gate rechecks organization ownership, approval, suppression, conflicts, sender/template freshness, consent, recipient market, release expiry and campaign working window. The first slice supports opted-in Pakistan recipients only. US marketing-template recipients and sequence steps after the first fail closed.
4. The SQL claim atomically reserves a conservative maximum message cost and records one attempt under a lease. Organization-wide daily caps, message spacing and monthly reserved-cost ceilings apply. Multiple enabled campaigns use the lowest applicable caps. Uncertain attempts retain their reservations and block further attempts; lease expiry is not permission to resend.
5. The transport adapter constructs the Meta template request and checks the receipt against the recipient. Provider acceptance is distinct from delivery. `scripts/whatsapp/transport.cjs` resolves credentials through an injected trusted port and checks organization, sender, connection/reference and expiry. The returned submit function is single-use, rejects changed artifacts/requests, forbids redirects, bounds successful response bodies to 64 KiB and redacts transport/provider error details. It has no default network client or credential source. The executor remains mock-only and is not connected to n8n sending. There is no automatic retry after ambiguous results.
6. Signed callbacks verify HMAC-SHA256 against the original raw bytes before SQL. Status and inbound events are correlated to existing sender/WABA/recipient/message records, deduplicated and recorded in existing activity JSON. Delivery statuses cannot regress. Replies pause follow-ups; STOP creates a durable opt-out that later replies cannot remove.

The old Twilio HTTP node in `07d` is now a no-send Code node. Its name, graph and sticky notes remain as history. The schedule is one minute, inactive, with organization binding 0; it neither claims work nor writes fake sent records. `09f` is an inactive callback design. `06C` has an opt-in, hash-bound WhatsApp artifact builder; the live workflow was not updated.

## Configuration and ownership

The trusted backend/operator supplies `campaign.config.whatsapp_dispatch`; it is deliberately not accepted by the customer campaign normalizer. Never let a dashboard/model self-assert sender verification, template approval, consent, quote verification or release authorization. Customers may eventually connect their own business sender, but account authentication/onboarding is not implemented by this slice.

Configuration contains:

- `enabled`, `campaign_state`.
- `connection`: organization, connection and credential references; phone-number ID, WABA ID, explicit API version, state and verification/expiry timestamps. No token in plan JSON.
- `consents[lead_id]`: exact phone, granted marketing purpose, source reference, independently checked country, timestamp and expiry.
- `template`: provider ID, name, language, approved marketing category/status, revision, checked timestamp, body and positional variable references.
- `quote`: verified USD maximum cost per message in integer micro-dollars and expiry.
- `limits`: daily messages, monthly micro-dollar ceiling and minimum interval seconds.
- `release`: explicitly enabled and expiring; configuration is not sending authorization by itself.

See `tests/whatsapp/fixture.cjs` for a **mock-only** example. Its `v99.0` API version and all IDs/references are fictitious, not provider configuration advice. Sender/template checks currently expire after 24 hours; permission must be within 365 days and separately unexpired.

Native preparation requires `WHATSAPP_INTEGRATION_ENABLED=true`. Callback POST handling additionally requires `WHATSAPP_CALLBACK_ENABLED=true`, `WHATSAPP_APP_SECRET`, and a separate sufficiently long `WHATSAPP_VERIFY_TOKEN` for GET verification. Nothing here sets those variables. Never expose app secrets or access tokens in workflow JSON, plans or logs.

`scripts/whatsapp/runner.cjs` connects the gate, credential preflight, atomic claim, transport and finish contracts in offline integration tests. Failed credential preflight does not reserve funds. A claimed artifact differing from the preflight snapshot cannot use the prepared token; the existing attempt is quarantined. A schedule tick skips up to ten preflight-blocked candidates to avoid starvation, but stops after the first claim attempt or submission; subsequent ticks recheck SQL limits. The runner remains mock-only and is not installed in n8n. `submitted` records a transport invocation, not confirmed acceptance or delivery.

## Local sender onboarding progress

2026-11-06 follow-up: after the operator assigned the Messaging Account's template view permission to the system user, the same token successfully returned the configured account's phone list with the expected Phone Number ID. Template listing also returned HTTP 200, five APPROVED templates, no further page. Account binding `1844540190060485` was correct; no ID replacement or token regeneration was needed for this result. This establishes account/sender identity and template-read access only. Sender remains `identity_checked`, not release-ready. No provider message POST, callback test, production import or migration occurred. Temporary Windows-resolved DNS was still required for this diagnostic; production DNS is unresolved.

Live read-only diagnostic evidence supplied by the user (2026-11-05): direct Phone Number ID lookup returned HTTP 200 with an exact ID match; the configured account's `/phone_numbers` lookup returned 100/33. This verifies phone-resource access only, not account membership or sending readiness. The configured ID also matches the Meta Manager asset URL, so a wrong ID has not been established. Earlier expired tokens and Docker DNS failures were separate observed issues.

The diagnostic now optionally lists the known business portfolio's owned WhatsApp accounts and checks up to three account/phone relations. Total requests are capped at six GETs. Discovery uses documented `owned_whatsapp_business_accounts` and `phone_numbers` endpoints; account-specific availability/permissions remain UNVERIFIED. No automatic binding changes, pagination following, permission escalation or send authorization occur. Listing failure must not be treated as evidence that the existing account is wrong.

The user created `WhatsApp Meta Test — Org 1` in n8n. Only credential ID/name/type were read from `credentials_entity`; no token was exported. The pending local descriptor is `.local/whatsapp-org1-onboarding/connection.json` (git-ignored). IDs came from the user's Meta screenshot and remain unverified against the provider. The user confirmed API version `v25.0` from Meta's sample request. Token expiry remains unverified.

`scripts/whatsapp/connection.cjs` provides a read-only, mock-tested account/sender check via `GET /{WABA-ID}/phone_numbers`, documented in [Meta's official collection](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api?entity=folder-13382743-148258e1-3240-4eed-8a78-049bb1d1fe25). Backend credential authorization must succeed before the request. A matching response yields `identity_checked`, never `ready`: account identity alone does not prove permission to send, template approval, callback delivery or campaign consent. Pagination links are never followed automatically; a missing match remains unconfirmed. HTTP/credential ports are injected and are not connected to the running n8n instance.

## Storage boundary / unresolved conflict

Existing `outreach_activities.dispatch_metadata` requires a plan and step. A brand-new, unmatched inbound conversation cannot be represented there safely. No new table or constraint relaxation was introduced. Unknown or ambiguous inbound callbacks return 503 for review instead of acknowledging discarded messages. This must be resolved before public callback deployment: otherwise Meta can retry these events repeatedly. This phase is **not a general WhatsApp inbox**.

Cost reservations are conservative outbound ceilings, not settled provider billing. Accepted reservations are not refunded automatically; unresolved old attempts remain counted. This does not cap incoming-message charges or every account-level Meta charge. A reviewed current quote and external provider billing controls are still required.

## Tests and reproducibility

Run `node --test tests/whatsapp/*.test.cjs` for deterministic readiness/rendering, signature verification, workflow Code-node execution, plan integration and mock transport tests. Tests use no network.

`node scripts/diagnostics/whatsapp-scratch.cjs` verifies the actual SQL chain in isolated container `lead_diag_pg_20261011`, database `scratch_email_release_20261019`. The script checks that the container network is `none`, applies migration 046 inside a transaction, tests approval/hash/lease binding, acceptance, uncertainty, receipt replay, signed-event correlation, delivery ordering, reply/opt-out stops and malformed inputs, then rolls back. It verifies that no WhatsApp functions remain afterward. It never targets the live database.

Build workflow sources with `node scripts/whatsapp/build.cjs` and `node scripts/lead-strategy/v2/build-native.cjs`; these write local JSON only. Workflow execution-data saving is disabled in the callback and executor sources.

## Remaining before a connected release

Follow-up local hardening: callback preparation now preserves an existing enabled state and deployment evidence; unexpected secret changes require reviewed rotation instead of overwriting the environment. An empty/negative database acceptance receipt now returns `uncertain` with `retry_allowed=false`, preventing a provider acceptance from being presented as confirmed persistence. These source changes passed the 63-test offline suite; they have not yet been copied into the installed custom-node runtime. Sending remains disabled.

The user's owned-recipient test approval is kept in private `.local/whatsapp-callback/single-message-approval.json`: one exact message, no follow-ups, conditional on the matching template being approved. It is not permission for general marketing/campaign outreach, does not itself approve a strategy hash, and does not supply a provider spending quote. Existing SQL approval, consent, quote and release checks must not be bypassed to execute the test. Production DNS and explicit credential expiry/rotation configuration remain unresolved sending prerequisites.

Local executor wiring (2026-11-06): `worker.cjs` and `n8n/ManagedWhatsApp.node.js` connect n8n's stored credentials, PostgreSQL gate/claim/finish functions and the bounded Meta transport. Dispatch defaults false before any credential/DB access. It checks operator org/sender/reference binding and requires an explicit future credential expiry; no token lifetime is guessed. Runner/executor now permit `mode=live` only with the explicit adapter switch, in addition to all existing SQL release/approval gates. This is local source code, not an installed or authorized live sender. The package builder includes a separate inactive dispatch draft and transitive local dependencies, preserving existing workflow graphs. Production DNS, template/consent/budget/release configuration, callback storage decision and owned-recipient testing remain required. Mock tests of the adapter are not evidence of live dispatch success.

Local additions: `n8n-check.cjs` and `n8n/ManagedWhatsAppCheck.node.js` adapt the identity check to n8n's credential API without exporting a token. `package.cjs` builds an inactive manual-check workflow and custom-node package under a new `.local` directory; it does not install/import anything. Its binding and operator confirmation default off. The adapter's installed HTTP-helper option behavior and pre-parse response-size enforcement remain **UNVERIFIED**; mocks test the contract only.

`templates.cjs` converts a supplied provider `message_templates` response into the existing template snapshot format, retaining provider category/status and deriving a stable revision from content and explicit variable mappings. It supports one positional text BODY only; media, headers, buttons, named parameters, missing/duplicate templates, unapproved templates and ambiguous pagination fail closed. It performs no provider request. Live template synchronization remains **UNVERIFIED**.

- Account-bound Meta sender onboarding and protected credential storage/resolution; wire the tested transport adapter into a reviewed live executor only after release approval.
- Actual approved template synchronization, permission acquisition/revocation and current pricing/limits.
- Decision for unmatched inbound storage and retention.
- Per-follow-up approved template artifacts; free-form service replies and the 24-hour window are not implemented.
- Owned-recipient live test, callback URL verification/raw-byte transport test and delivery/reply reconciliation.
- Explicit migration/import/release approval. Do not activate schedules as part of local development.

## Provider references / UNVERIFIED items

The request envelope and receipt pattern follow [Meta's official Postman template example](https://www.postman.com/meta/whatsapp-business-platform/request/lwtlz1k/send-message-template-interactive). Raw-body signature verification follows [Meta's official webhook signature sample](https://github.com/fbsamples/whatsapp-api-examples/blob/main/signature-validation-with-webhooks-payloads/app.py). Permission and template requirements refer to the [WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/).

**UNVERIFIED live:** sender eligibility, recipient country/permissions, business verification, API version, account-specific template schema/approval, actual tariffs, limits, token permissions, n8n's installed raw-body binary representation, and real delivery/status/inbound payloads. Provider examples are documentation evidence, not live account verification. No claims of free or unlimited bulk messaging are made.
