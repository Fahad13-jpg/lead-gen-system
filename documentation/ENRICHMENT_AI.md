# Evidence-constrained AI interpretation

Implementation status, 2026-10-04: local implementation and offline tests only.
Not deployed to Docker or tested against the customer's Groq account.

The research worker optionally appends `ai_research` to its existing output.
It preserves deterministic research, verified-contact status and outreach gates.
The 06B workflow invokes this worker; AI is not a separate n8n agent node.

The provider is Groq, model `openai/gpt-oss-120b`. The previous
`llama-3.3-70b-versatile` was retired for free/developer accounts on August 16,
2026: https://console.groq.com/docs/deprecations. The remaining legacy model
nodes in 06C/08/09 still need migration and integration testing.

## What it adds

- Selects relevant excerpts from collected website descriptions, service headings,
  matched LinkedIn profiles and recent posts.
- Suggests campaign fit and outreach angles only when a campaign offer exists.
- Labels all interpretations as hypotheses requiring review.
- Preserves unknowns rather than filling in missing company details.
- Attaches source URLs and author metadata in code, not from model-generated URLs.
- Validates exact excerpts and evidence IDs; malformed/truncated responses are rejected.
- Records provider token usage when available, without inventing dollar cost estimates.
- On provider failure, retains the original evidence-based enrichment result.

Citation validation does not prove semantic correctness or source truth. A real
excerpt can be misleading out of context; human review and live quality evaluation
remain necessary. Model-generated unknowns are advisory too. This is interpretation
of collected evidence, not wider-web AI search. No arbitrary browsing tools are given
to the model. Personal-profile posts remain distinct from company posts.

## Configuration and rollout prerequisites

Disabled by default. Migration 011 adds a database opt-in and monthly request
allowance, initially disabled with zero allowance. The scheduled worker requires
a valid leased research task, an atomic quota reservation and `GROQ_API_KEY` in
its environment. An environment flag alone cannot enable scheduled AI calls.
The standalone analyzer's explicit enable option is for controlled tests.
No secret is embedded in JSON or source files.
An n8n Groq credential does not automatically populate this environment variable.
Deploy `ai-research.cjs` together with `worker.cjs`; do not deploy only the worker.

Before enabling scheduled production use, validate account/model access, configure
an approved allowance separate from Apify, and evaluate generated research on
representative leads. Reserved attempts, including failures and ambiguous calls,
consume the allowance. Duplicate reservations for a lease are denied. The module
bounds input, output and timeout, but request quotas are not dollar spending caps.
It makes no automatic paid retry. Free-tier use also needs token/rate-limit handling;
the customer requested free options, so do not enable a paid plan by implication.
Existing completed research will follow the existing freshness policy; deployment
does not force all leads to be reprocessed.

## Tests

`node tests/lead-enrichment/ai-research.test.cjs` exercises disabled/no-key/no-evidence
gates, request model, citation and quote rejection, missing campaign, source author
attribution, provider errors, invalid/truncated output and input preservation.
These are mocked-provider tests, not proof of real model output quality or API compatibility.
The existing enrichment runtime and LinkedIn adapter tests also passed during this change.

Migration 011 was applied to the isolated test database only. Rollback SQL tests
passed for disabled controls, zero quota, invalid leases, valid reservations,
duplicate reservations and exhaustion. Production worker and database are unchanged.
The running container's environment key returned HTTP 401 invalid_api_key.
The separate n8n credential check failed without confirming its validity.
No live generation was performed. Groq documents GPT-OSS 120B and 20B free-plan
limits at https://console.groq.com/docs/rate-limits; account limits must be checked.

## Updated key and live provider check, 2026-10-04

The replacement key in the local `.env` returned HTTP 200 from the Groq model
list, including `openai/gpt-oss-120b`. Two live requests used synthetic clinic
evidence, not stored customer leads. Token totals were 1,113 and 1,262 (2,375 total).
The first result used an unsupported "needs" formulation in a hypothesis;
the prompt was tightened to request optional demonstrations and questions without
asserting missing capabilities. The second returned sourced excerpts and tentative
product-fit suggestions and preserved missing budget, decision-maker and timing.
Both passed structural/citation checks; this is not a guarantee of semantic accuracy.
The mocked-provider regression tests passed again.

The new key has not been loaded into the running container; Docker has not been
recreated. AI worker/migration deployment and automatic scheduling remain pending.
API access does not establish the account billing tier. No outreach was sent and
no production lead records were modified. The private latest synthetic result is
stored at `.local/enrichment-ai/synthetic-live.json`.

## Docker deployment and worker integration, 2026-10-04

Migration 011 is now installed in the production database with AI disabled and
zero allowance. A pre-migration database dump is in the PostgreSQL container at
`/tmp/before-ai-011.dump`. The AI module and updated worker are installed in the
persistent enrichment-stage directory, with `worker.cjs.pre-ai` as the worker backup.
Only n8n was recreated to load the new environment key; its data volume was retained.
The 06B graph continues to call the existing worker path, so no workflow reimport
was required. Updated explanatory notes in the local JSON are not reimported.

The deployed worker passed a live Groq integration test using synthetic lead 67
in `lead_gathering_test_20260926`, organization 940065. Task claiming, atomic quota
reservation, model generation, source validation, enrichment persistence and usage
recording passed. Usage: 396 input + 526 output = 922 tokens. No email verification
or outreach was performed. Test controls were restored afterward. Production lead
data was not used for this provider test. The report API and authentication,
organization scope and malformed-input checks passed after restart.

Automatic production AI remains disabled. Free-tier token throttling and a customer
allowance still need configuration before scheduled AI is enabled. This deployment
does not alter the legacy model nodes in 06C, 08 or 09.

## Native 06B research flow

The generated 06B JSON now embeds research and AI validation in Code nodes, with
Postgres nodes loading/claiming/saving tasks and an HTTP Request node calling Groq.
`native-research.cjs` is a build-time helper; it is not needed in Docker at runtime.
The research branch no longer executes `worker.cjs`. The separate website crawler
in 06A and LinkedIn collector in 06B still use external helpers.

Migration 012 adds a conservative global research throttle: one reservation per
65 seconds, at most 20 per UTC day, plus the existing monthly request allowance.
The native request limits serialized user evidence to 3,500 UTF-8 bytes and output
to 2,000 tokens. These application controls do not establish the provider account's
billing tier and do not account for other applications sharing the same Groq account.
Provider 429 responses set a 15-minute cooldown; local throttle and daily-limit
blocks preserve research and requeue the task. No automatic HTTP-node retry occurs.
Quota-disabled jobs keep deterministic research without making a model request.

Local tests cover the embedded Code nodes, references, quote validation, byte cap,
429 handling and graph links. Migration 012 and rollback SQL tests passed in the
isolated database, including cooldown/requeue and duplicate-save rejection.
The live workflow replacement must wait for actual n8n integration tests to pass.

## Native integration validation, 2026-10-05

After Docker recovered, the initial rerun found a missing temporary 06A input file.
Restaging that file resolved the setup failure. The actual isolated n8n executions
then passed for both 06A and native 06B with two leads and no external calls.
A separate live native-node test passed with synthetic evidence: one HTTP Groq
request produced validated research, the second lead was deferred by the throttle,
both lead results were preserved, and neither lead was marked email-verified.
Test AI controls were disabled again afterward. The full JSON was rebuilt with a
readable node layout; embedded-code and graph checks passed. The live test exercised
the HTTP node, not the external research worker.

Native 06B was imported under its existing workflow ID and activated after an idle
n8n restart. Migration 012 is installed in the live database. The pre-migration
dump is `/tmp/before-native-012.dump` in postgres_db; the prior workflow snapshot
is in `/home/node/.n8n/enrichment-stage/native-backup/` in n8n. Enrichment report,
authentication, organization scope and invalid-input checks passed after restart.
Normal enrichment was resumed. Automatic AI remains disabled with zero monthly
allowance, and email outreach remains inactive. Website and LinkedIn helpers remain
runtime dependencies; the 06B research/AI branch now runs inside native n8n nodes.
