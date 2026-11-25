# One-time Groq strategy trial — 2026-10-11

**Verdict: one successful response was valid but insufficiently personalized.
The corrected prompt has not been verified live.**

The user authorized at most three requests with the sample clinic website offer.
Only lead 449 among the five reviewed leads had usable evidence and no campaign
mismatch. We used its public business evidence; no contact details were included
in the model request. All three attempt reservations are now consumed, including
connection failures. Do not rerun with a new ledger to bypass this limit.

| Attempt | Transport | Result | Elapsed |
| --- | --- | --- | --- |
| 1 | n8n Docker container | Request/parse failure, no model response captured | 2.095 s |
| 2 | Windows, same planner request | HTTP 200, completed response | 13.652 s |
| 3 | Windows, corrected evidence instruction | ECONNRESET, no model response captured | 10.673 s |

Docker DNS resolved the provider, but diagnostic TLS connections failed (timeout
and reset). A Windows TLS check succeeded, permitting attempt 2. The later Windows
reset means connectivity is unreliable, not proven to be exclusively Docker's
fault. No firewall, proxy, Docker network or TLS-validation settings were changed.

## Successful response review

Model: openai/gpt-oss-120b. Provider-reported usage: 581 prompt tokens + 1,184
completion tokens = 1,765 tokens; completion usage includes 683 reasoning tokens.
Finish reason: stop. Provider-reported total processing time: approximately 2.53 s;
measured HTTP request/response elapsed time: 13.65 s. No dollar charge was returned;
this test does not establish billing cost or free-tier entitlement.

The response passed the original structural/claim checks with no validation
errors. It copied the supplied product claims without inventing sales results or
criticizing the prospect's website. However, it used none of the six available
website excerpts and repeated essentially the same copy for email and LinkedIn.
That is not sufficient evidence of a useful personalized AI strategy.

Actual email body from the successful response, before the workflow-added
signature and opt-out wording:

> Hello Zia Dental Consultants,
> We build mobile-friendly clinic websites with clear service pages.
> An appointment-request form lets visitors send a request to your team.
> Service pages present the treatments your clinic offers.
> Would you like to see a sample website?

## Correction prepared locally

The planner now supplies a required evidence ID when a short, current excerpt
matches a customer-defined product-fit rule and no lead blockers exist. The prompt
requires this excerpt in email, LinkedIn and WhatsApp drafts; validation rejects
responses omitting it and uses the deterministic fallback. Unit tests cover the
new requirement as well as previously tested malformed claims and invented URLs.

The third attempt was intended to test this correction, but returned no model
response. **The correction is saved in runtime.cjs and the generated workflow JSON,
but has not been imported into live n8n during this trial.** Live n8n still has the
previously verified draft-quality version. Automatic AI remains disabled. No live
schema, campaigns, leads or AI budget controls were modified by the trial, and no
outreach was sent. The one-time attempt ledger is stored in the n8n volume, separate
from recurring strategy_ai_requests accounting.

## Next work

Diagnose the unstable outbound connection without spending model requests. A new
explicitly authorized capped trial is needed to assess the corrected prompt. Only
then claim improved live AI personalization. Continue using the verified template
fallback until that test passes; no automatic AI or outreach activation is implied.

Artifacts: STRATEGY_AI_TRIAL_1.json, STRATEGY_AI_TRIAL_2.json,
STRATEGY_AI_TRIAL_3.json. The records contain request/response evidence, never the API key.
