# 06C outreach strategy generator — technical handoff

Prepared 11 October 2026, Asia/Karachi. Live status checked at 10:52 PKT in a
read-only PostgreSQL transaction. This is a report, not approval to redesign,
activate providers, spend additional credits or send outreach.

## 1. User's actual requirement and the central problem

This is an n8n + PostgreSQL, multi-tenant B2B lead-generation final-year project
for small and medium organizations. Gathering, cleaning, verification and
enrichment precede 06C. Flutter is planned; an existing React UI is out of scope.
The user has a Retell calling agent, not yet integrated.

The user explicitly wants **AI to analyze each lead against the available data
and the customer's offer, then generate the outreach strategy**. The intended
example is a software house presenting its clinic website product to relevant
dental clinics. Product information should be supplied once per campaign. The
customer may alternatively supply exact email/SMS/etc. templates.

The current rewrite does not adequately satisfy that requirement. It is primarily
a deterministic campaign planner with optional constrained AI copywriting. AI is
not deciding the strategy, channel order, timing, offer-fit rationale or score.
The assistant acknowledged that the rewrite moved too much into fixed rules.
Restoring AI-led strategy was discussed, but **has not been implemented**.

The desired next design should let AI assess relevance, explain an outreach angle,
recommend permitted channels and their order, create purposeful messages and
follow-ups, and prepare calling/objection guidance. Supporting workflow logic
should enforce tenant isolation, evidence boundaries, verification, budgets,
approvals and opt-outs. It should not replace the strategy reasoning. AI failure
should be visible as pending/failed AI strategy, with any template fallback
explicitly distinguished from a completed AI-generated strategy.

## 2. Exact current state: live versus local

| Item | Verified state |
| --- | --- |
| Live workflow | `27W04lgTGdgFMWUx`, `6C - Campaign Outreach Strategy Planner`, active, 40 nodes |
| Planner scheduler | Enabled |
| Strategy AI controls | No rows in actual DB; gate therefore denies automatic AI |
| Enrichment AI | Disabled |
| Abstract email verification | Disabled; subscription not yet available |
| Sending workflows | 07A email, 07B LinkedIn, 07C SMS, 07D WhatsApp and 08 follow-ups all inactive |
| Production strategy jobs/plans | Zero jobs and zero plans at inspection; tests did not create real customer campaigns |
| Migration 015 | Applied to actual `lead_db` and isolated test DB in previous turns; eight strategy tables verified present |
| Local workflow JSON | Newer than live: includes mandatory relevant-evidence prompt/validation correction |
| That local correction | Unit-tested, not imported into n8n; final live AI trial failed before a response |
| AI-led redesign promised most recently | Not started |

`06C_DEPLOYED.json` is a fresh read-only snapshot of the actual deployed graph.
`06C_LOCAL.json` is the current generated repository file. Do not treat them as
identical. `06C_BEFORE_REWRITE.json` is the saved pre-rewrite reference, not a
guaranteed pristine initial project version and not a safe automatic rollback.
It already contains some earlier evidence-handoff changes.

The workspace has extensive uncommitted changes from earlier stages. Current
HEAD is b1f9780; there is no clean dedicated 06C feature commit. Preserve unrelated
files. Only report/artifact files were produced for this handoff.

## 3. What the earlier 06C did

The saved pre-rewrite graph contains Schedule Trigger, Get Stage 2 Leads, Any
Leads Ready?, AI Agent - Outreach Strategist, Groq Chat Model, Web Search,
Structured Output Parser, Calculate Final Lead Score, View Complete Outreach
Strategy and Insert Outreach Strategy, plus a mock node and sticky note.

The AI Agent node is `@n8n/n8n-nodes-langchain.agent`; its attached Groq model in
the snapshot is `llama-3.3-70b-versatile`. Its web-search tool targets Serper
(`https://google.serper.dev/search`). This report does not verify that old model's
current availability or that the old search tool worked correctly live.

Its prompt exposed company/location/category/rating/review count, products and
services, target customer, company size, decision-maker access, website, LinkedIn,
pain points, personalization hook, recent news and LinkedIn evidence. It requested:

- Email subject/opening/body and day-3/day-7 follow-ups.
- LinkedIn connection note, first message and approach.
- SMS/WhatsApp messages and timing.
- Estimated response percentage and primary/secondary channels.

The old Code node computed a single 100-point score from contact presence,
company size, pain-point count, ratings/reviews, personalization/subject presence
and the AI's estimated response rate. It labelled leads hot/warm/cold and set
channel-use flags from contact presence. The insert wrote `enriched_leads` and
promoted `enrichment_stage` to 3. The saved insert lacks an explicit org_id column.

These older behaviors include weaknesses worth correcting independently of
restoring AI: unsupported response-rate estimates, presence being mistaken for
verified contact readiness, and legacy tenant/output contracts. Restoring an AI
node alone should not restore those weaknesses.

## 4. Current architecture and execution

06C is a native n8n workflow. There is **no external long-running Node/Python
service required for this stage**. `runtime.cjs` contains pure JavaScript functions;
`build.cjs` embeds them into Code nodes in the workflow JSON. PostgreSQL functions
manage state. Other project stages may use workers, but 06C does not use Execute
Command to run an external worker.

Main graph:

```text
Every Minute / Manual Planner Test
  -> Claim Strategy Jobs (PostgreSQL)
  -> Expand Claimed Jobs (Code)
  -> Prepare Strategy (Code)
  -> Reserve Strategy AI (PostgreSQL)
  -> AI Allowed?
       true -> Compose With Groq (HTTP Request)
       false -------------------------------+
  -> Validate and Assemble Draft (Code) <----+
  -> Save Versioned Strategy (PostgreSQL)

Error Trigger -> Format Error -> Mark Job Failed
```

Six authenticated webhook branches support campaign saving, request/batch
admission, previews, reports and content approval. Webhooks persist jobs and
respond before model processing; the minute scheduler does the slow work.

The new storage/output is not wired into old stage-3 `enriched_leads` flags.
Existing 07/08 executors are not consumers of the new plan contract. No sending
is authorized by a plan or an approval in this version.

## 5. Customer campaign input

The normalized campaign supports:

- name, mode (`template`, `hybrid`, `ai`), language, tone.
- sender name/company/signature.
- offer name/description, up to 12 approved benefit statements, prohibited claims.
- CTA text and optional HTTPS demo/product URL.
- target industry terms, locations, exclusion terms.
- channels from email, SMS, WhatsApp, LinkedIn, call.
- per-channel subject/body and optional follow-up bodies.
- timezone, weekday/hour window, up to 10 sequence steps with delays 0–60 days.
- expiry 1–30 days, default 7.
- optional customer-defined offer-fit rules mapping evidence terms to the index
  of an approved benefit. These are rule matches, not AI understanding.

Allowed template variables: company_name, city, offer_name, offer_description,
cta, demo_url, sender_name, sender_company. Missing values are validation errors.
Non-English campaigns currently require templates for all selected channels.

Default sequence uses only the first channel: initial, +3 days, then +4 days
after the previous confirmed send (nominal days 0/3/7). Exact-template mode with
supplied templates uses supplied follow-ups by default. Timing is a plan, not an
implemented scheduler for sending. Other selected channels are labelled as
unscheduled alternatives unless explicitly included in the sequence.

## 6. Lead context available to code versus context actually sent to AI

`strategy_context(org,campaign,lead)` loads the current campaign version and
org-scoped cleaned lead: id, company name, category, city, email, phone, website.
It calls `enrichment_report(org,lead)` and retains basic, research, outreach_context
and trust, minus trust.evaluated_at for stable fingerprinting. It also reads email
suppression and org-scoped prior replies.

The upstream trust wrapper only exposes LinkedIn outreach context when website
and research evidence are current and no conflicts exist. Its website freshness
window is 30 days and research freshness window 7 days, with input-fingerprint
checks. The runtime extracts up to six basic service excerpts and three outreach
excerpts, with URLs, author attribution, IDs and 240-character quote bounds.

**Important mismatch:** the model does not receive this full context. The current
AI payload contains only channel names, company name, tone, mode and an approved
text-block bank (greeting, product description, benefits, evidence quotes, CTA).
The local-only correction adds a required evidence ID. The model does not receive
a comprehensive business profile, trust/readiness reasoning, scores, fit rules,
desired sequence analysis, missing data, contact history or a full strategic brief.
It has no web-search tool in current 06C. Searching/research must come from prior
stages unless a future redesign deliberately adds a tool.

## 7. Current AI call and its limitations

Provider is **Groq**, not xAI Grok. HTTP POST to
`https://api.groq.com/openai/v1/chat/completions`, using environment GROQ_API_KEY
(never included in this handoff). Model `openai/gpt-oss-120b`, temperature 0,
JSON-object response format, max_completion_tokens 2400, HTTP timeout 45 seconds.
The payload has a 6,500-byte input-content bound. No automatic HTTP retry;
non-2xx responses use neverError and node errors continue to the fallback path.

The expected model response is:

```json
{
  "selections": [{"channel":"email","block_ids":["intro","e1","offer","cta"]}],
  "drafts": [{"channel":"email","subject":"...","body":"...",
              "claims":[{"text":"exact supplied block text","block_id":"e1"}]}]
}
```

The model is told to copy factual claims exactly from the blocks and use new
wording mostly for greetings/transitions/questions. Validators require each
channel once, known block IDs, offer and CTA, matching declared claim text,
approved body URLs and no deceptive reply-style subject. Truncated/invalid output
falls back to templates. Free prose is still not semantically proven by these
checks and carries a human-review warning.

The local-only prompt correction requires one relevant rule-matched excerpt in
email/LinkedIn/WhatsApp selections and claims. It is still a constrained copy
generator, not the AI strategist the user requested.

AI is eligible only if mode is not template, some evidence exists, payload is
within the bound, the key exists, a live job lease is valid and the budget gate
permits it. A lead without excerpts receives no AI call even if basic data exists.

Default AI controls are disabled/zero. The gate enforces per-org monthly request
count, a global 20-reservation daily cap, a 65-second recent-reservation check
including enrichment requests, and one reservation per lease. Failed reservations
consume capacity. This is request accounting, not a monetary guarantee; enrichment
does not share the same reservation lock, so cross-stage coordination is incomplete.

## 8. What is currently rule-generated instead of AI-generated

| Output | Current source |
| --- | --- |
| Fit assessment | Industry/city string rules and customer evidence-term rules |
| Lead scores | Fixed weighted Code-node formula |
| Channel selection/order | Campaign input/default first channel, not AI |
| Timing and stop conditions | Fixed campaign/sequence rules |
| Initial copy | Template, approved-block composition, or constrained AI draft |
| Follow-up text | Supplied templates or deterministic introduction/benefit/closing text |
| Calling | Deterministic identity opening, permission question and generic branches |
| Evidence inclusion | Model selection or deterministic matching fallback |
| Readiness | Fixed verification/conflict/executor blockers |

Calling deliberately replaces unsupplied model call text with a deterministic
opening. Retell is unconnected. The call brief contains interested/busy/wrong-person/
opt-out/unknown-question guidance, not an AI-derived objection analysis.

System-generated email/SMS/WhatsApp drafts append opt-out instructions; exact
customer templates are preserved and receive warnings if those instructions are
absent. That wording does not implement an unsubscribe handler.

## 9. Scores and plan output

Plan JSON includes version strategy_v1, campaign_version, mode, generation method/
AI status, scores, fit, offer_fit, brief_suggestions, quality_review, evidence,
channel_readiness, messages, sequence, call_brief, validation_errors,
blocking_reasons, approval_required true and execution_authorized false.

`lead_scores_v1` has three separate indicators:

- Product fit: industry 40, city 20, supported offer-rule match 40.
- Data confidence: source-correlated identity 30, current observed website 25,
  current research with matched profile/usable evidence 20, fresh verification
  of the selected email 25.
- Readiness: 100 only if a configured channel has no readiness blockers; otherwise
  0. All channels currently contain executor_not_integrated, so all are 0.

Unknown components have null points and are listed with missing information;
coverage_percent reports assessed weight. The total uses the full 100-point
scale; if every component is unknown, score is null. These are documented support
indicators, not statistical confidence, conversion probability or proof of need.
Even data score 100 does not establish independent identity or phone permission.
Queue order is not automatically prioritized by score.

## 10. PostgreSQL and job reliability

Migration `015_outreach_strategy.sql` defines eight tables:

| Table | Responsibility |
| --- | --- |
| strategy_campaigns | Organization campaign identity and current version |
| strategy_campaign_versions | Immutable normalized config versions |
| strategy_controls | Global planner-enabled switch |
| strategy_jobs | Requests, state, attempts, leases, fingerprints and execution IDs |
| strategy_plans | Immutable generated body, content hash, input fingerprint, expiry |
| strategy_approvals | Append-only approve/revoke history tied to content hash |
| strategy_ai_controls | Per-org enable switch and monthly request ceiling |
| strategy_ai_requests | Lease-keyed reservation/result/usage ledger |

Functions: strategy_campaign_save, strategy_context, strategy_enqueue,
strategy_enqueue_batch, strategy_claim, strategy_ai_gate, strategy_finish,
strategy_report, strategy_approval and strategy_fail. Full SQL is included.

Claims use FOR UPDATE SKIP LOCKED, up to two jobs per scheduler run, five-minute
leases and a maximum of three job attempts. Expired leases retry after one minute;
error-trigger failures retry after five minutes. A changed campaign/input can
supersede a job. Per-org pending/processing cap is 100. Request IDs are idempotent;
reuse with a different campaign/version/lead is rejected. Final writes compare
the current context fingerprint and lease; same successful lease replay returns
the prior plan. Default plan expiry is seven days.

**Important failure semantic:** provider failure/AI disabled/invalid output
currently produces a fallback draft that can be saved as a completed job. There
is no separate ai_strategy_pending/failed state. This conflicts with the newly
clarified AI-first requirement and needs an explicit design decision.

Approval checks org, plan, hash, current fingerprint/expiry, validation errors
and top-level blockers. It approves content only; channel-specific blockers still
exist and execution_authorized stays false. Actor is asserted by the trusted
backend, not independently authenticated here. DB output validation is limited;
the Code node performs most message validation. Public function execution is
revoked, but the n8n DB role still has access. There is no new RLS layer.

## 11. HTTP API contract

All paths below are under `/webhook/` and share header-auth credential
`leadGatheringAuth`. The secret value is excluded. This is a trusted-backend API,
not a safe Flutter credential: an authenticated gateway must derive org_id and
reviewer identity from the user's session rather than accept arbitrary claims.

| Method/path | Input | Result |
| --- | --- | --- |
| POST strategy-campaign | org_id, config; campaign_id/expected_version for edits | Current version or conflict |
| POST strategy-request | org_id, campaign_id, lead_id, request_id (8–120 chars) | 202 job admission |
| POST strategy-batch | org_id, campaign_id, lead_ids (1–100), request_id prefix (8–80 chars) | 202 with individual admission outcomes |
| POST strategy-preview | org_id, campaign_id, lead_id | Deterministic preview; no AI or persisted job |
| GET strategy-report | org_id, job_id | Job, plan, hash, freshness, approval |
| POST strategy-approval | org_id, plan_id, content_hash, actor, approve/revoke action | Content decision only |

Batch 202 does not mean every lead was accepted; inspect each result. There are
no campaign-list, job-cancel, per-plan-edit or outreach-send endpoints in 06C.

## 12. Authentic testing results and limits

Local runtime tests cover templates, placeholders, AI-response validation,
fallback, quote/newline handling, source freshness/conflicts, score unknowns,
calling text, opt-out defaults, preserved sticky notes and workflow conventions.
SQL fixture tests use the isolated DB and roll back. They cover org isolation,
versions, idempotency, claims, expiry/retry, disabled AI, approvals and stale plans.
The exclusive-claim fixture is sequential; it is not a high-concurrency load test.

Real isolated n8n execution and HTTP tests passed for draft generation, preview,
202 request/batch admission, authentication, org isolation and approvals. Live
non-mutating endpoint checks passed after deployments. Those tests do not prove
successful provider calls from native n8n or production delivery reliability.

The five-real-lead benchmark used a fictional product/sender and read-only lead
reports, not live customer campaigns. IDs: 167, 445, 446, 447, 449. Only 449 had
usable strategy excerpts (six). All were unready for outreach. Initially all
emails were generic and lacked opt-out text. After the deployed correction, all
five initial emails had opt-out wording and 449 got a sourced opening; the other
four remained evidence-limited. Calling openings and alternative labels improved.
Scores/readiness did not change. Full before/after artifacts are included.

### Three-attempt real Groq trial

| Attempt | Result |
| --- | --- |
| 1, Docker | No response captured; request/parse failure after 2.095 s |
| 2, Windows | HTTP 200, completed in 13.652 s, but generic copy |
| 3, Windows, corrected prompt | ECONNRESET after 10.673 s; no response captured |

Successful response: 581 prompt + 1,184 completion = 1,765 tokens; completion
includes 683 reasoning tokens. Provider processing time about 2.53 s. No actual
dollar charge/free-tier entitlement was verified. Failed attempts' provider usage
is unknown, not proven zero. We cannot conclude the model/provider caused the
network failures, nor that the system is reliable from one response.

The real response passed declared-claim checks but ignored all website excerpts
and repeated the offer across channels. The subsequent mandatory-evidence fix
is local only. Trial requests used the same prepared payload and validator but
not the native n8n HTTP node. A persistent three-reservation ledger under
`/home/node/.n8n/strategy-ai-trial-20261011` is exhausted. No more model requests
are authorized by that trial. Automatic AI settings were never enabled.

## 13. Known gaps to preserve in the next model's assessment

1. AI strategist behavior has not been restored; making the prompt require a quote
   does not solve the missing business reasoning/channel strategy.
2. Current model input is much narrower than the available enriched lead context.
3. Token spending is not yet justified by demonstrated copy/strategy quality.
4. Connectivity is unstable from Docker and at least once from Windows.
5. Exact-copy claim constraints reduce natural writing; free prose can still carry
   unsupported implications. Citation validity alone is not semantic verification.
6. Fallback can complete an AI-intended job, hiding the absence of an AI strategy
   unless the consumer reads generation.method and ai_status.
7. Scores are heuristic rules, not trained/calibrated predictions. Category/city
   string matching may create poor-fit flags that require review.
8. Email-only suppression is currently read from a global unsubscribes table;
   cross-channel and org-level suppression semantics need explicit review.
9. No full channel executor contract, Retell integration, response routing,
   cross-campaign frequency protection, A/B outcome learning or delivery callbacks.
10. No frontend auth gateway, no per-plan editor and no automatic queue prioritization.
11. All channels are hard-blocked by executor_not_integrated; readiness 0 is expected.
12. The generated Planner Contract sticky note still describes AI as only selecting
    blocks, although reviewed free draft prose was added. This note is stale; preserve
    historical notes while making any future current-contract update explicit.

## 14. Conventions and boundaries supplied by the user

- Multi-tenant ownership is organizations/org_id, never users/user_id.
- Native Code modes must be explicit. Zero-row-capable PostgreSQL nodes use
  alwaysOutputData true. Raw executeQuery uses manual single-quote escaping via
  `.replace(/'/g, "''")` on interpolated strings, per the user's convention.
- Preserve sticky notes and avoid restructuring working unrelated workflows.
- Error Trigger -> Format Error reads execution?.error?.message -> Mark Job Failed.
- Slow webhook work should be queued and acknowledged with 202.
- Existing lead dedup remains partial unique indexes/org-scoped phone and website,
  pg_trgm fuzzy handling and ON CONFLICT DO NOTHING; do not replace it here.
- If touching Apify, verify actor schemas live or mark UNVERIFIED/TODO; user requires
  neverError response options and retries 3 times with 3000 ms spacing. 06C currently
  makes no Apify calls. Platform Apify ceiling is $5/month, LinkedIn sublimit $0.50;
  these do not authorize Groq spending. Abstract's 100/month configuration is paused.
- Do not expose API keys, enable sending, or extend the exhausted AI test allowance.

## 15. Questions for the previous model

Please recommend the next design before implementing it:

1. What complete strategy JSON should AI return (analysis/rationale, angle,
   channel plan, sequence, copy, uncertainty and calling guidance)?
2. Which verified/enriched fields should enter the model, and how should conflicts,
   missing facts and evidence IDs be represented without excessive tokens?
3. Should a native n8n AI Agent be restored, or would a structured model call be
   sufficient? Tool use and semantic scope matter more than the node label.
4. Which decisions belong to AI and which to deterministic validation?
5. How should unsupported hypotheses be labelled and excluded from factual claims
   in outgoing messages while still allowing useful strategic reasoning?
6. What failure states/retry limits distinguish AI strategy failure from an explicitly
   requested template draft? How should the existing job/version contracts evolve?
7. What provider/model and bounded experiment can establish reasoning quality,
   latency, token cost and connectivity reliability before activation?
8. How should new plans be integrated with 07/08 safely, preserving tenant and
   verification controls without restoring speculative legacy response scores?

The aim is not to abandon working reliability controls, nor to preserve the current
rule-based strategy limitation. Restore the user's AI-led decision-making intent
and demonstrate that it adds value on authentic lead data.

## 16. Included source material

The review package includes this report; exact deployed/local/pre-rewrite workflow
snapshots; runtime/build/deploy/test helpers; full migration 015 and trust migration
013; before/after sample plans; all three real AI trial artifacts; and tests/docs.
No credential exports, .env files, API-key files or database dumps are included.
Source references to credential IDs/environment variable names are not API keys.

Read the local-versus-live distinction before suggesting code changes. The snapshots
are for review; do not import the pre-rewrite workflow or run a deployment helper
merely to inspect the package.
