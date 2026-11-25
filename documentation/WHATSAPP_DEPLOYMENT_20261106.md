# WhatsApp deployment — 6 November 2026

User authorized deployment, Meta onboarding work and the owned-recipient live test. Deployment completed; onboarding and live delivery remain incomplete for the reasons below.

## Installed and verified

- Applied migrations 047–051 in one transaction against local Docker PostgreSQL `lead_db`, role `n8n_user`. Audited the actual 035/036 registry prerequisites before applying.
- Full custom-format backup verified with `pg_restore --list`, plus previous custom runtime and function definitions, stored privately under `.local/whatsapp-deployment-051-20261106`.
- Copied reviewed WhatsApp runtime, private inbox/sender services and custom-node description. File hashes verified. Reused existing workflow IDs; no workflow import, graph rewrite or campaign configuration change.
- Restarted n8n only after its active execution finished. Health endpoint returned 200. Twenty-five WhatsApp/registry function records have the expected owner and execute privilege.
- Verified original workflow records, campaign versions, plans, approvals, existing sender data, organizations and AI trial ledger match their pre-deployment hashes (the new empty metadata column is excluded only from the existing sender-row comparison).
- Dispatch workflow remains inactive with `dispatchEnabled=false`. Provider rechecks default false. Existing separately authorized callback activation is preserved. No customer sender records were created.
- Live read-only smoke checks reject invalid plans, unauthenticated inbox access and invalid metadata. Installed disabled custom node returns `whatsapp_dispatch_disabled` without credential/SQL/provider access; private sender service loads successfully.

The first runtime directory copy exposed Windows Docker path normalization; it was corrected with individual reviewed-file copies. The newly created duplicate directory was removed only after checking the pre-deployment backup and its fixed resolved path. Final file hashes pass. A running-execution guard also paused the restart until idle. Deployment progress and verification JSON record the completed state; migrations were not reapplied during recovery.

## Callback checks

Local restricted proxy and existing public ngrok endpoint passed verification challenge (200), hidden editor root (404), unsigned rejection (401), and a self-generated signed empty batch (200). These prove endpoint/security plumbing, not a real Meta incoming message or delivery receipt. The temporary HTTPS tunnel remains a development dependency.

## Onboarding and live-test blockers

- User does not yet have an Embedded Signup configuration ID and requested guidance. Provided navigation through the existing Meta app: Facebook Login for Business → Configurations → Create configuration → WhatsApp Embedded Signup. Actual app/configuration/permission screens and Tech Provider readiness remain UNVERIFIED until reviewed. No Meta configuration was invented or automatically changed.
- Real customer management remains unexposed because dashboard identity and the trusted credential provisioning/catalog bridge are not configured. Deployment of private service files does not implement a public authenticated signup flow.
- Two bounded read-only account checks using the saved credential timed out (approximately 10.8 and 13.1 seconds). Credential ciphertext remained unchanged. Neither result establishes a token or permissions error. Latest account match and exact test-template approval remain UNVERIFIED; previous status was PENDING.
- No message POST, campaign release, consent/quote creation, test-plan approval or message reservation was attempted. The previously approved single exact integration message is still unsent. Do not send follow-ups or treat this permission as general campaign consent. Token expiry and account-specific quote/readiness must also be established before sending through the normal gates.

## Rollback

The SQL transaction would roll back on migration failure. Post-commit rollback needs a reviewed reverse migration using the saved definitions/runtime; do not restore the full database over newer work or delete inbound/sender records. Keep sending disabled. Private `ROLLBACK.md`, backup, applied SQL and progress/verification files are retained. This deployment made no cloud-hosting, firewall, Docker networking or proxy-setting change.
