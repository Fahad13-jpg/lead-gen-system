# Apify connection save recovery — 17 November 2026

New dashboard Apify connection attempts obtain a signed recovery reference before
the connection write. If the save response is lost, the UI performs a read-only
comparison with the saved organization key. A pending reference is also checked
once when Settings is reopened in the same browser session. The connection POST
and provider verification are never automatically repeated.

## Boundaries

- The reference contains a SHA-256 key fingerprint, organization, authenticated
  subject, random nonce and 24-hour expiry. It does not contain the API key.
  It is signed, not encrypted; it is not an authentication credential. Every use
  still requires current owner/admin membership and exact subject/org matching.
- HMAC signing uses a domain-separated key derived from the existing private
  gathering transport key. Signatures survive gateway restarts. Rotating that key
  invalidates outstanding references safely; multi-instance deployment must use
  consistent private key material and synchronized clocks.
- The browser stores the reference before submitting the key. Storage failure or
  preparation failure prevents the connection POST. It stores no API key. Workspace
  changes during preparation stop the old form; the signed key/org binding also
  prevents a delayed request being applied to a different workspace or key.
- Reconciliation reads only the current BYOK row for the authorized organization
  and compares fingerprints inside SQL. It returns no provider account ID, key or
  fingerprint. A missing/different key, failed lookup or invalid/expired reference
  cannot claim that the submitted key was saved.
- A match proves only that the submitted key is currently saved. It does not
  prove the earlier request's completion, a fresh provider check, current provider
  balance or permission to send. The response explicitly returns
  `provider_verification_confirmed:false`, `execution_authorized:false` and
  `automatic_retry_allowed:false`. A disabled account remains disabled.
- A different key saved later does not match an old reference. Recovery does not
  write accounts, release reservations, resume searches or change spending limits.
- Legacy pending browser markers contain no fingerprint-bound proof and cannot be
  retroactively confirmed by this mechanism. Their explicit review/replacement
  path is retained. New signed pending requests remain blocked pending recovery or
  administrator review, rather than encouraging another key submission.

## API additions

- `POST /dashboard-api/apify/prepare`: validate membership and prepare a reference;
  no provider request or database write.
- `POST /dashboard-api/apify/reconcile`: authenticate, verify the reference and read
  saved state only. Safe to repeat as a read; never resubmits a connection.
- Existing `POST /dashboard-api/apify/connect` accepts optional `recovery_token`.
  When supplied, it must match the exact subject/org/key before the existing
  secure-workflow preflight or provider transport is called. Legacy callers remain
  compatible. Normal provider/account/settlement guards are unchanged.

All routes retain bearer, exact-origin, JSON, body/rate limits and error redaction.
Unknown recovery errors are reported as unavailable, not as a failed connection.

## Verification

Fifty-four backend/HTTP/gathering checks passed, including six focused recovery
tests. Seven UI cases passed: lost response, reload, no repeated POST, preparation
failure, workspace change, member denial and legacy handling. Local verification
used a read-only pool: exact stored fingerprint matched, a synthetic different key
did not, and a re-instantiated signer verified the reference. No raw stored key was
retrieved, provider request made, connection changed or paid run started.

Evidence is under ignored `.local/apify-recovery-20261117/`. This is a focused
functional recovery change; broad dashboard redesign remains deferred. Durable
Gmail new-enrollment reconciliation is a different problem and is not claimed as
completed by this mechanism.
