# Proposed usage limits for review

Status: SUPERSEDED by the customer-owned resources + prepaid managed calling decision
in `CALLING_RESOURCE_MODES_20261116.md`. These tier limits must not be activated.

Historical proposal, requested 16 November 2026. These are product design choices,
not current entitlements, prices, credits or provider guarantees. The runtime
catalog and existing organization/provider budgets are unchanged. New workspaces
receive zero provider credits and zero AI allowance until trusted assignment.

| Usage per organization | Freemium | Standard | Premium |
| --- | ---: | ---: | ---: |
| Gathered source records / month | 50 | 1,000 | 5,000 |
| AI strategy requests / month | 5 | 100 | 500 |
| Deep AI research requests / month | 0 | 50 | 250 |
| Outgoing email submissions / month | 200 | 2,000 | 10,000 |
| Maximum outgoing email submissions / day | 20 | 100 | 500 |
| Outgoing SMS segments / month | 100 | 1,000 | 4,000 |
| Maximum outgoing SMS messages / rolling 24h | 10 | 50 | 100 |
| Maximum outgoing SMS segments / rolling 24h | 20 | 100 | 200 |
| Enabled campaigns | 1 | 5 | 20 |
| Team members, including owner | 1 | 3 | 10 |
| Customer-owned provider accounts | Yes | Yes | Yes |
| Automated calling access | Browser demo; separately allocated live trial only | Yes, once funded and verified | Yes, once funded and verified |
| Maximum calling minutes / month | No automatic live allowance | 100 | 500 |
| Included calling money | None | None | None |

## What these numbers mean

- Gathering counts source records, not guaranteed new businesses. Duplicate and
  irrelevant records can consume provider resources. Preview/run spending ceilings
  remain independent, and stopped/uncertain provider starts are not blindly retried.
- AI requests count provider attempts/reservations under the existing ledgers;
  failed outputs do not silently receive unlimited replacements. Actual model
  funding, monthly hard budgets and global provider controls remain necessary.
- SMS segments count outgoing transport units; a two-part SMS consumes two units.
  Reply and STOP ingestion must continue even after outgoing allowance exhaustion.
  Incoming personal SMS must not consume an outreach quota or be retained unless
  they match a known outreach recipient. Current SMSGate rollout remains one device,
  one selected SIM and one first-message step, with a 20-message default connection
  cap. Higher proposed ceilings do not enable additional product features.
- Daily/rolling and monthly limits both apply. Customer preferences may lower,
  never raise, assigned plan/provider/mailbox/organization hard limits. Existing
  conservative sender limits still apply even if a plan ceiling is higher.
- Quotas are organization-wide, shared by all members and campaigns. BYOK means
  provider costs are borne by the connected account; it does not create credits.
- Manual LinkedIn/Messenger and manual WhatsApp stay available where implemented;
  copying/opening does not prove a send. Automated channels require their own
  supported account, permission, approval, funding and country readiness.
- The earlier shared $10 calling-trial ceiling remains a separate allocation
  decision. No portion is issued automatically by registration or this proposal.
  Freemium can demonstrate the agent in the browser; any real-call trial needs
  an explicit allocation from that funded pool. Standard/Premium minute limits
  are usage ceilings, not prepaid minutes or a promise of free provider service.
  Actual calling also requires a ready number/account, provider funds, approved
  recipient eligibility, current call brief, budget and release checks. Uncertain
  calls are reconciled conservatively rather than treated as free retries. AI
  disclosure, opt-out handling and other safety checks apply to every real call;
  agent quality is not reduced on lower tiers. The existing single-call concurrency
  remains; Premium does not promise parallel dialing in this first release.
- Premium paid-verification inclusion needs a separately costed allowance before
  it can be promised. Basic checks remain available without buying verification;
  basic checks must not be labelled provider verification.

## Pricing and activation

Do not publish subscription prices until model, hosting, verification and support
costs are estimated against these volumes. No payment collection or automatic
subscription upgrade is enabled. An administrator-assigned pilot can validate
entitlement enforcement after the limits are accepted. Team invitations and the
full tier/usage enforcement layer are still implementation work; this table is
not a claim that they have shipped.

Recommended starting point: review these modest limits using BYOK as the default
for paid lead gathering, device/SIM costs paid by the organization, and no bundled
calling credit. Revisit volumes using real usage before marketing paid plans.
