# Strategy contract v2 — offline implementation

Built locally on 2026-10-12. No model calls, Apify calls, database access, migrations, workflow imports/edits, activation, deployment, sending, or trial-ledger changes. Existing v1 runtime, qualifier, workflow graph, billing, leases and approval SQL are unchanged.

## Delivered

- Compact brief: authoritative qualifier verdict and candidate angles; readiness-derived allowed/blocked channels and reason codes; approved campaign content; fact IDs, source URLs, ages, polarity and labelled untrusted text. Control/format characters are stripped and excerpts are capped at 200 characters. Current, dated matched-profile evidence can also enter; stale/conflicted evidence cannot become a present claim.
- Exact system prompt: `prompt.txt`. Exact output schema: `output.schema.json`. The transmitted system message is this prompt followed by `\nOUTPUT_SCHEMA\n` and the compact JSON serialization of the schema. The user message is the compact JSON serialization of each sample's `brief`.
- Single response: fit annotations, candidate angle selection, permitted channel plan, best-channel step 1, internal follow-up intents, call guidance, review flags and personalization level. Fit remains deterministic.
- Typed outgoing parts: observed quotations, approved benefit text, or controlled non-claim copy. This prevents undeclared claims hidden in otherwise free prose. Unknown IDs, absence-polarity citations, invented claims, unscoped absence, disallowed URLs, prohibited phrases, missing opt-out, wrong channels and length violations fail closed.
- `ai_completed`, `ai_failed`, `template_completed`, `template_fallback` states; explicit fallback request and acknowledgement bound to the local plan hash. AI failure never silently becomes template success. Method, model, prompt version, attempts, known token usage and usage completeness are recorded.
- Mockable provider wrapper with configurable reasoning effort/completion cap, JSON output, truncation rejection, one schema/JSON repair, and at most one quick transport retry across an operation. Quick retry requires explicit all-attempts pre-send instrumentation, no pooled/redirected/prior dispatch, the same reservation/fingerprint and an unexpired lease. Error code alone never suffices. Ambiguous failures stop for reconciliation. No waiting_provider state.
- Draft-only call brief and WhatsApp artifact. No sending interface exists in v2.
- Blind A/B review renderer and rating rubric; ratings remain blank. All default AI responses are hand-authored **MOCKS**, not measured model output.

## Integration boundary

This is a tested offline contract module, not a deployed or wired replacement for 06C. `build(input)` derives the current readiness from the existing runtime. Its optional readiness snapshot is a trusted adapter/testing seam, never a dashboard-controlled permission grant. Suppression, replies and existing exclusion/conflict reasons still block even a synthetic ready snapshot.

The injected provider gate must check the existing zero allowance, cancellation, reservation capacity for both initial and possible repair output, lease and hash before every attempt. The default gate is closed and the wrapper has no HTTP client or credential loader. Nothing reserves or extends credits. Real transport instrumentation and production gate integration remain **UNVERIFIED**.

Every generated plan carries `blocking_reasons: ["v2_offline_only"]` and `execution_authorized: false`. `approvalPreflight` tests fallback acknowledgement and local content integrity but **never approves** a plan. The local SHA-256 is not a substitute for PostgreSQL's existing authoritative hash/approval transaction. Before eventual integration, existing approval SQL must additionally enforce fallback acknowledgement atomically against its authoritative plan hash. No migration was written or applied, and that blocker has deliberately not been removed. v1 remains readable without conversion.

## Current quality update

Prompt v2.2 adds required weak/unclear-fit review flags and separates traceable quotations from offer relevance. Approved customer rules prioritize useful evidence within the existing cap. Weak-fit templates have no routine follow-ups; irrelevant quotations are flagged rather than treated as proof of need. 52 offline scenarios passed (33 contract, 13 adapter, 6 quality). Updated mocked samples remain unscored. No live validation or workflow integration was performed.

## Benchmark samples

Each full JSON file includes the brief, template plan, mock AI plan and a separate mock plan using actual blocked channel readiness. Only the illustrative draft pair uses explicitly synthetic ready WhatsApp/call channels.

| Lead | Fit from these saved fixtures | Estimated brief tokens | Estimated full request tokens |
|---|---|---:|---:|
| 167 | strong — template-site assessment | 761 | 2,434 |
| 445 | unclear — stored website result unknown | 528 | 2,200 |
| 446 | unclear — stored website result unknown | 528 | 2,201 |
| 447 | unclear — stored website result unknown | 535 | 2,207 |
| 449 | weak — established website/inquiry evidence | 822 | 2,494 |

Files: `lead-167.json`, `lead-445.json`, `lead-446.json`, `lead-447.json`, `lead-449.json`. These are historical fixture replays, not current live database assessments. The older fixtures' expected-fit labels for 445–447 say strong, but their stored source checks say unknown. The actual qualifier consequently produces unclear; the samples retain both labels so the discrepancy is visible.

Token estimates use UTF-8 bytes / 3 and are **UNVERIFIED** model token counts. Briefs enforce a default hard ceiling of 2,500 UTF-8 bytes, a conservative upper bound under a byte-fallback tokenizer. A verified tokenizer can be injected with the same 2,500-token ceiling. Evidence is pruned to fit; required campaign/gate content is never silently removed, and an oversized required brief is rejected. Sparse evidence is not padded to 1,500 tokens. The full prompt+schema+brief estimates land around 2.2–2.5k; the hard brief ceiling does not represent a verified full-request model-token ceiling. Sample response usage (1,800/550/2,350) is fabricated mock telemetry, not measurement.

## Validation

33 v2 offline scenarios passed, including all five benchmarks, thin/unassessed evidence, template/social-only, suppression/replies, conflicts, prompt injection, Unicode, long facts, unknown refs, hypotheses in outgoing claims, absence rules, schema repair, truncation, pre-send retry bounds, lease expiry, wrong hashes, fallback acknowledgement, v1 reading and dated profile evidence.

Four existing suites passed: runtime, qualifier integration, qualifier hardening and sample review. They also check native graph/sticky preservation. Raw scenario names/results are in `test-results.json`.

Commands:

```text
node tests/lead-strategy/contract-v2.test.cjs
node scripts/lead-strategy/v2/render-review.cjs
node -e "require('./tests/lead-strategy/runtime.test.cjs');require('./tests/lead-strategy/qualifier-integration.test.cjs');require('./tests/lead-strategy/qualifier-hardening.test.cjs');require('./tests/lead-strategy/sample-review.test.cjs')"
```

## Files added

- `scripts/lead-strategy/v2/`: `contract.cjs`, `provider.cjs`, `schema.cjs`, `prompt.txt`, `fixtures.cjs`, `render-review.cjs`.
- `tests/lead-strategy/contract-v2.test.cjs`.
- `documentation/strategy-contract-v2/`: this report, exact prompt/schema, five complete sample JSONs, `token-estimates.json`, `test-results.json`, `blind-review.html`, separate `blind-key.json`, `RATING-RUBRIC.md`.

No existing workflow node or SQL file changed for this task. No new table, webhook or persisted job state.

## UNVERIFIED and limitations

- Real provider compatibility, reasoning setting behavior, hidden reasoning consumption, safe completion budget, latency, failure rates and model quality. The configurable 6,000 completion-token default is a local configuration choice, not a verified provider guarantee.
- Real model resistance to prompt injection: isolation, sanitization and validator behavior were tested, not an actual model. Prompt text inside a source remains data.
- Exact provider tokenization/full-request token counts; see the conservative brief bound above.
- Free paraphrasing of business claims is deliberately not accepted. The AI can annotate fit, select an angle/channel, arrange supported message parts and propose internal intents. It cannot write arbitrary uncheckable outgoing factual prose. This is the explicit price of deterministic claim validation, not proof that an arbitrary natural-language sentence is true.
- Non-English evidence is preserved, but the supplied operational copy is English. Other languages require reviewed localized copy and receive a mandatory language-review flag; finished multilingual outreach is not claimed.
- Source excerpts remain observations, not independent verification of ownership, accuracy or business need. A fact's provenance does not make the website's claim true.
- Workflow/provider/atomic approval integration remains unimplemented pending a separately authorized integration task. Current zero allowance and all existing gates remain unchanged.

No deployment is proposed as part of this task. Review the artifacts before requesting integration.
