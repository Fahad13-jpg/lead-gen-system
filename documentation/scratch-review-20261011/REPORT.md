# Scratch review D–F — completed 12 October 2026 PKT

No live database migration/write, workflow import/deployment/activation, inference call, Apify run, outreach, or trial-ledger change occurred. A fresh read-only pg_dump was restored to an isolated scratch PostgreSQL container. Source reads, migrations and SQL test fixtures thereafter used that scratch copy. Network calls were only GET /openai/v1/models. No credentials are included in these reports or logs.

## D. Round-robin connectivity

Both clients made one request per configuration in rotation for 50 rounds. There were seven configurations and 350 requests per client: 700 total, including the additional container-wide candidates. The two client runners overlapped, but each client's requests were sequential. All tests ran in scratch containers using the exact n8n image digest a284f0b366c74865ac25c83a74f0fbfaf0ad0f1fa998d357b64b50fe580b8149, on the same Docker network as the existing n8n container. No production volumes, application process, or workflows were started in scratch.

The actual installed n8n httpRequest helper and Node global fetch were used. Default Node is v22.19.0, autoSelectFamily=true, attempt timeout=250 ms. Forced IPv4 was isolated to the diagnostic process's DNS lookup, not installed into production or implemented as a new workflow transport. Native fetch retained normal pooling; n8n's helper creates its normal agents. Therefore absolute latency differences also include client behavior.

|Configuration|n8n helper success|fetch success|n8n median ms|fetch median ms|
|---|---:|---:|---:|---:|
|Default|28/50 (56%)|26/50 (52%)|597|533|
|Forced IPv4|45/50 (90%)|43/50 (86%)|2163|2126|
|autoSelectFamily disabled in diagnostic process|44/50 (88%)|44/50 (88%)|1643|1360|
|Attempt timeout 1500 ms in diagnostic process|41/50 (82%)|37/50 (74%)|1307|1483|
|Scratch container IPv6 disabled via sysctl|45/50 (90%)|46/50 (92%)|1391|1550|
|Scratch NODE_OPTIONS disables auto-selection|46/50 (92%)|45/50 (90%)|1274|1446|
|Scratch NODE_OPTIONS attempt timeout 1500 ms|38/50 (76%)|37/50 (74%)|1235|1677|

Verified supported flags: --no-network-family-autoselection and --network-family-autoselection-attempt-timeout=1500. Process metadata confirms the resulting false/1500 settings. sysctl net.ipv6.conf.all.disable_ipv6=1 and net.ipv6.conf.default.disable_ipv6=1 were applied only when creating the dedicated scratch container; its procfs reports disabled=1. Baseline/container-wide configuration metadata and routes are in the first seven records of each JSONL log.

The production read-only route inventory and baseline scratch routes have only IPv6 loopback, with no usable IPv6 default/external route. The ::/0 loopback entries are reject/unreachable entries, not usable external routes. Observed failed IPv6 attempts explicitly record family=6, syscall=connect, code=ENETUNREACH. IPv4 timeouts are separate; the absence of an IPv6 route does not explain every failure.

### Error classes

Counts below count each class once per request; ETIMEDOUT and ENETUNREACH appear together in aggregates and must not be added as separate failed requests. fetch TypeError wrappers are excluded from this compact breakdown.

|Configuration|n8n errors|fetch errors|
|---|---|---|
|Default|22 timeout/unreachable pairs|23 timeout/unreachable pairs; 1 EAI_AGAIN|
|IPv4|3 ECONNRESET; 2 ERR_CANCELED|2 ECONNRESET; 5 UND_ERR_CONNECT_TIMEOUT|
|Selection disabled|1 ECONNRESET; 5 ERR_CANCELED|1 ECONNRESET; 4 UND_ERR_CONNECT_TIMEOUT; 1 DOMException code 23 deadline event|
|1500 ms attempt|9 timeout/unreachable pairs|13 timeout/unreachable pairs|
|IPv6 sysctl disabled|3 ECONNRESET; 2 ERR_CANCELED|4 UND_ERR_CONNECT_TIMEOUT|
|NODE_OPTIONS disabled|4 ECONNRESET|1 ECONNRESET; 3 UND_ERR_CONNECT_TIMEOUT; 1 EAI_AGAIN|
|NODE_OPTIONS 1500 ms|12 timeout/unreachable pairs|13 timeout/unreachable pairs|

Failures still cluster despite interleaving. n8n default failed in rounds 11–26, 18:47:35–18:58:21 UTC; fetch default failed in rounds 18–32, 18:48:21–18:58:27. fetch IPv4 failed in rounds 27–31, 18:54:20–18:57:40. Raised-timeout and container-wide variants also overlap that degraded interval. Consecutive rounds are separated by six other configurations, making this stronger evidence of a time-correlated condition than the earlier sequential-block run. It is not proof of a single cause or a production guarantee. The earlier 100/100 IPv4 result did not reproduce.

Raw evidence: fetch-interleaved.jsonl, n8n_http-interleaved.jsonl, interleaved-summary.json. All 14 client/configuration groups contain exactly 50 distinct rounds.

### Blast radius and recommendation — nothing applied

|Candidate|Groq|Apify/Abstract|Website crawling|
|---|---|---|---|
|Request-scoped IPv4 transport for Groq|Only targeted requests|Unchanged|Unchanged|
|Process-wide Node auto-selection flags|All applicable Node Groq calls|Can affect their Node clients|Can affect unpinned Node calls; existing publicPage already pins an IPv4 address|
|Container-wide IPv6 sysctl|All clients in that container|All relevant networking in that container|All relevant networking in that container|

Recommend a request-scoped IPv4 candidate for further controlled validation because it avoids the broken IPv6 path with the smallest blast radius. Do not recommend deploying it as a proven fix: it still failed 10–14% here. The small success advantage of two container-wide candidates is not enough to justify changing all outbound networking. n8n's existing HTTP node does not expose arbitrary agent options; its exact narrow integration remains UNVERIFIED and is not implemented. No structural transport redesign is proposed as an automatic next action.

### Proven pre-send versus ambiguous

Both clients expose useful syscall data on DNS/connect failures. Axios has nested errors/cause; fetch often reports TypeError with nested cause/errors. Examples include getaddrinfo/EAI_AGAIN and connect/ETIMEDOUT or connect/ENETUNREACH. Socket observations corroborate failures before TCP/TLS establishment in many attempts. Resets, Undici connect timeouts and cancellations often have no syscall. Some reset/cancellation records have an established connection; they cannot be treated as safely unsent from the error code alone.

n8n's header_queued can be true even when TCP never connected: _headerSent means serialization/queueing, not proof that bytes reached the provider. Conversely, absence of a new secureConnect event can mean fetch reused a pooled connection. Raw logs contain a field named pre_send_proven from the diagnostic heuristic; **treat this as pre-send evidence for the failed connection attempt only, not proof that the whole logical call was never sent**. The summary explicitly records that limitation. Neither these error objects nor the current instrumentation fully establish every pooled/retried logical request's send history. No TLS-handshake failure was independently proven by a specific TLS error in this run.

Proposed retry rule (not implemented):
1. Recheck the same valid lease, input fingerprint and reservation; never claim a new lease or create a second reservation for a transport retry.
2. Retry any HTTP method, including a model POST, only when every transport attempt is proven pre-send: DNS failure before opening a connection, all connect attempts failing before TLS, or an instrumented TLS handshake failure with zero application bytes sent and no earlier pooled/redirect/retry attempt dispatched. Error names alone are insufficient.
3. At most three total attempts; full-jitter delays Uniform(0,min(4000,500*2^retry_index)) ms. Bound each attempt and the whole operation by the remaining lease time, reserving time to persist its result.
4. A read timeout, reset after possible dispatch, 429/5xx response, cancellation without a known phase, or unknown earlier send history is ambiguous for a billable call. Reconcile with an existing provider run/idempotency reference if supported; otherwise stop. Never blindly retry or exceed the existing reservation.

Provider reconciliation/idempotency support and complete transport-phase instrumentation are UNVERIFIED. This policy does not modify budgets, retry counts in existing workers, or the trial ledger.

## E. Scratch migration

Database: **scratch_lead_diag_20261011** in lead_diag_pg_20261011 (same postgres:15 image digest as production). It has network=none and no published ports. The newest completed pre-existing local backup was October 5; a fresh read-only custom-format backup was taken for this test so current functions/data were included. The private backup remains under .local/scratch-diagnostics-20261011. No backup data was printed.

The original local 016 applied successfully. The revised stamped-source version then also applied successfully. Migration now has six function definitions, no new tables/webhooks/columns. No permission errors occurred under scratch owner n8n_user (superuser). Restricted-role behavior outside this owner setup remains UNVERIFIED.

SQL checks passed:
- enrichment_source_checks is org-scoped; a mismatched organization returns [].
- SQL and JavaScript stamps match exactly on all 84 stored Maps/Yellow Pages records.
- Adding source checks changes all 43 pre-existing profile fingerprints. Existing profiles become stale until normal reprocessing; this is not an automatic backfill.
- The backup has **zero existing strategy plans**. A rollback-only synthetic plan bound to the old context fingerprint was rejected with STALE_PLAN after the new fingerprint was restored. Content/approval gates were not relaxed.
- Lead 167's stored HTML was replayed locally; that result was supplied only to the scratch fixture. SQL returns website_presence=present and template_site_suspected in warnings, with conflicts unchanged.
- Fresh stamped results for 445/446/447 return website_presence=none_found in scratch SQL. These mean absence in their detailed stored Maps records.
- strategy_context forwards signals and provenance inside basic JSON.
- A failed basic fetch retains pages[0].error_class=ETIMEDOUT in existing profile JSON and in attempt history; job returns to pending with the same attempt count under existing retry rules. Trust returns unknown, not none_found.
- A stale lease is rejected; PUBLIC execute is not exposed on the new stamp function; the owner can execute it.

All test fixture rows/function substitutions were rolled back. Final checks show zero synthetic jobs, zero plans and zero approvals. Migration functions remain in the scratch database only. See sql-check-results.txt, migration-apply.txt and scratch-after-migration.json. The latest SQL is ../../database/migrations/016_signal_sheet.sql.

## F. Source stamping, social-only and labelling

Versioned source checks carry stamp_version, source URL/time, detail_level, original website-field state, result, reason, social profiles and limitations. They are computed for the worker and retained in existing basic.signals.web_presence.checks; no new table is used. The existing fingerprint incorporates these stamps.

**Maps rule:** an explicit valid website remains present (Facebook/Instagram becomes social_only). Missing/null/empty website becomes none_found only with a Maps source URL, placeId, title, address, categoryName, nonempty openingHours, numeric nonnegative integer reviewsCount, both closure booleans and a valid scrapedAt, with no contradictory saved website. Otherwise unknown. This is a conservative observation of a detailed stored listing, not independent proof about the current live listing or every possible website. Provider omission guarantees/current listing contents remain UNVERIFIED; wording stays scoped.

**Yellow Pages:** explicit websites are supported by the stored records; profileUrl/sourceUrl and reviewCount are now handled rather than incorrectly expecting Maps-style url/reviewsCount. There are no negative stored examples establishing missing/null semantics. Even detail-level records without a website remain unknown. This conservative fallback is tested.

**Yelp:** no stored Yelp records were found and no Yelp workflow was identified in the workflow folder. Its absence schema is UNVERIFIED and remains unknown; no actor schema was invented.

|Source|Records checked|Website present|None listed in detailed record|Unknown|
|---|---:|---:|---:|---:|
|Maps|74|40|30|4|
|Yellow Pages|10|10|0|0|
|Yelp|0|0|0|0|

Leads 445–447 pass the Maps detail gate despite an omitted website key. Four sparse Maps records (staging 20, 27, 44, 117) remain unknown. All 84 records were checked, exceeding the three requested leads plus 30 additional records. Static golden fixtures and SQL/JS parity checks cover the complete cohort. No live listing verification was performed.

social_only is now a distinct signal state when only Facebook/Instagram evidence exists and there is no competing company-site evidence or failed site-fetch attempt. Its website-presence qualifier is strong, while trust.website_presence can remain unknown: social evidence is not proof of a standalone website or of its global absence. Gates and execution authorization remain unchanged. Scoped draft wording is: “In the records checked, I found a Facebook page but couldn't find a website. Is there one?” It uses only the platforms actually evidenced, and the absence validator still rejects unscoped “you don't have a website.” Missing social provenance, stale assessments and conflicts remain conservative.

### CSV for human labelling

**website-pitch-labelling-30.csv** contains 30 real linked leads: 20 Maps and 10 Yellow Pages, including 167/445/446/447/449. Columns are name, category, city, source, lead_id, web_presence state, key signals, qualifier verdict, and the requested blank human label.

States: one template_unfinished, three none_found, one strong and 25 unknown. Unknown values are deliberate where stored metrics/evidence are missing or old; no fresh fetch or fabricated observation was used. Leads 167/449 use the saved October 5 HTML replay, explicitly labelled in key signals. All 30 human cells are blank. **No human assessment or evaluation score was generated.** An independent CSV parser verified 30 rows, nine columns and blank human labels. labelling-manifest.json records the IDs and source/state counts.

### Tests and changed files

Ten offline regression test files passed, including five historical benchmark cases, 20 synthetic signal cases, the 84-record source-stamp cohort, sparse/null/contradictory input cases, social-only fixtures and scoped wording checks. SQL checks passed separately in scratch with rollback-only fixtures. No provider calls occurred in unit tests.

Changed implementation:
- scripts/lead-enrichment/source-checks.cjs (new) and source-stamp.sql (new).
- scripts/lead-enrichment/signals.cjs; scripts/lead-strategy/runtime.cjs.
- database/migrations/016_signal_sheet.sql (scratch-tested, not live-applied).
- workflows/06C_outreach_strategy_generator.json: embedded runtime refreshed in the same nine existing Code nodes; structure, modes, other parameters, notes and gates unchanged.
- tests/lead-enrichment/source-stamping.test.cjs, fixtures/source-stamping-stored.json (new); signals.test.cjs updated for social_only.
- tests/lead-strategy/qualifier-integration.test.cjs: status-message clarification only.
- scripts/diagnostics/scratch-environments.cjs, interleaved-connectivity.cjs, scratch-database.cjs, check-scratch-migration.cjs, summarize-interleaved.cjs, export-labelling-sheet.cjs (new).
- documentation/scratch-review-20261011/: raw evidence, summaries, migration results, CSV and this report.

### Remaining UNVERIFIED and next decision

- Live deployment and refreshed real-world results; nothing was deployed.
- Production reliability after any networking candidate; interleaving disproved a guarantee from the earlier perfect sample.
- End-to-end pre-send proof for pooled/retried calls and provider reconciliation/idempotency.
- Live/provider omission semantics beyond the observed stored Maps detail shape; Yellow Pages negative cases; Yelp schema.
- Restricted-role migration behavior beyond the scratch owner; existing-plan migration effects on real plans (none exist in the backup), though a synthetic stale-plan check passed.
- Form functionality, business identity and channel permission; social-only/fit labels do not verify these.
- Human fit accuracy: labels are deliberately blank and no score was calculated.

All five labelled scratch containers were stopped after testing. The scratch database and local evidence are retained for review; production containers were not stopped or modified.

Recommended next step is human labelling of the CSV plus review of the scratch-tested SQL and phase-aware retry design. Any deployment, live migration or networking change requires separate explicit approval.
