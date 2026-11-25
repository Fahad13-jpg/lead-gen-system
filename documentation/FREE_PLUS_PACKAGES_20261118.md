# Free and Plus packages

Product decision: 18 November 2026. Implemented locally with migration 071 and the package-aware dashboard. Pricing, online payments and automatic subscription billing remain inactive.

The platform is offered as hosted software. Customers receive access to their organization workspace; distributing the platform source code is not part of this product offer. Operator identity, final terms and pricing remain pending.

| Outreach capability | Free | Plus |
| --- | --- | --- |
| Email through a connected sender | Included | Included |
| LinkedIn message preparation and manual copy/open | Included | Included |
| WhatsApp message preparation and manual copy/open | Included | Included |
| Messenger message preparation and manual copy/open | Included | Included |
| Automated SMS through a connected phone | Excluded | Included when configured and verified |
| Automated phone calls | Excluded | Included when configured and verified |
| Official WhatsApp API automation | Excluded | Included when provider onboarding is complete |

Plus does not promise automated LinkedIn or unsolicited Messenger sending. Those remain manual workflows. Unimplemented channels must not be advertised as available.

## Resource funding

Packages control access to features. Existing customer-owned provider accounts remain supported. Plus includes no automatic provider credit, calling minutes, AI allowance, SMS package or verification balance. Operational limits, recipient permissions, approvals, suppression, budgets and provider readiness continue to apply. Managed Calling remains a separate prepaid resource once available.

This replaces the earlier no-subscription feature-access decision, while retaining its customer-owned resource funding rules. It does not reinstate the superseded Freemium/Standard/Premium numeric quota proposal. Lead discovery sources and their budgets are unchanged by this channel decision.

## Implementation boundary

Use trusted organization-level package assignment, not browser storage or a submitted plan name. Display Free/Plus availability consistently in campaign setup and Settings. Enforce restricted channel access in server routes, campaign admission, release and workers, including already queued jobs and downgrades. Connecting a provider account never grants Plus access. Upgrade must not start sending automatically.

Do not disable or reclassify existing organizations, enable paid billing, invent prices, or grant resources during preparation. Existing subscriptions and legacy tier values require an explicit migration mapping. The old policy catalog is a draft preview and is not evidence of runtime enforcement.

## Installed controls

Migration `071_organization_packages.sql` stores trusted feature assignments and an audit history independently of legacy `subscription_tier`. An unassigned organization is Free. Package reads verify current organization membership; every protected dashboard action reads the current database assignment. Browser state, provider credentials and legacy tier labels cannot unlock Plus.

Database triggers enforce paid campaign channels, strategy enqueue/claim and AI reservation, SMS release/admission, call reservation/dispatch and official WhatsApp outbound admission. They also cover existing n8n workers rather than depending on new frontend controls. History, inbound messages, opt-outs, settlement and reconciliation remain available after downgrade.

Downgrading to Free pauses the SMS connection, cancels queued/unattempted SMS and supersedes pending paid-channel strategy jobs. Already admitted provider attempts cannot be recalled and continue through reconciliation. Restoring Plus does not restart these jobs or enable a sender. Paid dispatch requires a new content approval recorded after the latest package assignment, in addition to all existing scope, number, funding, schedule and safety checks.

Demo Company (organization 1) has a manual Plus assignment to preserve development access. No provider credits, AI allowance or money were granted. New workspaces receive Free automatically. No existing legacy tier, sender cap, approval hash or provider credential was rewritten.

## Operator assignment

Assignments are currently a local operator task, not a customer API. Check the current revision in Settings/package status or through a trusted database read, then run from the project folder:

```powershell
docker exec lead_dashboard node scripts/organization-policy/set-package.cjs --org 1 --package plus --expected-revision 1 --reason "Recorded access decision"
```

Use the actual organization ID and current revision. The command refuses a stale revision. Reapplying the same package is a no-op. Use `--package free` for a downgrade. The command records an audit event for a change; it never charges a card, credits a wallet, buys a number or starts sending. Refresh Settings to see the assignment. Review and reapprove paid-channel content before a new release.

Calling provider setup and acceptance, official WhatsApp onboarding and managed-calling billing retain their previously documented limitations. Plus feature access does not certify provider readiness. A public checkout, payment-webhook verification, renewals/expiry and final pricing must be implemented separately once selected.

## Verification

Focused backend checks cover forged package input, membership isolation, fresh reads after downgrade, safe stop actions and clear HTTP denial before provider calls. Rollback-only PostgreSQL scenarios cover default Free, manual channels, hidden paid sequence steps, Plus access, fresh approvals, queue cancellation, continued reconciliation/inbound handling, audit history and unchanged credits. The 27 targeted UI checks and the optimized production build passed. Provider APIs were not called and no outreach was sent by these checks.

Settings package refresh now displays a checking state, completion confirmation and the last-checked time. It rechecks the current assignment and never upgrades or charges the workspace. The refresh regression test verifies a second backend read and a visible error on failure.
