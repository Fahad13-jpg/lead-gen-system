# H1–H5 review — 12 October 2026 PKT

Scope: local changes and isolated scratch databases/services only. No live migration, workflow import/activation, model completion, Apify run, outreach or trial-ledger change. Read-only production role/function metadata was inspected. All SQL fixtures were rolled back. The rollout runbook is written, not executed.

## H1 — owners, roles and explicit grants

n8n's PostgreSQL connection environment uses **n8n_user** against lead_db. Its decrypted credential export was parsed in memory: the `Lead Database` PostgreSQL credential also uses n8n_user/lead_db; the separate gathering-test credential uses n8n_user/lead_gathering_test_20260926. Only role/database metadata was saved. Helpers use DB_POSTGRESDB_USER from that same container environment, therefore n8n_user. Production n8n_user is currently SUPERUSER, CREATEDB and CREATEROLE.

|Function signature|Production owner|Permission-test owner|
|---|---|---|
|enrichment_ai_gate(bigint,text)|n8n_user|h_owner_20261012|
|enrichment_ai_record(jsonb)|n8n_user|h_owner_20261012|
|enrichment_ai_reserve(bigint,text)|n8n_user|h_owner_20261012|
|enrichment_claim(text,integer)|n8n_user|h_owner_20261012|
|enrichment_fingerprint(integer,integer,text)|n8n_user|h_owner_20261012|
|enrichment_finish(jsonb)|n8n_user|h_owner_20261012|
|enrichment_linkedin_reserve(bigint)|n8n_user|h_owner_20261012|
|enrichment_linkedin_settle(bigint,numeric)|n8n_user|h_owner_20261012|
|enrichment_native_finish(jsonb)|n8n_user|h_owner_20261012|
|enrichment_project_legacy()|n8n_user|h_owner_20261012|
|enrichment_report(integer,integer)|n8n_user|h_owner_20261012|
|enrichment_report_evidence_v1(integer,integer)|n8n_user|h_owner_20261012|
|enrichment_submit(jsonb,text)|n8n_user|h_owner_20261012|
|enrichment_task_input(bigint,text)|n8n_user|h_owner_20261012|
|lead_trust_report(integer,integer)|n8n_user|h_owner_20261012|
|enrichment_stamp_source(text,jsonb,text)|Not deployed|h_owner_20261012|
|enrichment_source_checks(integer,integer)|Not deployed|h_owner_20261012|

Production functions in this inventory are invoker-security functions. Full production ACLs and the earlier scratch owners are in `function-roles.json`.

A fresh copy of the saved backup was restored into **scratch_h_permissions_20261012**, in the isolated PostgreSQL container. `h_owner_20261012` is NOLOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE and NOINHERIT. It owns the copied application objects, matching production object-owner rights without superuser powers. Migration 016 was successfully applied under SET ROLE to this role. A second role, `h_runtime_20261012`, has explicit schema USAGE, table DML, sequence USAGE/SELECT and EXECUTE on pre-existing functions, without ownership or superuser rights.

The second role reproduced **permission denied for new source functions** after migration. Explicit GRANT EXECUTE on both functions fixed it. Migration 016 now explicitly grants these two functions to production's existing n8n_user, covering a separate migration owner while preserving PUBLIC revocation. Scratch tests use the equivalent explicit grant to h_runtime_20261012; no production grants were changed.

Both roles passed the complete chain: fingerprint → source_checks → task_input → finish → lead_trust_report → enrichment_report → strategy_context. This tests two practical privilege models, not a recommendation to keep production's superuser role. Evidence: `role-apply.txt`, `sql-fuzz-role-results.txt` and the reproducible scratch role runner.

## H2 — SQL fuzz hardening

Migration 016 uses CASE-guarded array operations for pages, evidence, services, quality_flags, social Facebook/Instagram arrays, source checks and research LinkedIn profile arrays. JSON null, string, object and missing fields no longer reach unguarded array operators. Malformed basic profiles return website_presence unknown with a malformed_basic_evidence warning. Malformed basic worker results return failed and preserve the last good profile; diagnostics remain in attempt history. Invalid ID/envelope shapes are rejected before casting. No broad exception handler hides permission or database errors.

The SQL suite ran **50 malformed scenarios under each of two non-superuser roles**, plus the valid full chain. It covers each listed basic array and nested signals container in four malformed forms, malformed/missing Maps openingHours, scalar/null/array envelopes and invalid IDs. All passed without unexpected exceptions. Valid output and stored good evidence were asserted, not merely absence of errors. Fixtures rolled back. Invalid lexical JSON that cannot be parsed into a PostgreSQL jsonb argument is outside this payload-shape test.

## H3 — written rollout and tested pause mechanisms

`ROLLOUT-016-NOT-EXECUTED.md` contains preconditions, UI deactivation instructions with exact workflow/schedule names, fresh backup and saved-function commands, helper installation and migration commands, permission/fingerprint checks, the exact 43-lead allow-list, basic-only batches, cost/ledger comparisons and rollback.

Scratch SQL confirms enrichment_controls.enabled=false prevents basic and research claims. The actual LinkedIn advance helper, with a disabled-control mock, returns paused before any provider call. Basic-only claiming with an allow-list leaves research task rows unchanged. These tests passed and rolled back; UI workflow deactivation itself was not exercised because activation/import changes are forbidden. There is no separate existing research-only database switch: the runbook keeps 06B inactive while 06A runs. Disabling LinkedIn reservation controls alone does not stop polling already-running jobs.

## H4 — scratch IPv6 service test

The proposed production change is only the two n8n sysctls in `compose-ipv6-PROPOSED.diff`; it has **not** been applied. An isolated Compose project, hreview20261012, was created with two same-image n8n services, dedicated fresh Postgres databases, no production volumes, no provider keys and only loopback ports 12878/12879. One service uses default networking; the other disables IPv6 through Compose sysctls. n8n's own scratch schema initialization is not an application schema redesign.

**PENDING/UNVERIFIED:** the first service readiness attempt did not complete successfully, and Docker Desktop's Linux engine subsequently became unavailable. Service boot, UI, database readiness, actual helper execution and a fresh interleaved service probe must not be reported as passed until the engine is available and the runner completes. Earlier G3 Node-only probe results do not substitute for this service test.

Even after service readiness succeeds, only the webhook HTTP router can be tested here with an unregistered route. A successful registered workflow webhook would require import/activation or a new webhook, which conflicts with the scope; that remains UNVERIFIED. No workflow was imported or activated in the service test.

## H5 — clearly labelled simulation

`SIMULATED-basic-refresh-30.csv` lists the same 30 lead IDs, with simulation method, historical HTML capture date, hypothetical assessment time, unchanged source-stamp date, simulated state/verdict and blank human-label column. No fresh website fetch, model call or provider run occurred.

Result: **one template_unfinished, one strong, three none_found and 25 unknown**. Lead 167's captured HTML yields template_unfinished; 449's yields strong. Two leads have historical HTML replay, 12 have no website URL to fetch, and 16 lack stored HTML and are explicitly marked UNVERIFIED/not simulated rather than inventing a page or fetch failure. Source-only simulations retain original source dates and the 30-day window. No human labels or evaluation scores were assigned. Row-level evidence is in `simulated-refresh.json`. An independent CSV parser confirmed 30 rows and blank human-label cells.

The existing 11-file offline regression suite also passed (zero failures). Its provider interactions are mocked; this is not evidence of live provider schema compatibility.

## Files and remaining limits

Changed: `database/migrations/016_signal_sheet.sql` (CASE guards, malformed input handling, explicit source-function grants); `scripts/diagnostics/connectivity-control.cjs` (exports its diagnostic worker only). Added diagnostic scripts `h-permissions.cjs`, `h-role-test.cjs`, `h-sql-tests.cjs`, `h-pause-tests.cjs`, `h-service-test.cjs`, `h-service-probe.cjs`, `h-simulated-refresh.cjs`, isolated `h-scratch-compose.yml`, and this report directory. No workflow JSON was changed for H1–H5.

UNVERIFIED: H4 until successful service tests; registered webhook execution under the scope restriction; live production deployment; current website truth from historical HTML; missing HTML for other website-bearing leads; provider schemas/prices/billing-cap enforcement and complete pre-send proof. Non-superuser SQL behavior is now tested, rather than left unverified.
