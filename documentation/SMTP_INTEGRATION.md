# Managed SMTP integration

## Local sender connected — 25 October 2026

Organization 1 now has private connection `fahad-gmail-smtp`, using the user-created `Fahad Gmail SMTP` and `Fahad Gmail IMAP` credentials for `mohmmadfahad53408@gmail.com`. All three inactive workflow copies are bound to these credentials. The owner is a local n8n project operator identity, explicitly separate from the still-deferred Flutter identity provider.

The final manual connection check completed successfully (CLI exit 0): SMTP authentication and read-only IMAP inbox access passed; registry state is `ready`, version 4. Evidence: `strategy-contract-v2/smtp-org1-check.json`. No emails were sent and the activity count was unchanged. Sending release remains null; schedules remain inactive and no campaign was enabled.

During onboarding, a readiness-save cleanup race was corrected by awaiting its database query before closing the client. A regression test covers this ordering. Subsequent IMAP connection timeouts were investigated with credential-free TLS probes from both Windows and Docker, all successful in under one second. The IMAP authentication allowance was increased from 10 to 20 seconds (matching the installed built-in n8n IMAP node), with a 35-second overall connection deadline. The next full connection check passed; this is not a long-term reliability or delivery claim. Safe error classes distinguish authentication rejection, connection timeout and authentication timeout without printing provider messages or credentials.

The SMTP route is additive. Gmail's workflow and sender gate are preserved. SMTP has its own begin and receipt functions, using the same approval, contact eligibility, suppression, schedule, reservation, organization quota and mailbox-capacity checks.

## Control flow

1. An operator selects n8n SMTP, IMAP and PostgreSQL credentials on the managed sender node. Passwords remain in n8n credentials.
2. The node reads the organization-owned registry entry and compares its SMTP/IMAP credential IDs with the node's actual bindings. Disabled/disconnected entries are blocked.
3. Connection check authenticates SMTP and opens INBOX read-only. The first release only accepts canonical mailboxes: SMTP and IMAP usernames must equal the registered sender address. Aliases and service-account usernames are unsupported.
4. Dispatch runs on a five-minute schedule. A null release blocks it. A configured release is limited to approved plan IDs, hashes, recipients, two steps per plan, and 24 hours. Initial limits remain at most 10/day, 10/rolling 24 hours and at least five minutes between messages.
5. Before dispatch, the worker captures the IMAP UIDVALIDITY/next UID. SQL commits the attempt, Message-ID, subject, references and initial cursor atomically before calling SMTP once.
6. A positive final SMTP response with the exact Message-ID and sole recipient records provider acceptance, not inbox delivery. Missing or uncertain receipts require reconciliation; they are never automatically resent.
7. The reply workflow polls every five minutes. MIME parsing matches mailbox, participants and original Message-ID. Replies and explicit opt-outs stop follow-ups. Permanent delivery-status reports require a matching returned Message-ID, recipient, failed action and 5.x status before recording a hard bounce.
8. SQL stores stop events and the IMAP checkpoint together. UIDVALIDITY changes, partial fetches and parsing failures do not advance the cursor. Batches still catching up do not mark reply checking fresh. Review flags remain set until handled explicitly.

## Workflow files

- `workflows/07e_smtp_email_executor.json`: scheduled dispatch, inactive, null release.
- `workflows/09a_imap_reply_detection.json`: scheduled inbox polling, inactive.
- `workflows/09b_sender_connection_check.json`: manual connection check; sends no email.

All use `CUSTOM.managedSender`, implemented by `scripts/sender-connections/n8n/ManagedSender.node.js`. Its runtime is packaged with a dependency manifest by `scripts/sender-connections/package.cjs`. Installed-library APIs were inspected on n8n 1.111.1. Node/library compatibility must be retested when upgrading n8n.

## Setup still needed per sender

- Supply SMTP/IMAP credentials through n8n's credential UI, not this chat or campaign JSON.
- Provision the trusted organization membership and credential catalog. Customer-facing login integration remains deferred until the Flutter identity provider is supplied; no public sender-management endpoint is exposed.
- Register the connection, attach its actual credentials to its workflow copies, and run the manual connection check.
- Bind a campaign using the registry service. Binding creates a disabled campaign policy; it does not authorize dispatch.
- Prepare a reviewed, bounded release for the correct organization and approved plan hashes. Do not reuse org1 Gmail's release or activate the unconfigured templates.

Connection health expires after 24 hours. Rechecking changes the registry version, so rebind the campaign and review its plan version before another release. Connecting a mailbox alone is never a sending authorization.

## Limits and verification

36 offline tests passed. Scratch PostgreSQL tested approval, sender/inbox mismatches, one-attempt semantics, native SMTP receipts, replay protection, reply stopping and cursor persistence. All scratch changes rolled back.

On 25 October, offline checks with n8n's actual installed libraries passed: real MIME opt-out and permanent-bounce parsing, temporary DSN rejection, Nodemailer thread headers, read-only IMAP adapter behavior and the custom node's closed-release guard. No provider connection or email send was performed.

UNVERIFIED: real customer SMTP/IMAP provider behavior and end-to-end delivery. Real email tests remain skipped as requested. Canonical username matching is a conservative restriction; it is not a claim that every SMTP provider enforces sender identity. Provider acceptance and inbox delivery are separate outcomes.

## Deployment and rollback

Deployment is performed by `scripts/diagnostics/deploy-smtp-036.cjs`. It requires idle n8n, validates the previous SQL definition, saves a database backup and rollback SQL, installs migration 036 and runtime files, imports inactive templates, then restarts n8n. It checks that existing campaigns, contacts, activity history, plans, workflows and AI-request count were preserved.

Consult `.local/smtp-deployment-036/progress.json` before retrying an interrupted deployment. Do not rerun blindly. The public completion evidence is `documentation/strategy-contract-v2/smtp-036-deployment.json` when verification succeeds.

Rollback: keep all three new workflows inactive; remove those three imported workflows and only the new custom node/runtime after confirming they are unused; apply the saved rollback SQL to restore `sender_connection_bind` and remove the four new functions; restart idle n8n. Do not delete the registry or existing Gmail workflows. Preserve any SMTP activity records and reconcile uncertain sends before any transport switch.
