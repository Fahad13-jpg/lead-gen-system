# New-customer workspace creation

Verified signed-in accounts without workspace access now see Create your workspace
on the Access screen. They supply a workspace name and acknowledge that they are
creating a new organization. Accounts joining an existing company are directed to
its administrator. This feature does not invite members or auto-join by email/domain.

The server uses the existing Firebase revocation/verified-email/session checks and
derives the existing issuer/UID-bound subject. The browser cannot choose subject,
organization ID, membership role, subscription tier, credits or AI quotas. Database
creation is atomic under a per-subject transaction lock: one organization, owner
membership, enrollment receipt and disabled zero-limit strategy AI control.

New organizations explicitly use freemium, one maximum member, zero monthly
platform-credit limit and zero used credits. No provider account, wallet credit,
sender connection, campaign release or call allocation is created. Product-tier
allowances and provider/organization budgets require separate trusted assignment.
This is workspace self-service, not a complete subscription/payment system.

Subject and request ID uniqueness prevent repeated submissions creating multiple
workspaces. A matching retry returns the saved result. Existing memberships, even
inactive ones, block a new enrollment. A disabled workspace or revoked/demoted
owner is never silently reactivated. Creation-status reads use the same subject
lock, so uncertain writes can be reconciled without replaying creation.

The browser retains only its pending request/name in session storage and blocks
another create until reconciliation. It reloads authoritative membership after
success before granting dashboard access. Sign-out/identity changes fence stale
responses; creating a workspace does not let a late response restore access.

Validation includes focused service/HTTP checks, browser-component/auth-context
checks, and rollback-only SQL: zero-credit defaults, idempotency, revoked-owner
protection, other-member isolation and unchanged wallet/AI-request/outreach ledgers.
No real customer account, organization, provider call, AI request or message is
created by installation. Real second-account browser acceptance remains to do;
existing-user login/membership is preserved. Production Google/Firebase/provider
registrations remain their separate deployment requirements.

Schema: migration 064. Runtime: `scripts/dashboard/workspace-enrollment.cjs`.
API: authenticated POST `/dashboard-api/workspace/create` and GET
`/dashboard-api/workspace/status`, with no client organization selector. Existing
origin, body-size, token and rate limits apply. Evidence/backup is under
`.local/workspace-enrollment-20261116/` and frontend rollback under
`.local/workspace-enrollment-ui-20261116/`.
