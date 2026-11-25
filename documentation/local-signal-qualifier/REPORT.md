# Local signal sheet and qualifier — 11 October 2026

Scope honored: no workflow imports/deployments/activation, database writes/migration execution, model inference, Apify runs, messages or trial-ledger changes. All implementation and tests are local. Only token-free GET /openai/v1/models calls ran in isolated diagnostic processes inside the existing container. No production settings changed.

## A. Connectivity

Node v22.19.0; autoSelectFamily=true; default attempt timeout=250 ms; DNS order=verbatim. These were read from the container runtime. The installed n8n HTTP helper uses Axios 1.8.3. Probes called that actual exported httpRequest helper. The other set used global fetch, as the optional enrichment helper does. No workflows were executed. Each client made 100 sequential requests per configuration, 500 per client, 1000 total. Clients ran concurrently; configurations ran in the listed order. All ten configurations used a new diagnostic process. Forced IPv4 overrides DNS lookup family only inside that process; other settings likewise never touch the n8n process.

|Configuration|n8n HTTP helper successes|fetch successes|n8n p50 elapsed ms|fetch p50 elapsed ms|
|---|---:|---:|---:|---:|
|Default|0/100|0/100|565|571|
|Attempt timeout raised to 1500 ms|79/100|91/100|1123|437|
|autoSelectFamily disabled|96/100|100/100|863|535|
|Forced IPv4|100/100|100/100|698|455|
|DNS ipv4first|26/100|100/100|514|484|

Error-code counts include nested aggregate causes, so ETIMEDOUT and ENETUNREACH often describe the same failed request and must not be added together.

|Client/configuration|Error codes|
|---|---|
|fetch/default|97 ETIMEDOUT + ENETUNREACH pairs; 3 EAI_AGAIN|
|fetch/raised|8 ETIMEDOUT + ENETUNREACH pairs; 1 EAI_AGAIN|
|fetch/disabled, IPv4, ipv4first|None|
|n8n/default|98 ETIMEDOUT + ENETUNREACH pairs; 2 EAI_AGAIN|
|n8n/raised|19 ETIMEDOUT + ENETUNREACH pairs; 1 EAI_AGAIN; 1 ERR_CANCELED|
|n8n/disabled|3 ECONNRESET; 1 ERR_CANCELED|
|n8n/IPv4|None|
|n8n/ipv4first|74 ETIMEDOUT + ENETUNREACH pairs|

Failures cluster strongly: both default runs fail for all 100 requests, approximately 14:28:54–14:30:54 UTC. fetch/raised fails its first nine requests. n8n/raised has a 12-request failure streak at indices 71–82 (14:35:11–14:35:45). n8n/ipv4first has streaks of 40 (24–63) and 31 (70–100), approximately 14:41:42–14:42:34. n8n/disabled errors are isolated at indices 20, 56, 75 and 97. Exact timestamps, configurations and codes are retained in ten JSONL files and matrix-summary.json.

The timeout hypothesis is supported: typical default errors occur around 0.5–1.2 seconds, while many raised-timeout failures take about 3 seconds. This fits multiple per-address attempts. It is not definitive causal proof: runs were ordered rather than randomized; both clients overlapped; fetch pools connections whereas n8n creates agents; DNS errors and resets also occurred. A blanket claim of a dead route is not supported. DNS ipv4first alone did not reliably fix the actual n8n helper.

Important anomaly: n8n/raised request 7 reports ERR_CANCELED after 120,533 ms despite a 16-second AbortSignal and 15-second request timeout. The reason is UNVERIFIED (process scheduling/suspension or cancellation behavior was not measured). Do not claim those timers provide a hard wall-clock guarantee. No explicit TLS certificate/protocol error was observed. No chat-completion reliability claim can be made from GET tests.

**Proposed fix, not applied:** use a Groq-request-scoped IPv4 transport/lookup, preserving TLS verification and timeouts. Prefer this to changing Docker, firewall, system DNS order or all Node networking. fetch can accept a scoped dispatcher; the n8n HTTP helper currently does not expose arbitrary agent options through its node, so the exact request-scoped integration needs review before implementation. Do not silently swap transports or change global process defaults. Explicit IPv4 was the only configuration with 100/100 successes in both samples, but is not a guarantee.

**Proposed bounded retry policy, not applied:** maximum three total attempts for safe/idempotent reads, full-jitter delays Uniform(0,min(4000,500*2^retry_index)) ms, honor bounded Retry-After, and stop before the existing lease deadline with time reserved to record the result. Recheck the same lease/fingerprint before each attempt; reuse the same reservation/reference; never reclaim the job or reserve a second budget slot. Retry only transient DNS/connect failures, resets and retryable HTTP responses. No retries for authentication, schema or permanent target errors.

For potentially billable model/Apify POSTs, do not automatically retry an ambiguous request that may have been accepted. Reconcile an existing run/reference where supported; otherwise stop for review. Retrying multiple potentially billable calls under a reservation that accounts for only one call would conflict with the budget invariant. The recommendation therefore does NOT authorize that behavior. Existing reservation coverage/idempotency for such retries is UNVERIFIED; no retry policy was implemented.

## B. Local signal sheet

worker.basic() now returns per-page requested/final URL, HTTP status, content type, retained HTML bytes, extracted static text bytes, truncation and error class. Failed fetches retain diagnostics and cannot become none_found. Byte counts describe retained UTF-8 HTML/text, not compressed wire bytes or browser-visible text. Text extraction removes scripts/styles/noscript and tags, collapses whitespace, and only decodes nbsp. No JavaScript rendering was added.

basic.signals includes:
- web_presence.state, checked sources, per-source URL/time/result, observed_at, fetched pages and limitations;
- inquiry_paths.booking_link/contact_form/whatsapp/phone with observed, not_observed_on_N_pages, or unknown when no usable page was checked; N, page URLs, source evidence and limitations;
- Facebook/Instagram evidence; CMS markers; sourced rating/review observations;
- placeholder_text, no_viewport_meta, stale_copyright, no_https and offtopic_headings, each with affected pages;
- coverage_complete, used to prevent negative conclusions from partial coverage.

Classification is a documented heuristic: placeholder markers => template_unfinished; complete coverage and copyright over two years old => outdated; complete static HTML with at least 200 text bytes => functional; at least 1000 text bytes, a booking/form route and no quality flags => strong. Otherwise unknown. Off-topic detection is deliberately narrow: known construction-template headings on clinic sites; broader topic detection is UNVERIFIED. These labels do not establish working forms, site ownership, actual obsolescence or purchasing intent.

No saved website becomes none_found only with fresh, explicit, successful listing checks whose website_result values are all none_found. Missing raw website keys mean unknown, not absence. Failed fetches and stale/future/missing-provenance checks cannot create none_found. Facebook/Instagram URLs in the website field remain social evidence, not proof of a company website. Their pages are not crawled as company sites.

The proposed migration adds top-level trust.website_presence (present/none_found/unknown), warnings=[template_site_suspected] when placeholder_text is observed, and a website_current_meaning explanation. It does not add that warning to conflicts. website_current continues to mean assessment freshness. Consumers require actual presence as well as freshness for website evidence. Legacy basic.pages can supply a conservative presence fallback until migration; freshness alone never means present.

strategy_context already forwards all of basic, including signals, provenance and limitations, so it needs no replacement. The runtime carries the full signals into the draft plan and computes the qualifier offline. It does not enlarge or call the AI prompt in this task.

### Proposed SQL — UNAPPLIED

Full file: ../../database/migrations/016_signal_sheet.sql. Five function definitions only; no tables, columns or webhooks added:
1. enrichment_source_checks: read org-scoped, eligible staging records and explicit source values; missing fields stay unknown.
2. enrichment_fingerprint: include the additional source evidence in the existing fingerprint so changed inputs invalidate old assessments. Same hashing/lease model.
3. enrichment_task_input: forward source checks to the existing worker.
4. lead_trust_report: add website_presence and warnings while preserving conflict and outreach rules.
5. enrichment_finish: retain valid failed-basic diagnostics in existing basic JSON while keeping the same lease validation, retry transitions and result history. Failure still reports saved=false for a successful enrichment outcome; it does retain diagnostic JSON.

Once applied in a separately authorized step, changed fingerprints will require normal evidence refresh before old profiles are considered current. No existing records were backfilled. Dollar delimiters were checked locally; PostgreSQL execution, permissions and live behavior are UNVERIFIED because migrations were explicitly prohibited.

## C. Offer profiles and offline qualification

Campaign config.offer_profile selects {key:"website_presence"} or the conservative {key:"generic"} default. Profiles are rule data, with no per-industry branches in the qualifier. Candidate-angle text is taken exactly from campaign offer.approved_points; no benefit is invented.

|Evidence|Website-presence verdict|
|---|---|
|Documented none_found or template_unfinished|strong|
|Functional site, complete bounded coverage, none of four inquiry paths observed|moderate|
|Strong site with booking/form|weak|
|Unknown/stale/conflicted evidence, failed fetch, or no matching rule|unclear|

Generic fallback is unclear until a suitable profile is provided. Outdated alone is unclear; stale copyright does not establish a sales need. Fit is separate from existing scores and never changes permission, approval, billing, leases or sending readiness. Suppression and campaign targeting gates remain unchanged. Candidate angles are review candidates, not automatic claims of need.

Absence wording is generated only for documented source-scoped absence: “I couldn't find a website for you on Google Maps. Is there one?” Sources come from the actual checked evidence. Validator rejects unscoped assertions and unsupported source names, including first messages and follow-ups; it records validation errors for the existing approval gate. The regex validator is a bounded English guard, not a semantic guarantee over every possible paraphrase/language (UNVERIFIED).

### Fixtures and tests

Nine offline test files passed (zero failures), including existing enrichment/strategy regression suites. The signal suite replays the five historical benchmark fixtures and 20 golden synthetic cases, plus partial-failure and wording assertions. Initial test-runner spawn EPERM was a sandbox restriction; the same offline suite passed with process spawning allowed. No live AI/provider requests were made by the tests; mocks exercised provider-handling code.

Benchmark verdicts: 167 strong/template warning; 445 unclear; 446 unclear; 447 unclear; 449 weak. These are local replays of October 5 saved responses, not fresh live-site tests. Template marker extraction for 167 passes; its future database warning is proposed SQL and not live-verified.

Synthetic coverage includes explicit Maps absence, unknown listings, missing checks, timeout/reset/403/non-HTML, JS shell, template, functional/no routes, strong/form, blocked cross-domain redirect, truncation, social-only records including a Facebook URL in the website field, stale/future checks, failed fetch despite listing absence, outdated copyright, phone route, and contradictory listing results. Integration tests cover profiles, generic fallback, approved-benefit angles, message/follow-up absence validation, VM-embedded runtime and graph preservation.

Command:
```powershell
node --test tests/lead-strategy/runtime.test.cjs tests/lead-strategy/qualifier-integration.test.cjs tests/lead-strategy/sample-review.test.cjs tests/lead-enrichment/runtime.test.cjs tests/lead-enrichment/observations.test.cjs tests/lead-enrichment/ai-research.test.cjs tests/lead-enrichment/native-research.test.cjs tests/lead-enrichment/linkedin.test.cjs tests/lead-enrichment/signals.test.cjs
```

### Files changed in this task

- scripts/diagnostics/model-list-matrix.cjs — isolated GET-only probe runner.
- scripts/lead-enrichment/signals.cjs — deterministic observations and signal sheet.
- scripts/lead-enrichment/worker.cjs — fetch diagnostics and signal integration.
- scripts/lead-strategy/runtime.cjs — profiles, qualifier, presence-aware consumer and absence guard.
- scripts/lead-strategy/refresh-local-runtime.cjs — refresh code only without restructuring/importing.
- workflows/06C_outreach_strategy_generator.json — embedded runtime in nine existing Code nodes.
- database/migrations/016_signal_sheet.sql — proposed, unapplied SQL.
- tests/lead-enrichment/signals.test.cjs and fixtures/benchmark-signals.json.
- tests/lead-strategy/qualifier-integration.test.cjs and fixtures/signal-graph-before.json.
- tests/lead-strategy/runtime.test.cjs — explicit presence in the existing fixture.
- documentation/local-signal-qualifier/ — this report, ten raw probe logs, matrix summary and offline results.

06C nodes updated: Prepare Strategy; Validate and Assemble Draft; campaign Validate; request Validate; batch Validate; approval Validate; report Validate; preview Validate; Build Preview. Only their embedded runtime code changed. Node IDs, modes, other parameters, connections, sticky notes, workflow settings and gates were checked against the pre-task snapshot. No 06A/06B graph changes were necessary: 06A uses the external worker. A future authorized rollout must include the new signals.cjs dependency alongside worker.cjs. Nothing was imported.

### Remaining UNVERIFIED

- SQL execution and future live trust-warning/persistence behavior; migrations were not applied.
- Production deployment, real n8n execution of changed code, refreshed website contents and inference behavior.
- Exact cause of the 120.5-second cancellation outlier and long-term effectiveness of scoped IPv4; connection success does not prove model success.
- Provider-side billing/idempotency for ambiguous POST retries; such retries are not recommended without reconciliation/coverage.
- Yellow Pages/provider payload variants not present in fixtures; absent/unrecognized fields remain unknown. No new actor schema was invented or actor run performed.
- Working submission, phone ownership, permissions, business identity, rendered JS content and broad semantic quality/wording detection.

Deployment and migration application require separate explicit approval. This report is not a request to execute them automatically.
