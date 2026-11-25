# Sender connection release — 24 October 2026

**Superseded checkpoint, 25 October:** the SMTP runtime integration, MIME bounce handling and inactive workflows have now been implemented and migration 036 deployed locally. See `SMTP_INTEGRATION.md` and `strategy-contract-v2/smtp-036-deployment.json`. The remaining sections describe the earlier 035 checkpoint, not the current implementation. Sender credentials and the deferred customer login provider still require configuration; no real SMTP send was tested.

## Deployment status

Migration 035 was applied to local `postgres_db / lead_db` after a custom-format backup and isolated scratch tests. The post-apply check compared all five installed function bodies with the migration and confirmed preservation of contacts, campaign rows, plan counts, activities, workflows and AI-request count. No memberships or sender connections were created. No workflow was imported or activated and no email was sent.

Evidence: `strategy-contract-v2/sender-035-deployment.json`. Private backup, baseline and rollback script: `.local/sender-registry-035/`. Rollback removes the new registry tables: inspect/export any subsequently created connections before using it. The rollback is not a routine disconnect operation.

## What is implemented

- Organization-owned sender registry with private/team visibility, current membership checks, versioned changes, limits, readiness expiry, pause and disconnect.
- Backend service interfaces that verify a pinned RS256 identity, resolve membership server-side and accept only credential references from an operator-controlled organization catalog. No public endpoint is mounted.
- Gmail workflow package builder that binds the selected managed OAuth credential while preserving the workflow graph. Packages remain inactive.
- SMTP/IMAP TLS connection-check adapter, deterministic SMTP Message-ID and follow-up headers, conservative SMTP acceptance handling, and inbox/thread-bound reply and opt-out matching.
- Bounded read-only IMAP polling: at most 100 UID positions per scan, 1 MiB per MIME message and 5 MiB total. Partial fetches, parse errors or UIDVALIDITY changes do not advance the cursor. Events and checkpoint are submitted together for atomic persistence.

## Local candidate, not deployed

Migration 036 implements native SMTP receipt persistence and IMAP reply/opt-out/bounce event persistence. It was exercised in the isolated scratch database as a non-superuser, using synthetic activities. It is **not applied live**. The initial JSON-null checkpoint comparison was corrected.

The registry still explicitly rejects SMTP execution with `smtp_execution_not_integrated`. Do not remove that gate just because the adapter tests pass.

## Connection setup boundary

For now, operators create Gmail OAuth, SMTP and IMAP credentials in n8n's credential UI. Secrets must remain in encrypted n8n credentials; do not put passwords, refresh tokens or client secrets in campaigns, registry metadata or workflow JSON. OAuth authorization is n8n-managed; the local package builder does not implement a new OAuth server.

Before customer self-service can be exposed, configure the actual Flutter identity provider and trusted membership/credential catalog. A dashboard-provided `org_id`, role or credential ID is not proof of ownership. The login provider remains user-deferred.

## Still required before SMTP is complete

1. Credential-bound production adapter: resolve credentials through n8n's supported credential mechanism, wire actual SMTP send and read-only IMAP clients, capture an inbox cursor before sending, and persist the attempt/message ID atomically under the existing begin gates.
2. MIME delivery-status/bounce extraction and conservative classification. SQL accepts normalized bounce events but the poller does not yet extract DSNs.
3. Sender-address authority verification; successful SMTP login alone does not prove permission to use an arbitrary From address.
4. Build/import the inactive SMTP workflow package and deploy migration 036 only with its tested runtime integration. Keep existing approval, limits and ambiguity handling.

UNVERIFIED: actual third-party SMTP delivery, SMTP follow-up threading, IMAP provider compatibility, bounce extraction, sender aliases and customer login integration. Real email tests were deliberately skipped at the user's request.

## Tests executed

- 27 Node tests passed across sender-connections, sender-auth, smtp-adapter and imap-poll suites.
- Scratch chain passed: optional verification, legacy evidence, registry permissions/privacy/version/health checks, campaign approval/reservation/begin, SMTP receipt identity and replay, IMAP atomic reply stop/cursor, stale scan rejection, epoch mismatch, malformed arrays, and existing Gmail follow-up delay/reply-stop checks.
- Scratch database: `scratch_email_release_20261019`, container `lead_diag_pg_20261011`, network `none`; all changes rolled back.
- No provider calls, email sends or AI ledger extensions occurred during these tests.
