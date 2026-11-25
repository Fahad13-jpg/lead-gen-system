# G1–G4 local/scratch review — 12 October 2026 PKT

No workflow import, deployment, activation, live database migration/write, inference call, Apify run, message, or trial-ledger change. Migration 016 was applied only to `scratch_lead_diag_20261011`. SQL fixtures and queue simulations were rolled back. Networking used only authenticated GET `/openai/v1/models`; keys were never printed or saved.

## G1: implemented and tested

- Failed basic refreshes no longer replace the last good `basic`, reset `basic_at`, or clear `research`/`research_at`. Failure diagnostics stay in `enrichment_attempts.result`. An all-unusable-page result is also treated as failed even if the worker calls it partial. Successful partial observations retain the existing save behavior. Preserved evidence can still become stale naturally or through a changed fingerprint; failure does not refresh it.
- `enrichment_stamp_source` is now STABLE, matching its time-zone-sensitive timestamptz cast.
- `basic.signals.web_presence.state` is the canonical **observed classification**. Trust is its freshness-gated projection: a fresh supported social-only assessment returns `trust.website_presence = social_only`; stale/invalid assessment returns unknown. The qualifier requires the social-only trust projection and social provenance. Social-only does not mean verified global absence of a website.
- `not_assessed` means no basic assessment exists. It returns `next_action: queue_basic`, pointing to the existing basic queue; the existing claim function already queues eligible leads. No second queue or webhook was added, and no live job was submitted. Completed failed attempts without a good profile count as assessed and return unclear, not not_assessed. Old assessed profiles lacking the new signals also remain unclear.
- Campaign config now accepts `offer_profile.source_check_max_age_days` (integer 1–365, default 30). Original source checks are retained rather than silently discarded. Old checks add `recheck_needed` and `next_action: recheck_sources`. The campaign window does not change the separate 30-day basic-assessment freshness or bypass fingerprints, conflicts, approval or payment gates. A source recheck is not automatically an authorized paid scrape.

### Leads 450–458

Each has an existing October 3 assessment and an April 24 listing stamp, approximately 170 days old at evaluation. Offline reclassification produces the same window comparison for all nine:

|Campaign window|Verdict|Reason|
|---|---|---|
|30 days|unclear|recheck_needed|
|90 days|unclear|recheck_needed|
|180 days|strong|website_presence_opportunity; none found in the stored checked listing|

These are conditional local classifications after normal fingerprint refresh, not production-authorized plans. A 180-day setting accepts old listing evidence; it does not independently verify today's website status. Per-lead results and timestamps: `source-age-windows.json`.

## G2: refresh and cost

The rollback-only claim simulation confirmed **43 basic + 43 research tasks**. The complete per-lead task list and budget arithmetic are in `refresh-cost-report.md`, with `refresh-cost-evidence.json` and `refresh-queue-simulation.json` as raw evidence.

AI enrichment is disabled with monthly limit 0. LinkedIn's enabled organization policy selects platform account 1, but the organization wallet has $0 available. Thus current incremental paid-provider cost is **$0**; new LinkedIn company jobs can enqueue but their starts are blocked. If credits were later supplied, the current remaining LinkedIn cap is $0.4579, within the $5 platform ceiling. That is not authorization to fund or run it.

Scheduling finding: existing research tasks can be claimed before fresh basic is available, and LinkedIn enqueueing can use a stale basic profile. Their insertion/claim guards differ. No structural scheduling change was made. The proposed rollout is basic only first, explicitly pausing research and LinkedIn execution, reviewing results, then deterministic research with AI still disabled.

## G3: 100 interleaved rounds, concurrent host control

700 requests total: three rotating configurations in each of two same-image scratch containers, plus one concurrent Windows-host fetch per round. Container groups and host ran concurrently; each container's three requests were sequential. Node v22.19.0. No model completions. n8n used the actual installed modern HTTP helper; diagnostic-only HTTPS interception set family/lookup **only for api.groq.com**. Fetch used a request-scoped Undici IPv4 dispatcher. No global DNS lookup override or production transport change.

|Client|Normal scratch DNS|Explicit DNS scratch|
|---|---:|---:|
|n8n helper default|95/100|97/100|
|n8n helper scoped IPv4|99/100|97/100|
|fetch scoped IPv4|100/100|99/100|
|Windows-host fetch control|100/100|Same concurrent control|

The explicit-DNS container used Docker `--dns 1.1.1.1 --dns 8.8.8.8`; Docker's embedded resolver remains visible inside the user-defined network. Default n8n failures were connect ETIMEDOUT/IPv6 ENETUNREACH aggregates. Normal-DNS scoped n8n had one ECONNRESET. Explicit-DNS scoped n8n had two EAI_AGAIN and one ERR_CANCELED; its fetch had one ECONNRESET. There is no consistent DNS improvement, so no DNS change is recommended.

Observed failure-window lengths, defined from a failed sample's start to the next successful sample's start in that same configuration:

|Group|Window lengths (seconds)|
|---|---|
|Normal n8n default|10.620, 2.293, 16.764, 9.630, 2.471|
|Normal n8n IPv4|10.198|
|Normal fetch IPv4|None|
|Explicit DNS n8n default|10.620, 16.755, 9.627|
|Explicit DNS n8n IPv4|14.401, 18.488, 10.214|
|Explicit DNS fetch IPv4|11.541|

All were isolated failed samples, not continuous measured outages. Windows samples overlapping these windows were all successful; the host stayed clean at sampled points, not continuously monitored. No 10-minute outage occurred in this roughly five-minute run. It cannot disprove the longer windows observed previously or guarantee reliability. Exact UTC times, error classes, medians/maxima and host overlap counts are in `connectivity-control-summary.json`; all requests are in `connectivity-control.jsonl`.

The least invasive candidate remains request-scoped IPv4 for the provider, subject to further validation. The requested two-quick-attempts, minimum-five-minute lease-release/backoff and `waiting_provider` design is in `RETRY_PROPOSAL.md`. **It is not implemented:** changing persisted job states/claim behavior conflicts with the instruction to preserve structural decisions. Ambiguous sends must be reconciled or stopped, never blindly retried.

## G4: CSV and validation

`website-pitch-labelling-30.csv` uses the same 30 real lead IDs as before and has blank human-label cells; no human score or evaluation metric was calculated. It reclassifies stored observations without generating new assessment timestamps or replaying old HTML as a fresh fetch. There are 27 unknown states and three none_found; verdicts are 27 unclear and three strong. All 30 already had basic assessments, so none are labelled not_assessed. Unlike the prior replay-labelled CSV, older stored pages without diagnostic metrics cannot establish template/strong classifications; those remain unknown until refresh. The template signal for lead 167 is separately verified with historical fixtures and scratch SQL.

Eleven offline test files passed, covering five historical benchmarks, 20 synthetic signals, 84 source-stamp records, new not-assessed/social-only/window cases, campaign validation and workflow graph preservation. SQL tests pass for STABLE volatility, good basic/research/timestamp retention after failure, natural expiry, failed-first assessment status, social-only trust/freshness, source isolation, 84-record SQL/JS parity, stale leases and stale-plan rejection. The scratch queue simulation separately confirmed the exact 86 claims and rolled back.

### Changed files

- `database/migrations/016_signal_sheet.sql`: hardening; scratch only.
- `scripts/lead-enrichment/source-stamp.sql`, `signals.cjs`.
- `scripts/lead-strategy/runtime.cjs` and embedded copies in `workflows/06C_outreach_strategy_generator.json`; same nine nodes, unchanged graph, modes, settings and sticky notes.
- `tests/lead-strategy/qualifier-hardening.test.cjs` (new), `qualifier-integration.test.cjs`; `tests/lead-enrichment/signals.test.cjs`, `source-stamping.test.cjs`.
- `scripts/diagnostics/check-scratch-migration.cjs`; new `connectivity-control.cjs`, `summarize-connectivity-control.cjs`, `refresh-cost-report.cjs`, `check-refresh-queue.cjs`, `hardening-labels.cjs`.
- This report directory and generated local test evidence. Existing diagnostic runner also refreshed the prior scratch directory's migration output; no production artifacts were imported.

### UNVERIFIED

Production behavior and long-window networking reliability; whole-logical-request pre-send instrumentation; provider reconciliation/idempotency and real billing-cap enforcement; live listing omission semantics and current business website status; Yellow Pages missing-field semantics and Yelp schema; restricted-role migration permissions (scratch owner is a superuser); human qualification accuracy. Conditional LinkedIn follow-on jobs depend on provider results not obtained here.

The final SQL rerun also passed for an all-unusable result labelled partial. An intervening stopped scratch container delayed that rerun; restarting only the scratch database resolved it. No production restart or setting change was performed.

No deployment is authorized by this report. Review the CSV, SQL and retry proposal before approving any live change.
