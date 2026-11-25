# 06C campaign strategy planner

Rollout verified 2026-10-11: enhanced 06C imported into local Docker n8n,
live nodes/connections matched, live API smoke checks passed, and planner claims
enabled. All 07/08 sending workflows remain inactive. Strategy AI remains disabled.
Local AI-response fixture tests covered valid drafts, altered claims, unapproved
links and deceptive subjects. The isolated real n8n execution/API tests passed
without any provider calls. No live AI-writing quality benchmark is claimed.

06C creates reviewable outreach plans from a customer campaign brief and the
current org-scoped lead/evidence report. It does not send outreach or set legacy
stage/channel flags. The native n8n workflow uses PostgreSQL and Code nodes;
JavaScript files under scripts/lead-strategy build and test the workflow and are
not a separate service needed at runtime.

## Campaign brief and resulting plan

The customer supplies the sender, product/service description, approved selling
points, prohibited claims, target business categories/locations, CTA/demo URL,
channels, timezone and allowed sending window. Channels are email, SMS, WhatsApp,
LinkedIn and calling. A campaign can supply its own templates and follow-ups.

- `template`: preserve supplied text after replacing known placeholders.
- `hybrid`: use supplied text with a cited introduction when constrained AI selects one.
- `ai`: write natural draft prose around approved factual blocks. Declared claims
  must match supplied text exactly and appear in the draft. Unknown source IDs,
  changed quotations, missing offer/CTA claims, unapproved body URLs and deceptive
  reply-style subjects cause template fallback. These checks validate references;
  they cannot prove every free-written sentence is factually supported.
  All AI-written prose is explicitly flagged for human factual review.

With AI disabled, deterministic templates still work. Source evidence is retained
with URLs for review. Structured strategy fields never infer a revenue estimate,
buying intent, response probability or verified contact status. AI prose still
requires human review for unsupported assertions. Website excerpts require current
website evidence; LinkedIn evidence comes from the enrichment report's filtered
outreach context. A human must still assess whether a quoted excerpt is appropriate.

Each plan contains per-channel drafts, fit checks, evidence, readiness blockers,
follow-up messages/delays, timezone/window, stop conditions and a calling brief.
The default generated sequence is day 0, then 3 days after the previous confirmed
send, then 4 days after that send. Exact customer templates use only provided
follow-ups by default. Custom sequences support up to ten steps. Delays are not
scheduled sends; an executor must implement them.

## Added strategy features

### Explainable scores (lead_scores_v1)

New previews and generated plans include `scores`. Existing immutable plans are
not rewritten; preview or request a new plan to see scores. No schema change is
needed because plans already store JSON. Scores do not authorize outreach or
automatically reorder the queue.

| Score | Fixed weights / meaning |
| --- | --- |
| Product fit | Industry match 40, city match 20, supported customer-defined offer rule 40 |
| Data confidence | Source-correlated identity 30, current observed website 25, current research with matched profile/outreach evidence 20, fresh verification of the selected email 25 |
| Outreach readiness | 100 only if at least one configured channel has no readiness blockers; otherwise 0. Per-channel blockers remain visible. |

Each weighted component reports its points, status and reason. Unknown components
have null points. Scores use the full 100-point scale without rescaling limited
evidence; coverage_percent shows the assessed weight and missing_information
explains unknowns. If every component is unknown, score is null, not zero.
Absence of an offer-rule match is unknown need, not proven poor fit. Recorded
category/city mismatches are known rule failures. Exclusions and trust conflicts
remain explicit blockers even with high scores.

These are support/completeness indicators, not statistical confidence or
conversion probabilities. Even 100 data-confidence points do not establish
independent business identity or phone permission. Empty recent research earns
no points. Current executors are not integrated, so readiness remains zero.

Read-only benchmark (2026-10-11): nine real org-1 leads with a synthetic dental
website campaign (not persisted). Fit ranged 20–100; leads 167 and 449 had 25
data-confidence points with 25% coverage. The other seven had unknown confidence
and 0% coverage. All nine had readiness 0. Lead 449 demonstrated why fit and
readiness must remain separate: fit 100, but email unverified and executor absent.
These results measure behavior under the sample brief, not validated sales outcomes.

`offer_fit_rules` links observed evidence terms to approved selling points. For
example, `[{"evidence_terms":["implants"],"approved_point_index":0}]` pairs a current
website excerpt mentioning implants with the first approved product benefit.
The plan includes the excerpt, URL, benefit and a statement that relevance is
only a potential opportunity; customer need is not confirmed. Without matching
rules/evidence, offer fit is marked insufficient_evidence.

Follow-ups have explicit purposes: introduction, approved benefit, offer reminder,
and final close-the-loop. Exact supplied templates are preserved. No case studies
or performance results are fabricated to fill missing proof.

`brief_suggestions` identifies missing target categories, product benefits or a
demo URL. `quality_review` flags lengthy drafts, multiple questions, missing
opt-out instructions, lack of source personalization and AI prose needing review.
These are review hints, not a deliverability or conversion guarantee.

When AI is unavailable in hybrid/AI mode, the fallback can select one short
current excerpt matching a customer-defined offer-fit rule for email, LinkedIn
or WhatsApp. Blocking lead conflicts/mismatches suppress this fallback selection.
Exact template mode is preserved. System-generated email/SMS/WhatsApp drafts
include opt-out wording; customer templates lacking it receive a warning.
Wording alone does not connect an opt-out handler.

Calling has a sender introduction, recipient check, separate permission question,
approved pitch and response branches. Retell remains disconnected. Messages
include plan_role to distinguish sequence drafts from blocked unscheduled
alternatives; selecting multiple channels does not automatically schedule all of them.

## Internal HTTP contract

All endpoints use the existing Lead Gathering header credential. This is an
internal backend credential: do not embed it in Flutter. A frontend gateway must
bind org_id and reviewer identity to the authenticated user; these endpoints do
not supply that authentication layer.

| Method /webhook/path | Input | Result |
| --- | --- | --- |
| POST strategy-campaign | org_id, config; for edits campaign_id and expected_version | Immutable campaign version, or 409 for concurrent edits |
| POST strategy-preview | org_id, campaign_id, lead_id | Deterministic preview; no provider call or saved job |
| POST strategy-request | org_id, campaign_id, lead_id, request_id | 202 queued job; request_id is 8–120 characters |
| POST strategy-batch | org_id, campaign_id, lead_ids, request_id | Up to 100 leads; 202 with individual admission statuses; prefix is 8–80 characters |
| GET strategy-report | org_id, job_id query values | Job, draft, hash, freshness, approval and blockers |
| POST strategy-approval | org_id, plan_id, content_hash, actor, action | Append approve/revoke event; content approval never authorizes sending |

Example campaign body (replace example product details with the customer's facts):

```json
{
  "org_id": 1,
  "config": {
    "name": "Clinic website demo",
    "mode": "template",
    "channels": ["email", "call"],
    "timezone": "Asia/Karachi",
    "sender": {"name": "Alex", "company": "Example Studio"},
    "offer": {
      "name": "Clinic website",
      "description": "We build clinic websites with service pages.",
      "approved_points": ["Appointment request forms are available."],
      "prohibited_claims": ["guaranteed revenue"]
    },
    "cta": {"text": "Would you like to see our demo?", "url": "https://example.com/demo"},
    "target_terms": ["dental"],
    "locations": ["Islamabad"],
    "expiry_days": 7
  }
}
```

Template variables: company_name, city, offer_name, offer_description, cta,
demo_url, sender_name, sender_company. Channel templates accept subject, body,
and a followups array of message bodies. Missing data and overly long messages
produce validation errors instead of being silently approved.

## Job reliability and approval

The webhook persists work and returns before generation. The minute scheduler
claims up to two jobs with PostgreSQL row locks and SKIP LOCKED. Leases last five
minutes, expired jobs retry, and three failed attempts end the job. Error Trigger
marks jobs by execution ID. Completed saves and repeated request IDs are replay-safe.
An org can have at most 100 pending/processing jobs.

Plans store immutable campaign versions and an input fingerprint. Campaign/lead/
trust changes or expiry make a plan stale; approvals check the exact content hash
and current fingerprint. Default expiry is seven days, configurable from 1–30.
Suppression, replies, business conflicts and campaign mismatches block approval.

## Provider and executor boundaries

Strategy AI defaults to disabled with zero monthly requests per org. It requires
GROQ_API_KEY plus an explicitly configured request limit. It uses GPT-OSS 120B,
small evidence input, source-linked claim validation and a template
fallback. No live strategy AI provider call has been tested. Reservation caps
are not a guarantee of provider pricing or free availability. The strategy gate
checks recent enrichment requests, but the enrichment gate does not share its
lock; full cross-stage concurrent rate coordination remains future work.

All channels currently include executor_not_integrated. Email additionally needs
fresh provider verification; phone channels need ownership/permission checks.
Retell is not connected. Content approval does not bypass these blockers.
Abstract verification remains a separate paused integration.

Not implemented here: sending, delivery callbacks, Retell calls, automatic reply
handling, cross-campaign contact-frequency caps, A/B performance optimization,
frontend authentication, or dashboard UI. Integrating executors must recheck
suppression, consent/channel permission, contact freshness, campaign version,
approval, quotas and sending windows immediately before each send.

## Verification and rollout

Local tests: `node tests/lead-strategy/runtime.test.cjs`.
SQL tests: tests/lead-strategy/database.sql, restricted to the test database and
rolled back. Docker test runner: scripts/lead-strategy/test-n8n.cjs uses a separate
n8n SQLite instance and the existing isolated PostgreSQL test database. It tests
real native execution plus header authentication, org isolation, preview,
202 queue/batch responses, approval and zero AI calls.

Migration: database/migrations/015_outreach_strategy.sql. Deployment helper backs
up the live 06C workflow inside the n8n volume, applies the migration with claims
paused, imports 06C, and verifies it after restart. No sending workflows are enabled.
