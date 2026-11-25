# Customer SMTP enrollment — 9 November 2026

The authenticated local dashboard now accepts SMTP and IMAP credential enrollment
in Settings. This is account storage, not a successful connection check, permission
to send, or general self-service SMTP completion.

- Firebase membership determines the organization and owner. Members may create
  private accounts; team visibility requires owner/admin. Client-supplied owners,
  credential IDs, TLS bypasses and limits are rejected.
- Both protocols use the selected canonical email address as username. SMTP uses
  465 or 587; IMAP uses TLS on 993. Aliases and service-account usernames remain
  unsupported. The existing connection adapter checks public DNS/IP destinations
  and strict TLS when authentication is actually attempted.
- The existing n8n Cipher bridge encrypts credentials in memory. Two credentials,
  project ownership and the registry entry save in one database transaction.
  Plaintext passwords are not written to SQL, local files, logs or browser storage.
- New senders are `pending_check`, with sending/reply capabilities false and the
  existing initial 10/day, 10/rolling-day, 300-second limits. No campaign changes.
- The request nonce is the org-scoped connection ID. A repeated request checks
  the owner and mailbox and returns the existing entry without replacing secrets.
  An uncertain save is not automatically replayed; the UI refreshes saved
  connections to reconcile the nonce. Password fields clear on submission.

The local HTTP route is `/dashboard-api/smtp/connect`, using the existing
same-origin, bearer-authenticated gateway; it is not a new n8n webhook. No schema
migration, model request, Apify run, provider login or email send was performed.

Verification: 4 service tests and the relevant HTTP checks passed (19 total in
the focused backend run); 2 new form tests and 2 existing Settings tests passed.
The isolated scratch database verified atomic persistence, no duplicate credential
creation on replay, false capabilities and rollback after a partial storage
failure. All scratch mutations rolled back; encryption there was mocked.
Evidence: `.local/smtp-onboarding-20261109/result.json`.
Production build: `main.4736d483.js`.

## Per-account workflow provisioning

Enrollment and authenticated recheck now invoke the local n8n API provisioner.
It reads credential references from the org-owned registry, never dashboard input.
It verifies current membership/private access, matching credential project and
installed checker/runtime hashes, then uses the existing SMTP templates.

Three account-bound workflows are created: send, poll and check. New send/poll
workflows remain inactive with a null send release. Only the pending account's
connection checker may activate. Existing active send/poll workflows are never
activated, deactivated or rewritten by this helper. Existing sticky notes remain;
an additional note explains the customer enrollment boundary.

The checker already uses a per-account advisory lock and only logs in while the
registry state is pending. Failed checks move to reconnect-required; ready or
disabled accounts cause no repeated provider authentication. Its SQL update is
version-fenced. Recheck clears capabilities through the existing registry action
before the helper reconciles account workflows. Campaign binding/release rules
and the 24-hour health window are unchanged.

Durable journals under `.local/smtp-provisioning/` record only operation phases,
workflow IDs and names. A lost POST response is reconciled by exact-name lookup,
graph/binding/project checks and a GET; uncertain creates/activation are not
blindly replayed. A stored account with failed workflow setup stays saved and
pending, and the dashboard asks for administrator review rather than replacement
credentials. Multi-instance/shared-journal deployment is UNVERIFIED.

Verification: 13 focused provisioning/enrollment/sender lifecycle tests passed.
The changed form tests and existing sender actions passed; the latest production
build is `main.5cb2923a.js`. Scratch SQL additionally checked the real owner/project
lookup and denied another org/member's private sender; all mutations rolled back.
Read-only local checks confirmed matching installed runtime files, the API user's
default project matches the credential template project, the base workflow is
readable and its database credential binding exists. No actual customer workflow
was created/activated during this development pass and no provider was contacted.

UNVERIFIED: real API creation/activation for a newly enrolled customer, actual
SMTP/IMAP authentication, browser visual QA, delivery and a live campaign. The
provisioner is wired locally; these checks do not claim real-provider acceptance.
## Password replacement and reconnect

Customer-enrolled SMTP account cards now offer explicit password replacement.
The private owner may replace their own passwords; team accounts also allow an
active organization owner/admin. Administrators can manage availability of another
member's private account but cannot replace that member's passwords through this
API. Operator-managed legacy connections are outside this self-service action.

Replacement keeps the same mailbox, host/port/TLS settings and credential IDs.
It changes only both encrypted passwords, then clears capabilities/health,
increments the registry version and requests a fresh connection check, atomically.
Stored credential decryption and re-encryption happen inside n8n; its encryption
key and decrypted old credentials are not exported to the host. The installed
n8n credential helper was inspected and reads current credential data by ID for
each operation. In-flight work cannot be recalled. Existing reply history,
Message-IDs, checkpoints, sender limits and campaigns are not rewritten.

The unchanged old campaign binding remains invalid after replacement/checking.
The customer must re-select the sender and review new plans before sending can
resume. This action never switches a campaign automatically or issues a release.
Expected-version and explicit acknowledgement checks are mandatory. A repeated
old-version request is rejected; an uncertain outcome is not automatically retried.
The browser stores only the prior version, clears password fields, and describes
a later version change without claiming that a particular replacement succeeded.

Enrollment and replacement reject expression-prefixed credential strings. The
installed n8n expression helper interprets strings starting with `=` as executable
expressions; user-entered credentials must remain literal values.

Verification: focused backend/HTTP checks passed (24 cases), plus the replacement
form and existing Settings checks (5). Scratch checks verified rollback after
the second password update fails, unchanged IDs/limits/campaign configuration,
cleared readiness, stale-version/private-owner denial, and the old binding staying
blocked even after a simulated successful check. All fixture changes rolled back.
The actual installed Cipher also passed a dummy-data roundtrip using an ephemeral
test key, with no real credentials read and no provider call.
The local gateway is reloaded with this feature; current build is
`main.5c21f905.js`. No actual account credentials were replaced during development.

UNVERIFIED: real account password replacement/authentication and browser visual
QA. Provider/account changes require separate enrollment. Ambiguous transactions
without a later version change, and uncertain enrollment with no registry entry,
still require operator reconciliation. No campaign release is allocated by
enrollment, provisioning, replacement or rechecking.
