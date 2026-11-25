# Organization-owned WhatsApp sender registry

Status: local implementation and scratch verification only. Migration 051 is unapplied. No credentials were created/exported, no real provider check occurred, and no workflow was imported or activated.

Deployment update: 051 and its private services were subsequently installed with user approval; no customer sender was registered and no public management route was exposed. See `WHATSAPP_DEPLOYMENT_20261106.md`. The setup and UNVERIFIED provider/authentication requirements below still apply.

## Targeted schema extension

Migration `051_whatsapp_sender_registry.sql` reuses `sender_connections` and `org_sender_memberships`. It adds one `channel_metadata` JSON column and allows provider `whatsapp`. WhatsApp records require a null email and inbox credential, valid WABA/phone/API identifiers, a finite credential expiry and an identity-verification flag. Gmail/SMTP still require valid email and their original inbox-credential rules; their metadata stays empty. A partial unique index prevents one Meta Phone Number ID being registered to two connections, including disconnected records. Transfer/reassignment needs a separate reviewed procedure; disconnect does not free ownership automatically.

Metadata contains references/identifiers, not access tokens, passwords, authorization codes or app secrets. Existing globally unique credential references remain organization-owned. No new tables, webhooks or billing structures were introduced. Customer plan/budget allowances are not raised.

After a successful trusted identity check, an internal `inbound_verified` flag preserves the known incoming route independently of sending state. Registered senders are authoritative for incoming org routing, even before campaign binding. Pending/unverified registrations cannot route messages. Pausing, disconnecting or a later failed health check must not discard signed incoming STOP events for a previously verified sender. Callback-supplied org values remain ignored; legacy campaign routing is used only for unregistered phone-number IDs.

## Private backend flow

`scripts/whatsapp/sender-service.cjs` uses the existing pinned RS256 verifier and database membership mapping. It is not mounted to an HTTP route. `credentialCatalog(org_id)` must be supplied by the trusted credential-onboarding bridge. Catalog entries must match org, active `whatsAppApi` credential reference, WABA and an explicit future credential expiry. A client cannot supply its own expiry, owner, readiness or token. Choosing a credential name or claiming an org in a JWT is not ownership proof.

1. `create`: validates requested sender/limits and trusted catalog, then creates a pending registry record. Team sharing requires owner/admin; ordinary members may register their own private sender.
2. `check`: SQL supplies the version-bound descriptor only to its owner/admin. The trusted connector uses the existing fixed account `/phone_numbers` check. Completion is persisted with a version check. A mismatched/stale result cannot verify a sender. The public result is `identity_checked`, never permission to send. The database's generic `ready` state is accompanied by false email send/reply capabilities and a WhatsApp-only identity flag.
3. `bind`: creates a new campaign version with WhatsApp sending and release disabled, constrained daily/spacing limits, and an exact registry/version/member reference. It invalidates previous account template snapshots and quote verification. Original campaigns/plans remain unchanged. Fresh account-specific template/pricing evidence and normal hash approval are required afterward.
4. `pause`, `disconnect`, `recheck`: use optimistic versions, clear readiness and run under the same WhatsApp advisory lock as dispatch claims. Generic shared lifecycle calls route through this path. Disconnect is local revocation, not a claim that Meta has revoked the access token. Reconnecting needs a fresh successful check and newly bound/approved campaign version.
5. At dispatch, the existing full gate additionally checks current registry state/version, active member/private access, exact account/sender/reference/expiry, registered daily/spacing caps and a rolling 24-hour sender cap. Removing the registry reference cannot turn a managed sender into an unmanaged one. Pausing disconnecting or revoking membership blocks future begin calls; an already authorized request in flight cannot be recalled or blindly retried.

WhatsApp API input limits are `daily_messages`, `rolling_24h_messages` (1–1000), and `min_interval_seconds` (1–99999). Existing neutral storage columns `daily_limit`, `mailbox_rolling_limit` and `min_interval_seconds` hold them; Gmail/SMTP meanings stay unchanged. Existing org-wide campaign daily/monthly/spacing gates continue applying, so registration cannot create a new budget allowance.

## Verification

Offline WhatsApp tests include registry validation, trusted catalog ownership/expiry, secret-field rejection, private/team controls, signed identities and a mocked private connector check. Existing sender-auth/connection tests also pass.

`node scripts/diagnostics/whatsapp-scratch.cjs --registry` restores the existing 035/036 definitions only in the network-none scratch transaction, applies 046–051, runs the complete chain and rolls back. It verifies duplicate sender/cross-org denial, private access, failed/stale checks, lifecycle versions, disabled new campaign binding, template/pricing reset, unchanged old campaign/plan bodies, rolling limits, and actual begin denial after membership revocation/pause/disconnect. Gmail/SMTP registration and required-email constraints are tested; their gate/begin function definitions are unchanged by 051. No provider request or send is made.

## Remaining integration / UNVERIFIED

- Real dashboard issuer/audience/keys and membership bootstrap remain deferred; demo local login must not expose these methods.
- The real credential catalog/provisioning bridge and Meta Embedded Signup app configuration are not supplied by this registry extension. The trusted HTTP port must resolve the requested org/reference privately and enforce the documented response bounds; its live behavior is UNVERIFIED.
- Real Meta identity checks, token lifetime, permissions and sender eligibility remain UNVERIFIED for newly registered customer senders. Credential rotation/ownership transfer is not automated.
- Live 035/036 constraint names, deployed grants and migration compatibility require a read-only pre-deployment audit. Scratch verification is not that audit. Review/apply 051 and install the private service/runtime only with separate approval; no frontend or public API deployment is included.
