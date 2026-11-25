# Calling resource modes

Update, 18 November 2026: calling now requires Plus feature access as recorded in `FREE_PLUS_PACKAGES_20261118.md`. Customer-owned Retell and optional prepaid Managed Calling remain the resource funding choices below.

Decision: customer-owned accounts are the base resource model; prepaid Managed
Calling is an optional service. This supersedes the three-tier quota proposal.
There are no approved subscription prices or included calling minutes.

| Mode | Who pays the provider | Initial availability |
| --- | --- | --- |
| Your own accounts | Customer funds each connected provider | Existing provider integrations; Retell onboarding added below |
| Managed Calling | Platform pays Retell/carrier from customer prepaid usage | Disabled until billing and production calling integration are complete |

More Apify credit can fund more scraping within approved budgets. It does not
fund platform AI requests, phone calls or verification. Provider limits,
mailbox/SIM rate limits, spending ceilings, approval, recipient eligibility,
suppression and uncertain-result reconciliation remain mandatory. These are
operational protections, separate from a commercial subscription quota.

## Implemented in this change

- Organization-scoped Settings form and fixed authenticated account routes.
- Owners/admins can save a Retell key, published agent/version and optional US
  number. Account access is checked through read-only Retell APIs. No call,
  number purchase, agent publication or provider mutation is performed.
- AES-256-GCM credentials with organization-bound authentication data and a
  separate local key. Status returns metadata only; errors redact provider data.
- Migration 065 stores new accounts in `calling_accounts` as `pending_setup`.
  A request receipt prevents duplicate connection writes; shared agent IDs, keys
  and phone numbers cannot be assigned to different organizations. Different keys
  from one provider account are not proof of distinct account ownership.
- Saved connections remain separate from existing campaign dispatch bindings.
  No existing trial connection or campaign is changed. Migration 066 adds versioned account updates (including adding a number),
  credential deletion on disconnect, paused campaign binding and durable change
  receipts. Active/uncertain calls block these changes; affected campaign versions
  are paused and require fresh plan review. No row replacement by hand is needed.
- Managed Calling displays unavailable. Registration allocates no money, minutes
  or provider resources; the historical $10 shared trial is not a managed wallet.

## Remaining to enable customer-owned live calling

1. Provision the tested agent prompt, opt-out/booking tools and Calendar access
   in the customer's provider account; pin its reviewed published version.
2. Bind a number and prove caller authorization, route health, supported country,
   provider funding and bounded all-in cost quote. Reading an asset only proves
   API access; it does not establish these facts or verify the agent's behavior.
3. Paused campaign binding and credential lifecycle controls are implemented.
   Connect the account vault to the production transport with fresh version checks,
   reviewed agent/tool proofs and number/funding readiness before enabling it.
4. Complete one explicitly authorized owned-recipient phone call and reconcile
   provider/carrier cost, outcome, reply/stop/booking behavior. Initial production
   scope remains US/English, one globally active or uncertain call, 60 seconds.

## Managed Calling billing contract to implement

Use an organization wallet with an append-only ledger, integer micro-USD,
trusted payment receipts, idempotent funding, refunds and an operator spending
cap. Customers cannot credit their own balance. Publish the all-in rate and any
phone-number rental before payment; actual pricing remains undecided.

Reserve the maximum quoted charge atomically before provider admission. Hold
funds for unknown outcomes; never retry an uncertain dial. Settle once from
verified final provider/carrier evidence, release unused reservation, and block
new calls if an overrun or unreconciled cost exists. Provider budget and customer
wallet are separate checks. No cron, dispatcher or wallet funding is enabled by
this account onboarding change.

## Verification

Focused service, HTTP and UI checks cover membership, credential isolation,
idempotent replay, read-only provider paths, unpublished/wrong-version rejection,
redacted uncertain outcomes and no automatic replacement submission. A real
customer key/agent walkthrough and live phone acceptance remain pending.

API references: [Get Voice Agent](https://docs.retellai.com/api-references/get-agent)
and [Get Phone Number](https://docs.retellai.com/api-references/get-phone-number).
The implementation uses exact asset reads, avoiding the retired legacy list API.

16 November lifecycle verification: focused backend/route/UI checks and a real
rollback-only SQL walkthrough passed for binding, update, disconnect, version
conflicts and receipt replay. Migration 066 preserves existing accounts and changes
no campaigns at installation. Managed funding, transport enablement and live
phone acceptance remain incomplete.

Provider checks and a disabled, vault-backed single-attempt transport/poller are
now implemented; see `CALLING_TRANSPORT_20261116.md`. Customer tool/Calendar
provisioning, trusted route/voice proofs, funding acceptance and automatic final
provider-cost settlement still block unattended production calling.
