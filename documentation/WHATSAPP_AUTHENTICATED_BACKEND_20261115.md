# WhatsApp authenticated backend — 15 November 2026

The local dashboard gateway now connects the installed WhatsApp registry/inbox
functions to its existing Firebase Admin identity and organization memberships.
There are no frontend changes, new tables, migrations or provider requests.

Authenticated GET routes:

- `/dashboard-api/api/whatsapp-status?org_id=...`
- `/dashboard-api/api/whatsapp-senders?org_id=...`
- `/dashboard-api/api/whatsapp-inbox?org_id=...&limit=...&before_id=...`

Authenticated same-origin JSON POST routes:

- `/dashboard-api/whatsapp/sender/manage`: `org_id`, `connection_id`,
  `expected_version`, `action` (`pause`, `disconnect`, `recheck`).
- `/dashboard-api/whatsapp/inbox/review`: `org_id`, `activity_id`,
  `expected_revision`, `action` (`acknowledge`, `archive`, `redact`), `request_id`.

Only the verified Firebase principal supplies the subject. Existing SQL rechecks
membership, ownership, admin role and revisions during writes. The adapter checks
receipts before reporting success; unknown writes are not retried. Inbox review
requires owner/admin membership and never clears STOP, creates consent or resumes
sending. Recheck only marks a sender pending; it does not contact Meta or prove
readiness. Sender state `ready` is exposed as `identity_checked`, not delivery proof.
Credential references, raw incoming metadata and audit internals are not returned.

The HTTP layer retains host, bearer, origin, JSON size, duplicate-query and request
capacity checks. Unknown write failures return `WHATSAPP_WRITE_UNCONFIRMED` without
private details. Twenty-eight focused adapter/HTTP checks passed. A read-only local
database probe confirmed installed functions and empty sender/inbox lists; it used
an injected principal and does not claim a new browser Firebase login acceptance.
Evidence: `.local/whatsapp-dashboard-20261115/read-adapter.json`.

Remaining: trusted Meta code exchange, token inspection, account/phone verification,
encrypted credential provisioning/catalog, sender checking and account-role-user
signup acceptance. Frontend SDK/button and comprehensive dashboard work are deferred
by the user. Customer signup and provider checks explicitly report unavailable.
No message test, old uncertain-send retry, body-retention policy or production
Meta review approval is implied by this backend slice.

## Signup connector implementation

The backend now also implements these fixed same-origin JSON POST routes:

- `/dashboard-api/whatsapp/signup/begin`: `org_id`.
- `/dashboard-api/whatsapp/signup/complete`: `org_id`, one-use `state`, `code`,
  `waba_id`, `phone_number_id`, `connection_id`, `sharing`.

The origin comes from the HTTP request, not browser JSON. Sender limits are fixed
server-side initially at ten messages/day and per rolling 24 hours, five minutes
apart. They are limits, not a campaign approval or credit allowance. The existing
five-minute session binds verified organization, principal and configuration and
is consumed before exchange; uncertain exchange is not repeated automatically.
Team registration requires owner/admin membership before provider access.

`scripts/whatsapp/signup-provider.cjs` implements bounded Meta code exchange,
app-authenticated token inspection and account/phone listing. Destination/method/
query checks permit only the three signup endpoints, with existing public-IP/TLS
network protection and no message route. Token scope, app, expiry and selected
phone are checked before storage. Errors never return provider bodies or tokens.

`scripts/dashboard/whatsapp-signup-storage.cjs` encrypts tokens with the existing
n8n cipher over stdin. Credential storage, n8n project ownership and SQL pending
sender registration commit in one transaction. Active membership is rechecked;
neither identity readiness, sending capability nor workflow activation is claimed.
Uncertain registration cannot be repeated with the same pending credential, and
quarantine disables a possibly committed sender while retaining encrypted material
for reconciliation. No new credential catalog table or metadata file is needed.

The local gateway reads optional private setup only from
`.local/whatsapp-embedded-signup/config.private.json` (ignored by git). Required
server settings are `enabled`, `embedded_signup_version:4`, `app_id`, `app_secret`,
`configuration_id`, explicit `api_version`, canonical `https_origin` and future
`credential_rotation_deadline`. No private setup file was created or existing app
settings changed. Explicit server allowed origins must include that HTTPS origin;
the current HTTP-only local gateway therefore keeps signup disabled. Do not add a
wildcard origin or move secrets into React to enable it.

Meta's current implementation guide requires v4 and HTTPS. Its old configuration
ID from screenshots is not assumed to be v4-compatible. Confirm its configuration,
app roles/access and callback setup when doing real Meta acceptance. Reference:
[Meta Embedded Signup implementation](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation).

Focused provider/session/storage/HTTP tests passed. A real n8n-encryption plus
registry/project-storage probe passed using an inert token, with all database
changes rolled back. Evidence:
`.local/whatsapp-dashboard-20261115/signup-storage-scratch.json`. This is not a
successful real Meta exchange, subscription, number registration or signup. Shared
durable sessions and recovery after process restart remain deployment work; the
current bounded in-memory sessions serve a single local process only.

## Connected-account identity check

Organization-owned WhatsApp Business accounts/numbers are explicitly in scope.
The authenticated POST `/dashboard-api/whatsapp/sender/check` accepts only
`org_id`, `connection_id`, `expected_version`. The installed SQL check-input function
checks active org/membership, ownership, pending state, expiry and registry version
before the backend reads encrypted credentials. The n8n project association must
also match. Per-connection concurrency is bounded in the local process.

`scripts/dashboard/whatsapp-check.cjs` decrypts the credential inside n8n and makes
only the existing bounded Meta phone-number GET. Tokens are passed neither in
process arguments nor output; only the identity-check result returns. Membership
and sender access are checked again under transaction locks before persisting the
version-bound observation. Revoked membership, mismatched account, changed version
or malformed receipt cannot report success. Readiness remains separate from
message/template approval and delivery: both send/reply capabilities stay false,
and the public state is `identity_checked`, not "sending verified".

Fifty-seven focused checks passed. An actual SQL probe registered an encrypted
fixture, persisted a **mocked** account observation, verified false capabilities,
and rolled everything back. A wrong-account encrypted credential was rejected
inside n8n before any Meta request. Evidence:
`.local/whatsapp-dashboard-20261115/account-check-scratch.json`.
There are still no registered real WhatsApp senders in this workspace, and no real
customer signup or provider identity check was claimed. No checker schedule,
messaging workflow, paid request or dashboard component was enabled.
