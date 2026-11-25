# Customer-owned calling transport and provider checks

This adds executable provider/account plumbing, not live calling acceptance or
permission to dial. The send switch is false, tool attestations are empty, and
no schedule, n8n workflow or dashboard start button activates this worker.

## Customer-facing checks

Settings > Calling resources > Check Retell settings performs bounded GETs for
the saved published agent/version, its pinned Retell response engine and optional
calling number. It compares the reviewed prompt, language/duration, voicemail/IVR
handling, required tool schemas, tool retries and number destination settings.
The lookup does not generate audio, buy a number, invoke a tool or call a phone.

Migration 067 stores only boolean checks, hashes and timestamps, scoped to the
organization/account version. It stores no provider payload, prompt, token or
tool header. New account versions cannot inherit old passes. Checks are labelled
expired after 15 minutes or a local prompt change. A failed lookup records a
fixed failure and cannot promote an account or campaign to ready.

Passing these checks is not proof of a functioning authenticated tool backend,
voice quality, caller authorization, route health, provider funds, recipient
permission or release. These remain distinct requirements.

## Trusted worker

`scripts/calling/owned-transport.cjs` loads a customer's key from the existing
organization-bound vault. It verifies provider configuration afresh, plus a
trusted, time-bounded tool/voice/route proof scoped to the exact organization,
account version, agent/version, caller, connection reference, HTTPS tool URL and
private authentication header. No customer form can mint this proof.

Under the existing global call lock and account lock, it rechecks the account and
calls installed `outreach_call_dispatch_next`. That function rechecks plans,
approvals, recipient eligibility/stops, timing, quotes, BYOK budgets and global
concurrency; it reserves cost and commits attempts=1 before a POST is possible.
The worker additionally requires a current BYOK campaign binding to this exact
account version. A mismatched claim rolls back before network submission.

An unknown claim commit sends nothing. A POST occurs once; errors, mismatched
receipts and unknown result commits never produce a retry. Valid observations
use `outreach_call_ingest`, preserving outcome/opt-out handling. Polling uses
known call IDs and original request bindings; it remains available when sending
is disabled. Calls without a known provider ID need operator reconciliation.

The worker does not mark provider-accepted calls delivered/completed or settle
money. Terminal calls keep their reservation until verified all-provider cost
settlement. Automatic live billing settlement remains unfinished; do not enable
unattended production calling before completing it.

## Local operation and remaining prerequisites

- `node scripts/calling/run-owned-transport.cjs --status` only reports switches.
- `--once` returns disabled under the installed configuration, without opening
  the database or provider. There is no implicit organization or funded trial.
- `--poll` is an operator-only known-result lookup using configured organization
  scope. It does not redial or enable sending.
- `.local/calling-transport/config.json` is installed with `enabled:false` and
  `org_id:null`; `tool-bindings.json` is an empty array. Neither is a customer API.
- A real customer connection, per-account authenticated tool/Calendar mapping,
  voice and number/route acceptance, bounded funded quote, current recipient and
  content approval, cost settlement and explicit live-test authorization are
  still required. There is no paid provider request in this installation.

Focused mocked transport tests cover pre-commit/no-send, one POST on uncertainty,
credential/version isolation, tool proof mismatch, receipt validation and polling.
Real rollback-only SQL checked version-scoped preflight storage and failure
recording without changing account readiness. A real customer browser check and
phone-call acceptance remain pending.

Primary API references: [Get Voice Agent](https://docs.retellai.com/api-references/get-agent),
[Get Retell LLM](https://docs.retellai.com/api-references/get-retell-llm),
[Get Phone Number](https://docs.retellai.com/api-references/get-phone-number),
and [Create Phone Call](https://docs.retellai.com/api-references/create-phone-call).
