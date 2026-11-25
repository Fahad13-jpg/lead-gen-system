# Gathering: new-business targets and two billing modes

The internal backend contract now defaults to `billing_mode: "platform"` and
`result_mode: "new"`. These fields are recorded on each job and included in request
idempotency checks. No job switches accounts or billing modes when funds run out.

## Request flow

1. A trusted backend sends the normalized search to `gathering-preview`. The preview
   reports the candidate allowance, target, billing mode, maximum customer charge,
   wallet availability and whether the configured provider budget can cover it.
   A preview does not reserve funds; admission rechecks these under database locks.
2. `start-scraping` reserves the provider budget and, for platform searches, customer
   credits. It returns a queued job ID. Repeated request IDs return that job.
3. The orchestrator drains the queue every ten seconds and after an accepted request.
   Account limits and a global worker ceiling govern dispatch. Within an account,
   the least recently served organization is selected first, then FIFO jobs.
4. The worker claims a dispatched job once and receives only that account's key.
   It starts one bounded provider run, saves its identity, and polls for completion.
5. Matching happens before the new-business target is applied. Existing businesses
   are recorded separately. Extra new candidates beyond the target are excluded.
6. Completion records the provider cost, any platform-wallet debit, new businesses,
   distinct existing matches, duplicate records, shortfall and completion reason.

The current webhooks remain **trusted-backend interfaces** protected by the shared
integration credential. Flutter must not hold that credential. Customer login,
organization membership authorization and payment-provider integration are separate
integration work; the current `users` table does not provide those capabilities.

## Search contract

```json
{
  "org_id": 1,
  "billing_mode": "platform",
  "result_mode": "new",
  "source": "google_maps",
  "job_name": "New dental clinics",
  "search_query": "dental clinics",
  "location": "Islamabad, Pakistan",
  "country_code": "PK",
  "max_results": 50,
  "candidate_limit": 150,
  "max_cost_usd": 0.5,
  "max_customer_cost_usd": 0.5,
  "request_id": "new_dentists_0001"
}
```

`max_results` is the number of **new businesses for this organization**, not provider
rows. The default candidate allowance is three times that target, capped at 1,500.
This is one bounded attempt, not an unbounded promise of 50 new businesses. Filters,
duplicates and provider limits may leave a shortfall. The response distinguishes
`target_reached`, `candidate_limit_reached`, `source_or_provider_limit`, cancellation,
and provider failure. It does not claim an entire geographic area was exhausted when
only a bounded provider run finished. No automatic geographical expansion occurs.

`result_mode: "matching"` explicitly requests matching businesses, including existing
ones. Only this mode can reuse cached results. Cache reuse never counts previously
collected businesses as new. The area, filters and billing mode remain part of the
cache identity. The API does not automatically retry paid runs to fill a shortfall.

## Billing

`max_cost_usd` limits the requested provider spend. For platform mode, the configured
price multiplier determines the customer reservation; the submitted
`max_customer_cost_usd` must cover it. The first implementation uses a multiplier of
1 (cost pass-through), not an invented commercial margin. Provider overshoot is
recorded honestly; the customer debit is capped at their reservation. Missing final
cost remains unknown and keeps the reservation until administrative reconciliation.

- **Platform:** a shared server account, one pooled calendar-month spending ceiling,
  and a separate prepaid ledger per organization. Queue admission reserves credit.
  Actual debit occurs once after terminal result processing. Existing monthly plan
  allowances are not silently converted into paid wallet funds.
- **BYOK:** the organization's connected provider account and its own spending cap.
  Provider usage is recorded, but no platform scraping-wallet debit occurs. The
  initial BYOK cap inherits the organization's existing monthly allowance as a safety
  limit; it does not imply credit on Apify.
- Keys are server-side, excluded from responses and successful/error execution
  persistence. Connecting an already linked provider identity is rejected. Keys
  cannot be replaced while that account has unsettled jobs.
- The platform account uses the existing server `APIFY_API_KEY`, with the requested
  **$5 calendar-month ceiling**. This is an internal ceiling, not a claim about the
  remaining balance or billing cycle of Apify itself. Out-of-band provider usage is
  not synchronized into this ledger.
- A BYOK connection using the platform's same key is disabled during configuration;
  it must use a different customer-owned provider account. This prevents falsely
  labelling platform spending as customer-owned usage.

## Deployment and administration

Apply migrations 001, 002, then 003 with `ON_ERROR_STOP=1`. Migration 003 adds new
versioned functions, so old active workflows can finish before their JSONs are
updated. Do not rerun migrations 001/002 as an upgrade after deploying 003.

`configure-platform.cjs --budget=5` runs inside the n8n container. It verifies the
server key with Apify, then configures the platform account without exposing the
key or crediting any wallet. Existing unresolved jobs prevent account reconfiguration.

Wallet funding uses the administrative SQL function
`gathering_wallet_credit(org_id, amount_usd, payment_reference)`. The reference must
come from a verified payment or an explicitly authorized administrative grant.
Duplicate references cannot credit money twice. There is no public funding webhook
and no payment processor connected yet. Production wallets start empty.

For a terminal job with unknown cost, an operator first verifies its final provider
cost, then calls `gathering_reconcile_cost_v3(job_id, org_id, verified_cost)`.
It settles once and releases the outstanding reservation. A conflicting second
amount is rejected. The API flags `billing_needs_attention` and provider overshoot.

`gathering_dispatch_settings.max_workers` defaults to four workers across accounts;
each account defaults to two simultaneous jobs. These are conservative internal
limits, not detected Apify plan entitlements. Adjust them to the actual plan and
local n8n capacity. Per-organization queues are capped at 20 unsettled jobs.

## Verification

- `node tests/lead-gathering/runtime.test.cjs`: request, targeting and workflow graph
  regression checks.
- `tests/lead-gathering/billing.sql`: rollback-only tests of reservations, wallet
  idempotency, billing snapshots, account routing, queue capacity, new-business
  counting, shortfalls, cancellation and tenant boundaries.
- `seed-billing-webhooks.sql` and the isolated n8n HTTP suite use synthetic account
  keys and synthetic wallet credits in `lead_gathering_test_20260926` only.

### Deployment verification — 2026-09-27

All four gathering workflows are active on localhost. The runtime suite passed
66 checks; the SQL regression and billing suites passed, as did the isolated HTTP
suite covering queue dispatch, platform charging, BYOK, cancellation, partial
results and saved-run resume.

Production HTTP checks confirmed the default new-business target, bounded
candidate allowance, rejection of an unfunded platform request, and a ready BYOK
preview with no customer wallet charge. The verified platform account is enabled
with a $5 monthly internal ceiling. Customer wallets remain empty. These final
checks created no scraping jobs or provider runs; outreach activity remained at
11 records. Payment processing and Flutter authentication are not integrated yet.

The existing database stores provider keys in server-side text columns. Database
access must remain private; encryption-at-rest/key-vault migration remains a separate
hardening task before exposing a hosted customer service.
