# Shared sender connections — 23 October 2026

Status: LOCAL IMPLEMENTATION SLICE, NOT A COMPLETE SELF-SERVICE INTEGRATION. No deployment, new table/webhook, credential creation, live connection check, or sending.

## 24 October checkpoint

User deferred choosing/providing the Flutter login provider. Keep customer API exposure disabled; the local RS256 verifier is a tested option, not a claim of compatibility with the eventual identity provider. No login system was selected on the user's behalf.

Completed interrupted verification: 17 offline identity/connection/workflow tests passed, including exact preservation of migration 028's begin body around the registry gate. The final migration 035 scratch suite passed: registry lifecycle and permissions, private campaign binding with sending disabled, stale versions, live begin denial for paused/revoked senders, preserved approval/message/lease checks, mock receipt, delayed follow-up and reply stopping. Scratch changes rolled back; no live migration or workflow import occurred.

Added `smtp-message.cjs` and `imap-replies.cjs`, tested with eight additional offline cases (25 offline tests total across these suites). They prepare Nodemailer-compatible plain-text messages with a stable per-lease RFC Message-ID, preserve approved content, validate confirmed parent threading, and classify SMTP receipts conservatively. SMTP final acceptance requires the exact Message-ID/recipient and a positive final response; uncertain results always disallow retry. Message-ID is kept as an SMTP identity, never disguised as a Gmail ID.

The pure IMAP matcher consumes trusted parsed mailbox messages, binds original activity to org/connection/sender/recipient, uses In-Reply-To/References and message time, rejects automatic/unrelated/outgoing messages, recognizes standalone opt-out text, and creates deduplication identifiers scoped by mailbox, UIDVALIDITY and UID. Mailbox epoch changes require reconciliation. A matched reply recommends stopping follow-ups but does not write to PostgreSQL. Sender headers are not proof of authenticated authorship. MIME parsing, mailbox polling, DSN/bounce handling and event persistence remain incomplete.

SMTP adapters do not call sendMail or any network provider. Remaining: actual identity-provider integration, credential onboarding bridge and OAuth lifecycle, SMTP-specific SQL receipt/reply persistence, bounded IMAP polling, deployment and real-account verification. The SQL gate continues to reject SMTP dispatch until those pieces are ready.

Provider documentation checked for this addition: [Nodemailer message/thread fields](https://nodemailer.com/message), [ImapFlow client/mailbox API](https://imapflow.com/docs/api/imapflow-client/). Installed library versions and live server behavior remain UNVERIFIED.

Update — storage extension authorized and implemented locally: migration 035 now defines `org_sender_memberships` and `sender_connections` plus management, trusted-check, campaign-binding and dispatch-gate functions. These tables have only been created in rolled-back scratch transactions, not in the live database. No new webhooks were added. The remaining sections describe the original slice; the details below supersede its storage and revocation limitations.

## Persistent backend extension

- Membership uses an organization plus an identity-provider subject fingerprint; billing and credentials remain organization-owned. No deprecated user billing table is introduced.
- `auth.cjs` verifies RS256 JWT signatures using server-pinned keys, issuer and audience, checks time claims, and hashes issuer plus subject. Token-supplied role/org claims are ignored. Membership is read from PostgreSQL. Unknown algorithms, token-provided key URLs, invalid signatures and expired tokens fail closed. The current verifier intentionally accepts at most one-hour tokens and requires RSA keys of at least 2048 bits. Configuring trusted keys and rotation remains an operator responsibility.
- `service.cjs` exposes backend methods for create, list, pause/disconnect/recheck and campaign binding. It is not mounted to a public HTTP route. Its query adapter must return the SQL `result` value; its credential catalog must come from a trusted onboarding bridge, never request JSON. Membership bootstrap is operator-only; there is no self-grant endpoint.
- New connections start pending and cannot send. Successful check results may only be persisted by the trusted connector. Private/team access and optimistic connection versions are checked in SQL as well as application code.
- Binding creates a new campaign version with sending disabled. The caller cannot choose another subject or copy a connection across organizations. Old approvals are not silently reused.
- Dispatch begin rechecks membership, private access, state, capabilities, health age, connection version, exact credential/mailbox and limits. It locks rows through the existing begin transaction. Pause/disconnect blocks subsequent begin attempts, including already queued work. A provider request already authorized and in flight cannot be recalled; uncertain attempts remain unretried.
- A managed credential cannot bypass the registry by omitting connection metadata. Existing unmanaged org1 sender configuration remains compatible. SMTP dispatch remains blocked pending its receipt/reply integration.
- The migration extends the latest begin definition from migration 028, preserving the current contact gate (including migration 031's uncertainty checks), quota locks, leases, approvals, hashes, schedule and mailbox capacity. A regression test compares the unchanged function body around the inserted gate.

Migration 035 is unapplied live. Test command: `node scripts/diagnostics/customer-strategy-scratch.cjs --review-gate --latest-email --dispatch --basic-policy --legacy-evidence --sender-connections`. Tests cover membership/privacy, credential metadata, wrong identity, version conflicts, disabled campaign binding, stale health, disconnect, stale check completion, legacy compatibility, and actual begin denial for a paused sender/revoked member before a mock send. Scratch role grants are explicitly fixture grants, not proof of deployed permissions. Changes roll back.

Remaining integration: configure the actual identity provider and credential onboarding bridge; mount the service behind authenticated customer APIs; securely provision Gmail OAuth connections; implement SMTP receipts, message threading and IMAP event persistence; deploy and verify with real accounts only when authorized. Mocked identity/provider results do not prove live compatibility.

## Implemented and tested

- One org_id-based connection contract for personal and team workspaces. Personal workspace creation itself is not implemented.
- Private/team access decisions using a trusted backend principal; owner/admin management; credential ownership and credential-type checks against a trusted catalog.
- Pending check, ready, reconnect-required, disabled and disconnected states; version checks; 24-hour health expiry. A pause/disconnect clears in-memory capabilities but cannot yet revoke an already imported workflow: persistent registry and execution-time checks are required.
- Credential references only. Unknown fields such as passwords are rejected. No plaintext credential persistence is added.
- Campaign patch produces a disabled sender policy. It never approves a plan or enables sending.
- Gmail package builder copies existing email/reply graphs, substitutes the org-owned fixed credential and embedded credential checks, removes original workflow IDs/pinned data/static data, retains sticky notes and schedules, and keeps output inactive. Existing bounded canary limits, plan/hash/recipient scope and release expiry remain unchanged.
- Mockable SMTP/IMAP connection checker: vetted public IPv4 destinations, pinned destination with TLS hostname checking, SMTP 465/587, IMAP 993, read-only inbox access, no message sending, redacted errors and cleanup. IPv6-only hosts are conservatively unsupported. Dependency adapters, DNS timeout supervision and installed library compatibility need integration verification.

SMTP authentication plus inbox access does not prove permission to send from the selected address or correct reply matching. This checker explicitly leaves sending and reply readiness false. SMTP cannot enter the Gmail package builder.

## Files and tests

`scripts/sender-connections/connections.cjs`, `gmail-package.cjs`, `smtp-check.cjs` and `tests/organization-policy/sender-connections.test.cjs`.

Run `node --test tests/organization-policy/sender-connections.test.cjs tests/lead-strategy/email-rollout.test.cjs`. Tests exercise cross-org denial, private/team access, credential types, stale health, lifecycle versions, disabled campaign policy, actual generated Gmail Code-node gates, graph/note preservation, unsafe endpoints, mock connection checks and no-send behavior.

## Boundary that requires a design extension

The repository has no implemented trusted customer membership boundary for this integration. React localStorage data is not authenticated membership. Do not pass webhook body values as principal, catalog or successful check results. No endpoint is exposed by these modules.

The existing organizations schema has no sender registry JSON column. Campaign version JSON is not a suitable authoritative shared connection registry: pausing a sender there would not necessarily revoke other campaigns using the same connection. A copied inactive workflow is also not a live revocation mechanism.

Proposed next extension for review: organization-owned sender connection storage (credential references, owner subject, visibility, capabilities, health and version), membership mapping to the chosen authenticated identity provider, and a current-connection check inside the existing begin/dispatch transaction. Keep credentials in n8n-managed credential storage or an approved vault; do not invent a user-owned credential/billing table. This requires resolving the earlier no-new-tables/schema boundary before implementation.

Then add the customer connection API/OAuth lifecycle, trusted credential bridge, and SMTP-specific receipts/threading/IMAP reply matching. Existing SQL receipt validation expects Gmail hex IDs and Gmail event references; do not fake SMTP acceptance by converting IDs to Gmail-shaped hashes. Preserve original Message-ID, provider context and reconciliation semantics with an explicit protocol extension.

UNVERIFIED / incomplete: durable registry, actual authentication, Gmail OAuth onboarding, connection revocation against deployed jobs, credential bridge, SMTP sending/receipt persistence, IMAP reply/bounce processing, provider-specific sender aliases, live provider compatibility and live end-to-end delivery. Existing live org1 configuration is untouched.

## Documentation checked

- [Nodemailer SMTP](https://nodemailer.com/smtp): verify checks authentication/connectivity without sending and cannot establish arbitrary From-address acceptance; TLS/IP hostname configuration.
- [ImapFlow client](https://imapflow.com/docs/api/imapflow-client/): connect, read-only mailbox lock and logout. Installed dependency versions remain unverified.
