# Backend handoff before dashboard refinement — 17 November 2026

The agreed general improvements now have these concrete deliverables:

| Improvement | Implemented result |
| --- | --- |
| Explain connection state | Settings API distinguishes saved configuration, recent checks, paused accounts, active work and reconciliation needs. Gmail recovery returns specific next actions. |
| Consistent campaign status | Read-only lifecycle/reason/next-action summaries distinguish Draft, Awaiting approval, Scheduled, Running, Paused and Needs attention. Stopped/replied email does not remain Running from older metadata. |
| Recover uncertain saves | New Apify saves retain a signed subject/org/key-bound recovery reference and compare saved fingerprints after lost responses/restarts, without repeating the connection POST. Legacy unknown attempts require review. |
| Reliable interrupted searches | All four workers route partial references away from new paid starts. Migration 069 preserves provider evidence/unknown cost, restricts zero-cost expiry to proven unstarted work, and excludes legacy rows. |
| Separate limits from charges | Job API exposes recorded provider/platform ceilings and actual costs separately; unknown stays null. It does not claim live provider balance or authorization. |
| Keep all sources in import tools | Shared gathering catalog includes connection/orchestrator plus four workers. Import preparation includes Yelp, isolated tests include Facebook/Yelp, and test bootstrap uses the actual generated inventory instead of a fixed count. |

The import/isolated-test fixes were checked with three in-memory generator tests.
No real files containing credentials were read by those tests, no private import
artifacts were generated on disk, and no isolated server or production import was
started. This is source/tool consistency work, not a deployment decision.

## Actual remaining work

### Backend integration still unfinished

- Calling live final-cost adapter: select the real number/telephony route, verify
  which provider costs it covers, then integrate final verified all-provider costs.
  Existing SQL/normalized receipt checks do not constitute live billing integration.
- New customer calling tool/Calendar provisioning still requires a trusted
  organization-specific backend/Calendar credential mapping; the existing local
  organization 1 check does not make arbitrary new customer Calendar accounts ready.
- Managed Calling prepaid payments/wallet integration remains unavailable and is
  needed only before offering the managed service, not for customer-owned resources.
- Production durability for OAuth callback/credential provisioning and multi-instance
  operation must be resolved during deployment preparation. Apify recovery does not
  claim to solve uncertain new Gmail enrollment or every channel's ambiguous write.

### Acceptance waiting on account/device resources or separate test authorization

- SMS: SIM balance/package, one approved owned-recipient send and delivery/reply/STOP.
- Calling: number, funding, stable authenticated endpoint, route/voice and actual
  bounded phone-call acceptance, including final costs and stored outcomes.
- Yelp: one small approved US run to verify actual contact yield and cost.
- SMTP and Messenger strategy/browser walkthroughs if retained in launch scope.

### Production provider prerequisites

Stable HTTPS/domain, Google production OAuth configuration/review and Meta
business/app review for automated customer WhatsApp onboarding remain. Temporary
local SMS ingress and manual WhatsApp/LinkedIn/Facebook flows are not substitutes
for these provider approvals. Host topology, backups, supervision and deployment
operations remain a later phase as requested.

Dashboard refinement can consume the new API summaries now. It should preserve
these incomplete/paused states and explain the next action rather than imply that
all channels are fully accepted. There is no need to add another channel, pricing
tier proposal, broad audit or repeated paid test before starting that refinement.
