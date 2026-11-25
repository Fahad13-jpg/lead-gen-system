# Restart-safe Gmail setup

Implemented locally on 17 November 2026 with migration 070. Existing senders,
campaign approvals, schedules and sending limits are unchanged.

## Behavior

- Google state, nonce, PKCE verifier and callback code are stored with AES-256-GCM
  encryption. Each ciphertext is authenticated to the hashed OAuth state. The
  database stores the state hash, never the raw browser state.
- Authorization expires after five minutes. Callback capture is atomic and accepts
  only the first valid response. Organization, authenticated subject, OAuth client
  and redirect URI are checked before consuming the session.
- The database claims a code once, before token exchange, then removes its encrypted
  secrets. A gateway restart or elapsed TTL cannot make that claim retryable.
- Successful completion receipts survive restarts. A lost receipt can also be
  reconciled from the operation-bound enrollment journal and matching sender
  credential/version. Recovery never exchanges the Google code again.
- Credential creation and its ownership journal are one transaction. Sender
  registration and its continuation receipt are one transaction. Reconnect journal
  updates share the credential rotation transaction. Capability checks remain
  version-fenced and never authorize execution.
- Definite reconnect identity/version failures permit explicit fresh consent.
  Unknown exchange or storage outcomes remain locked for operator reconciliation.
  Recovery does not automatically restart an enrollment.

## Storage and operation

Tables: `gmail_oauth_sessions` and `gmail_enrollment_journal`. PUBLIC has no table
permissions. Gateway startup requires access to both tables and the encryption key;
it does not fall back to process-local sessions if durable setup is unavailable.
The in-memory adapters remain only for existing offline tests and injected callers.

The local key is `.local/gmail-onboarding/state.key`, outside source control, with
Windows access restricted to the operator and SYSTEM. Preserve this key in secure
deployment secret storage and encrypted recovery backups. Do not regenerate it
during routine restart. Previously issued process-local authorizations cannot be
recovered retroactively; existing connected Gmail senders remain valid.

Expired unclaimed secrets are cleared on new admissions. Completed/retired session
rows older than seven days are pruned on admission. Unknown claimed operations and
enrollment ownership records are retained for reconciliation rather than expiring
into retry permission. At most 100 active/uncertain authorizations are admitted.

Migration backup: `.local/gmail-durable-20261117/lead-before-*.dump`.
For rollback, stop onboarding first and preserve both tables and the key. Do not
delete claimed operations or restore older state while onboarding is in progress.
Rolling back to process-local onboarding discards restart protection; prefer a
forward fix with onboarding unavailable until storage is healthy.

## Verification

Existing Gmail orchestration/bridge/reconnect checks: 26 passed. New focused checks
cover encryption tampering, completed receipts, unknown outcomes and missing state.
Real PostgreSQL integration checks used fake OAuth data in an isolated scratch
schema: migration, restart before callback, owner isolation, competing claims,
expired claim lock, duplicate reconnect, no exchange replay, lost-receipt recovery,
credential handoff across bridge reconstruction, and atomic orphan rollback.
The scratch schema was removed after verification. No real Google authorization,
provider job or email was used.
