# Local compatibility implementation

## Concurrent PostgreSQL validation — 2026-10-13

Four real two-session tests passed in dedicated clone `scratch_strategy_races_20261013`, using the non-superuser runtime role: distinct simultaneous claims with SKIP LOCKED; a single winner for the last monthly reservation slot; one stored plan when concurrent finish calls replay; and rejection of an approval after a concurrent content/hash change. The latter three tests explicitly observed PostgreSQL lock waits before releasing the first transaction. Raw evidence: `concurrency-results.json`. This verifies those races, not every possible concurrency scenario. No providers were called. Committed test fixtures exist only in the dedicated clone; the original scratch database and production were unchanged.

## Isolated n8n runtime — 2026-10-13

Six cases passed through actual n8n Code nodes in `strategy-v2-runtime-crypto-20261013`: template, disabled AI gate, valid mocked response, malformed JSON, truncation, and unknown reference. The test used a fresh SQLite database, networking `none`, no production mounts, no HTTP/Postgres nodes and a non-secret dummy key. The container is stopped. Results: `n8n-runtime-results.json`.

The default sandbox **failed** with `Cannot find module 'crypto'`. The successful isolated run enabled only `NODE_FUNCTION_ALLOW_BUILTIN=crypto`; production was not changed. Eventual opt-in deployment must preserve any existing builtin allowlist and add `crypto`, never use a wildcard. This validation used `N8N_RUNNERS_ENABLED=false`; task-runner-enabled deployments remain **UNVERIFIED**. The initial harness log-directory permission failure was corrected without workflow changes. This supersedes the earlier crypto-availability uncertainty below; live providers, concurrency and deployment drift remain unverified.

## Latest validation — 2026-10-12

Migration 017 is now applied **only** in network-isolated `lead_diag_pg_20261011 / scratch_strategy_v2_20261012`, restored from the saved October 11 backup. PostgreSQL exposed an IF/CASE syntax error; it was corrected before successful application. Non-superuser SQL tests passed for zero allowance, reservation reuse without extra rows, tenant checks, lease expiry, input fingerprint changes, disabled planner, v1/v2 saves, replay, authoritative database hash, fallback acknowledgement, stale/malformed approval and superseded inputs. Fixture writes were rolled back. See `scratch-017-results.txt`.

Two existing local 06C Code-node bodies now include a lazy v2 bundle. `STRATEGY_CONTRACT_VERSION=strategy_v2` selects v2; absent opt-in retains v1 without loading new dependencies. Graph, notes, modes, HTTP behavior and remaining nodes are unchanged. The actual Code bodies passed nine Node-VM mock tests; the builder is idempotent. Local native integration makes one request at most; repairs/pre-send retries are not automatically enabled in the existing native HTTP node. Hybrid campaigns must explicitly choose AI or template mode before opting into v2.

Remaining **UNVERIFIED**: actual n8n sandbox availability of `crypto`, live provider behavior, concurrent SQL races, and drift since the restored backup. No workflows were imported/activated, no production migration was applied, and no model/provider calls were made. The historical implementation notes below describe the earlier local-only checkpoint and are superseded by this validation status.

Implemented after approval to continue local work. No database or provider was contacted. No workflow JSON was edited, imported or activated.

## Changes

- `scripts/lead-strategy/v2/adapter.cjs`: injected orchestration adapter for a claimed job. Calls reservation creation once, then separately rechecks the existing reservation. Obtains expiry from the authoritative recheck result, keeps database fingerprint separate from the brief hash, forwards v2 results and usage to the finish dependency, and returns save rejection instead of claiming success. Template/fallback modes do not reserve AI. Fallback requires explicit selection. Tenant mismatches are rejected before persistence. SQL-call construction uses the existing manual quote-escaping convention.
- `scripts/lead-strategy/v2/provider.cjs`: supports an explicit `allowRepair:false` policy. Default standalone mock contract behavior remains one repair. The compatibility adapter disables repair because the current ledger reserves one provider request; a second potentially billable completion must not be hidden under that reservation.
- `database/migrations/017_strategy_v2_compatibility.sql`: **UNAPPLIED** draft. Adds a read-only reservation-context function; replaces finish to accept v1 and v2; adds fallback acknowledgement checks to the existing locked approval transaction. Retains existing job claim behavior, reservation creation, budgets, database MD5 content hashes, tenant checks, freshness checks and approval audit rows. No tables, webhooks or job states added. Explicit grants target the existing `n8n_user` role.
- `tests/lead-strategy/adapter-v2.test.cjs`: 13 mock/static compatibility scenarios.
- `compatibility-test-results.json`: raw results; all 13 compatibility and 33 contract scenarios passed.

## Important boundaries

1. The adapter is a local integration seam, **not yet embedded in 06C's nodes**. Its reserve/recheck/finish/transport dependencies were mocks. Actual native n8n transport wiring is still pending; no node graph was restructured.
2. All generated v2 plans retain `v2_offline_only`; approval therefore stays blocked. The new SQL acknowledgement check is an additional atomic safeguard for eventual reviewed integration, not permission to remove that blocker now.
3. `acknowledge_fallback=true` and `acknowledge_fallback_hash=<database content_hash>` are required when approving a fallback plan. The local SHA-256 is not the database hash. Revoke behavior is retained.
4. Existing zero allowance remains unchanged. The read-only recheck never inserts reservations or expands a quota. It rejects disabled controls, unavailable/finished reservations, expired leases and changed fingerprints.
5. Proven pre-send retry remains at most one quick retry, using the original reservation and lease. Ambiguous errors stop. Schema repair in the adapter returns `SCHEMA_REPAIR_NOT_RESERVED`; it does not send a second billable request. Supporting billable repair later needs an explicit bounded reservation-accounting design, not a relaxed gate.
6. V2 `ai_failed` is stored as a failed generation inside a completed planning job, with validation errors preventing approval. No persisted job state was added.

## Validation and remaining work

Run `node tests/lead-strategy/adapter-v2.test.cjs` and `node tests/lead-strategy/contract-v2.test.cjs` to reproduce 46 passing offline scenarios. SQL checks in the adapter suite are static checks, not PostgreSQL execution or concurrency tests.

**UNVERIFIED:** migration execution and permissions; SQL replay/concurrency behavior; deployed function drift; actual n8n dependency/transport wiring; live provider behavior; exact token usage. Scratch PostgreSQL testing is the next prerequisite before any deployment. This local-only pass did not create or modify a scratch database.

The sample-quality issues in `INTEGRATION-REVIEW.md` remain open. Compatibility checks do not prove the mocked strategies are sufficiently personalized or persuasive.
