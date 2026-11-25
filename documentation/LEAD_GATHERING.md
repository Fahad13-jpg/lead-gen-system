# Lead gathering: implementation and operations

For the current dual-billing contract and new-business targets, see
[GATHERING_BILLING.md](GATHERING_BILLING.md). Migration 003 supersedes the admission,
charging and target-count behavior described in the original verification record below.

Scope: workflows 01, 02, 03 and 03a, through insertion into `staging_leads`.
Website email discovery (03b), cleaning, enrichment, outreach, Flutter and Retell
remain separate stages and must stay inactive during gathering verification.

## Deployment

1. Keep a database backup and exports of the four existing workflows.
2. Apply `database/migrations/001_lead_gathering.sql`, then `002_gathering_features.sql`, with `ON_ERROR_STOP=1`.
3. Run `node scripts/lead-gathering/build.cjs` to generate the four JSON files.
4. Configure an n8n HTTP Header Auth credential named `Lead Gathering API`
   (`X-Lead-Gathering-Key`, a random secret); bind it to every gathering webhook
   and the orchestrator's internal dispatch requests.
5. Import the four workflows and bind the existing PostgreSQL credential.
6. Activate the two scraper endpoints before the orchestrator and connection endpoint.
   Leave later stages inactive until separately tested.

`prepare-deployment.cjs` creates private artifacts under ignored `.local/` for
this installation. Its existing workflow/project IDs are installation-specific.
Never commit or distribute that directory. The API key is a trusted backend
integration key, not a per-user login or a substitute for future tenant authorization.

## Request contract

`POST /webhook/start-scraping`, authenticated with `X-Lead-Gathering-Key`:

```json
{
  "org_id": 1,
  "job_name": "Dental clinics near Islamabad",
  "source": "google_maps",
  "search_query": "dental clinics",
  "location": "Islamabad, Pakistan",
  "max_results": 5,
  "request_id": "dental_islamabad_001",
  "max_cost_usd": 0.5,
  "scrape_contacts": true,
  "website_filter": "allPlaces"
}
```

Supported sources: `google_maps`, `yellow_pages`. Yellow Pages also requires
`country_code: "US"`; its location must be within the US. Yelp is rejected because
no corresponding scraper is implemented. `website_filter` accepts `allPlaces`,
`withWebsite`, or `withoutWebsite` for Google Maps. Geographic targeting uses the
provider's named location unless `center` and `radius_km` are supplied. Radius mode
uses a provider polygon and checks each result's distance from the supplied center;
records without coordinates are excluded with a reason.

Additional request fields:

- `search_terms` and `locations`: arrays, replacing the single query/location fields.
  At most 20 combinations, also bounded by `max_results`. One provider run shares the
  result limit and budget. Multiple Google Maps locations use location-qualified terms;
  per-term allocations are rounded up, then the saved result count is capped.
- `center: {"latitude":33.7,"longitude":73.0}`, `radius_km:5`: Google Maps only,
  one location, radius 0.1–100 km. Coordinates are explicit; no paid geocoder is used.
- `include_categories`, `exclude_categories`: case-insensitive category phrases.
- `require_contact`: require at least one phone, email or website; default false.
- `exclude_closed`: default true. These checks do not validate deliverability.
- `reuse_hours`: 0–168, default 24; `refresh:true` bypasses reuse.

`POST /webhook/gathering-preview` accepts the same request and returns the search
combinations, filters, radius, limits and reuse policy without creating a job or
calling Apify. Named locations are explicitly marked as provider-resolved, not
claimed to be geocoded/verified by this backend.

Use the same `request_id` on network retries. A replay returns the existing job
without dispatching another paid run. Reusing the ID with different search settings
returns 409. Omitting it generates an execution-specific ID and does not deduplicate
separate HTTP requests. An identical recent completed search creates a new history
entry linked to the original job, copies result observations, and returns 200 with
`reused_from_job_id`; no new provider run or charge occurs. Reuse requires identical
filters, terms, locations and result limit. Failed/partial/cached jobs are not reused
as cache origins, so reuse cannot continually extend stale data's lifetime.

The request returns 202 when a job is accepted; this does not claim that scraping
has completed. Check `GET /webhook/gathering-job-status?org_id=1&job_id=...` with
the same authentication header. This endpoint includes quality metrics and excludes
credentials and lead payloads. `GET /webhook/gathering-results?org_id=1&job_id=...`
returns per-search observations, including existing matches and rejection reasons;
pagination uses `offset` and `limit` (1–100). `GET /webhook/gathering-source-quality?org_id=1`
reports 30-day totals, unique leads, contact coverage, duration and reported spend.

`POST /webhook/gathering-control` accepts `{"org_id":1,"job_id":123,"action":"resume"}`
or `"action":"cancel"`. Resume requires an interrupted job with both saved provider
identities; it skips the paid-start node. An ambiguous start with no saved run ID
requires provider review. Cancellation of an active run is observed on the next poll,
sends a provider abort, and waits for a terminal status before persisting partial
results and cost. A pending, unstarted job cancels immediately without charge.

## Reliability and billing

- Job admission locks the organization row and reserves the requested budget.
  At most three managed pending/running/review jobs can be admitted per organization.
- Workers claim a pending job once, matching organization and source. Repeated
  worker calls do not start duplicate provider runs.
- The actor start is deliberately not automatically retried: a lost response may
  still mean a paid run was created. Read-only status/dataset calls can retry.
- Both providers use asynchronous actor runs with a provider timeout of 600 seconds.
  Polling checks local expiry before looping; an expired run is sent an abort request.
- Full HTTP responses preserve an empty result array so zero-result runs complete.
- Run IDs and dataset IDs are persisted before polling. Failures after a paid start
  are never automatically restarted.
- Results, inserted/duplicate counts, job completion and billing are transactional.
  Repeating finalization cannot insert or charge twice.
- `actual_cost` comes from Apify `usageTotalUsd`. Missing cost remains unknown,
  not zero. The request budget is sent as `maxTotalChargeUsd`; provider applicability
  and charge granularity govern its enforcement. It is not a universal hard spend
  guarantee for every actor pricing model.
- `gathering_costs` retains six-decimal costs. The existing two-decimal organization
  balance receives cumulative rounded differences, retaining fractional carry.
- New jobs have `gathering_version=1`. Historical pending/running rows are not
  silently altered and do not block the new admission limit.
- `needs_review` preserves ambiguous jobs and their budget reservation. Review
  n8n/Apify state before retrying. No unattended recovery of ambiguous paid starts.
- The orchestrator checks managed stale jobs every five minutes when active.
  Pending jobs older than ten minutes fail; running jobs without a heartbeat for
  twenty minutes enter `needs_review`. Historical jobs are excluded.
- Shared website and phone uniqueness indexes are replaced with nonunique lookups.
  Provider IDs remain unique. Fallback matching uses normalized business name with
  address or phone evidence, while distinct provider identities preserve branches.
  Organization locking serializes matching and insertion. `total_leads` means new
  rows; result history also records existing matches, original snapshots and exclusions.
- Worker execution IDs fence resumed jobs: an old execution cannot finalize or mark
  a newer worker's job as failed. Provider abort polling is bounded; uncertainty keeps
  the job in review with its reservation instead of silently starting another run.
- Source/result quality is descriptive, not an assessment of purchasing intent.
  Phone/email coverage reflects field presence; named-area accuracy relies on the
  provider unless explicit radius coordinates are supplied. Duplicates, exclusions
  and provider under-delivery can yield fewer leads than the requested maximum.

## Testing

```powershell
node scripts/lead-gathering/build.cjs
node tests/lead-gathering/runtime.test.cjs
```

Apply the migration to an isolated schema-copy database and run
`tests/lead-gathering/features.sql`. Its fixture changes roll back. The original
`database.sql` tests migration 001 separately before applying migration 002.

`prepare-deployment.cjs --mock --scenario=success` prepares a manual n8n harness
with simulated provider responses and the isolated test database credential.
Other scenarios: `empty`, `failed`. Without `--mock`, it prepares the approved
five-clinic Islamabad test using the real provider. It never sends outreach.

## Remaining boundaries

This stage delivers raw source records. Email validation, business qualification,
and permission to contact are not implied by a successful scrape. Later-stage
status conflicts and missing organization ownership in historical records are
not repaired by this migration. Do not activate the remaining pipeline yet.

## Verification record (2026-09-26)

- 55 JavaScript/graph regression tests passed.
- PostgreSQL integration assertions passed against a separate schema-copy database.
- Actual n8n manual simulations verified duplicate counting, empty results,
  provider failure classification, and website/email mapping in the n8n sandbox.
- An isolated n8n 1.111.1 instance passed authenticated HTTP tests for preview,
  validation, dispatch, radius exclusions, branch matching, replay/conflicts, reuse,
  pagination, tenant boundaries, source metrics, cancellation with final cost,
  partial failure results, and saved-run resume that bypasses the paid-start node.
  Provider responses were simulated; these tests incurred no additional Apify cost.
- Approved Google Maps live test: job 115, five dental clinics in Islamabad, PK;
  five unique source identities and phone numbers, one restored website,
  no emails; approximately 20.1 seconds; Apify cost $0.030050.
- Outreach activities remained at 11: no outreach was triggered.
- Yellow Pages input was checked against its published schema; no paid Yellow Pages
  run was performed. Both migrations and the four corrected workflows are imported
  in Docker, and the four gathering workflows are now active.
- Production localhost verification: job 116 completed in 74.7 seconds with five
  Islamabad dental clinics, five phones, one website, and no emails. All five matched
  existing leads, so no duplicate staging rows were inserted. Exact ledger cost:
  $0.030050 (the older job cost column displays $0.0301).
- Live HTTP checks passed for authentication, preview, invalid request rejection,
  dispatch, result retrieval, request replay/conflict, tenant boundaries and source
  reporting. Cached job 117 reused job 116 with zero additional provider cost.
  Outreach remained at 11 records.

The Google Maps input mapping follows the [published actor schema](https://apify.com/compass/google-maps-extractor/input-schema).
Cancellation uses the [Apify abort endpoint](https://docs.apify.com/api/v2/actor-run-abort-post).
