# WhatsApp release status — 2026-11-06

This is the current checkpoint; older foundation/deployment notes describe earlier slices. No changes in this checkpoint were deployed. No model, Apify or messaging API calls were made.

**Deployment update:** the user subsequently authorized installation. Migrations 047–051 and the reviewed runtime are now installed on local Docker, with dispatch inactive and provider rechecks off. Backups, file hashes, preserved business/workflow state, permissions and health checks passed. Two read-only Meta checks timed out; no message was sent. See `WHATSAPP_DEPLOYMENT_20261106.md` for current deployment evidence and remaining onboarding/test blockers. The earlier local-only sections below are retained as release history.

## Implemented locally and tested

- Organization-bound Meta template drafts with exact rendered content covered by normal strategy hash approval.
- Separate approved templates for WhatsApp follow-up steps; actual previous-confirmed-send timing, working windows, consent, suppression, shared daily/monthly limits, spacing, leases and uncertainty handling.
- Incoming storage without fabricated leads/plans; signed callback validation, duplicate/conflicting replay handling, atomic batches, persistent phone opt-outs and a review hold on other incoming conversations.
- Fresh sender/template observations separate from immutable approved plans. Exact same-content rechecks preserve plan/campaign hashes and fingerprints. Changed/rejected/expired evidence blocks. GET responses are bounded; failures back off 30 minutes; provider rechecks default off.
- Private authenticated inbox service using the existing pinned-JWT verifier and existing database membership mapping. Organization membership is checked in SQL; admins alone can acknowledge, archive and redact. These actions never resume outreach or remove STOP.
- Explicit body-retention batches, maximum 100 messages/call; dry run by default. Bodies can be redacted while deduplication identity, minimum routing metadata and opt-out suppression remain. This is body redaction, not complete personal-data erasure. No cleanup schedule was activated or policy selected for customers.
- Local review package with inactive executor/check drafts, disabled send/recheck switches, dependency files, migration references and source hashes. No automatic installer or public management route.
- User-authorized registry extension in unapplied migration 051: organization-owned WhatsApp sender registration, private/team access, trusted version-bound identity checking, disabled new campaign binding, shared lifecycle revocation and dispatch-time registry/rolling-limit checks. See `WHATSAPP_SENDER_REGISTRY.md`.

The dispatch slice supports approved, opted-in Pakistan marketing-template recipients. US marketing-template recipients, mixed-channel follow-up predecessors, media/named-parameter templates and free-form service replies remain deliberately blocked; they are not silently substituted.

## Installed versus local

The recorded live baseline is migration 046 with the account-check and dispatch workflows inactive and the separately authorized callback active. Migrations 047–051 and the latest custom-node sources are **local/unapplied**. Live state has not been re-audited during this checkpoint. Do not infer deployment from generated workflow JSON or a passing mock.

## Release blockers / external setup

1. Review/apply migrations 047–051 and install the packaged runtime only after explicit approval. Existing 035/036 registry/membership storage is a prerequisite; audit its actual constraint/function definitions before 051. No new membership table is defined by this release.
2. Real Meta rechecks, template approval and the already approved single owned-recipient delivery/reply test remain **UNVERIFIED**. The earlier one-message permission does not authorize follow-ups or general campaigns. Actual consent, current quote, credential expiry, release and plan approval are still required.
3. React currently allows a demo login when its backend is unavailable. It must not authorize customer credential/inbox APIs. The real login issuer, audience, keys and membership bootstrap remain deferred. No public inbox/account-management endpoint has been exposed.
4. The targeted registry extension is now implemented locally in 051, with the user's authorization. Full customer-owned WhatsApp self-service onboarding still needs real authentication, a trusted credential provisioning/catalog bridge and Meta Embedded Signup configuration. No Embedded Signup session/token exchange or public management route was invented. Do not use callback verification as customer authentication.
5. A stable production HTTPS callback replaces the temporary tunnel when hosting is addressed. Cloud hosting remains deferred. Customer app review/Embedded Signup readiness and production tariffs/limits are **UNVERIFIED**.

## Verification / package

Offline: load `tests/whatsapp/*.test.cjs` in one Node process; no network ports are provided by the tests. Scratch: `node scripts/diagnostics/whatsapp-scratch.cjs --inbox` exercises 046–050 in network-none container `lead_diag_pg_20261011`, database `scratch_email_release_20261019`, and rolls back. The older backup reuses the existing 035 membership definition only as a transactional fixture. These tests are not a live permissions or Meta delivery audit.

Registry checkpoint: 101 WhatsApp offline tests plus 14 existing sender/auth regression tests passed. `node scripts/diagnostics/whatsapp-scratch.cjs --registry` additionally restores existing 035/036 definitions within the transaction and exercises 051, including actual begin denial for revoked members/paused/disconnected senders and unchanged Gmail/SMTP gate/begin definitions. All changes roll back; zero provider requests. Registry-based incoming routing before any campaign and retained STOP routing after pause/disconnect also pass.

Prepare a new local review directory with `node scripts/whatsapp/release.cjs .local/whatsapp-release-<unique-name>`. It copies source/dependencies only, keeps all drafts inactive and refuses an existing directory. The manifest lists prerequisites and blockers. Approved plan bodies, working workflow connections, notes and unrelated executor configuration remain unchanged by packaging.
