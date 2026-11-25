# Strategy integration and approved quality checks — 8 November 2026

## Installed state

06C management is active locally. Authenticated preview was exercised without a
model call; an AI preview is labelled as a deterministic example and saves no plan.
Dashboard generation readiness exposes management availability, paused processing,
mode and quota; known preflight rejections are definite unsent responses rather
than ambiguous submissions. Campaign editing remains possible while generation is
paused. Backend/UI coverage: 48 backend and 9 UI checks passed before this test run.

The user explicitly approved org 1 at 10 strategy requests/month and at most three
quality tests, each capped at 6,000 completion tokens with no HTTP retries or
outreach. The ordinary strategy_ai_requests ledger was used. Historical trial
files and the exhausted trial ledger were not extended. Monthly allowance is
enabled; global strategy processing is paused after testing.

## Actual installed-workflow results

One new request at a time was admitted through strategy_enqueue and processed by
the installed scheduled planner, using ordinary claim, reservation and finish
functions. Processing was paused after each terminal result. The old pending
campaign-version-2 request was superseded by the existing version check.

| Case | Lead | Job | Result | Validation failure | Prompt tokens | Completion tokens |
|---|---:|---:|---|---|---:|---:|
| Strong fit | 167 | 3 | ai_failed | UNKNOWN_ANGLE | 1,700 | 210 |
| Weak fit | 449 | 4 | ai_failed | MISSING_QUALITY_FLAG:weak_offer_fit | 1,791 | 240 |
| Thin evidence | 446 | 5 | ai_failed | MISSING_QUALITY_FLAG:fit_not_established | 1,638 | 161 |

All three received model usage, one attempt per request, totalling 5,740 tokens.
No request was retried and no outgoing draft was accepted. All three benchmark
inputs lacked permitted email readiness; these checks cannot establish the quality
of a sendable, personalized email. No fallback was substituted and no approval or
send was performed. Saved failed plans retain method, model, prompt version,
attempt count, usage and failure reason.

The token-free native HTTP model-list check succeeded (HTTP 200, requested model
available). Connectivity succeeded for these three completions; reliability during
other network windows remains UNVERIFIED. Groq's public free-plan table lists 8K
tokens/minute for this model; exact account limits can differ. See
[Groq rate limits](https://console.groq.com/docs/rate-limits). These tests did not
prove a 6,000-token output is always available under the account's rate limits.

Raw successful n8n execution data was not retained for these runs. Consequently,
the exact rejected angle value and full model replies cannot be reconstructed;
only persisted validator failures and usage are established. No hidden reasoning
or credentials were exported. Private admission/result journals are under
`.local/strategy-quality-approved-20261108/`.

## Local correction installed, real-model quality unverified

Prompt version strategy_v2.8 adds a trusted per-input response checklist stating
the exact fit, permitted angle IDs and required review flags. When candidate angles
exist, their exact IDs are now enumerated in the supplied output schema, including
when all channels are blocked. No-channel requirements remain explicit. Validation
still rejects a missing angle, missing flags, unsupported claims or disallowed
channels; no failure is repaired into a passing output by application code.

The existing native bundle was rebuilt in the workflow JSON. Connections, notes,
node modes and non-Code settings were preserved. The correction is installed in
local n8n as strategy_v2.8 and has **not** been tested against a real model.
Three authenticated installed-workflow previews passed (167 strong, 449 weak,
446 unclear), creating no plans and calling no provider. Global processing remains
paused, and the quota, jobs, saved plans, approvals and other workflows were
unchanged. The three approved quality calls are exhausted;
remaining monthly quota is not permission for additional quality-test calls.

Verification after the correction: 33 contract checks, 15 actual embedded Code-node
VM checks and one five-benchmark checklist regression passed (49 checks). The tests
prove constraint generation and unchanged rejection behavior, not model compliance.
No migration, new table or webhook was added.

Installation evidence and rollback definition/backup:
`.local/strategy-checklist-1794156043122/`. Only the Prepare Strategy, Validate and
Assemble Draft, and Build Preview Code bodies changed. The installer verified an
idle n8n before its local restart. The earlier directory ending 1794156011835 is a
preflight-only rejection of an export without an ID; no import happened there.

The dashboard previously dropped `generation.failure_reason` in plan-review.cjs.
It now exposes an allowlisted reason plus validated attempts/usage. The strategy
review screen explains rejected AI drafts and shows real recorded usage; unknown
provider error text is not returned. Fifteen backend checks and three UI checks
passed; the frontend production build is main.a5ed5fe2.js. A read-only projection
check confirmed the three real saved failure reasons and 5,740-token total. The
failure display makes no replacement requests and changes no approval behavior.

## Remaining acceptance

- Validate the installed prompt correction under a separately authorized test
  scope; do not replay the three completed requests.
- Establish an eligible current contact before claiming sendable-message quality.
- Complete the dashboard request → saved valid plan → approval/revocation journey.
- End-to-end AI quality and a full personalized strategy remain **UNVERIFIED**.

## Corrected-prompt test — 9 November 2026

The user separately approved **one** further request from the remaining monthly
allowance, capped at 6,000 completion tokens, no retry and no outreach. It used a
new admission marker under `.local/strategy-quality-corrected-approved-20261109/`;
historical trials and the original three quality records were not extended.

Installed 06C processed job 6 for lead 167 with prompt strategy_v2.8. Result:
**ai_completed**, one attempt, 1,777 prompt + 190 completion = **1,967 tokens**.
The response selected permitted angle `a1`, retained deterministic strong fit,
and included `no_permitted_channel` and `thin_evidence`. It returned null step1,
no channel plan, no follow-ups and category-level personalization. Validation
passed; the model did not invent a sendable message or a sourced business claim.

This proves the corrected contract for this blocked-contact case. It does **not**
prove personalized email quality, weak/thin-case quality under v2.8, successful
content approval or executor readiness. The existing `v2_offline_only` blocker was
preserved; no gates were removed to make the test pass. Processing was paused after
completion. Read-only verification confirmed 4/month used and **6 remaining**.
No additional request is implicit in this approval.
