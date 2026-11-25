# Local email deployment gap audit

Read-only database comparison completed at 2026-10-20T14:53:03Z. No imports, migrations, activation, provider calls or sends.

## Confirmed deployment

- 07A (`gTjsUEP8VLlxKfWf`): deployed nodes and connections exactly match `workflows/07a_email_outreach_executor.json`; no changed or extra nodes.
- 09 (`TrgeZrs4ILZnrXuJ`): deployed nodes and connections exactly match `workflows/09_reply_detection.json`; no changed or extra nodes.
- Both workflows remain inactive. Configured schedule intervals are five minutes and two minutes respectively.
- All 21 latest `outreach_*` function bodies extracted from migrations 019–031 match live definitions, including the 031 uncertain-contact guard. The runtime role has EXECUTE on all 21.
- Live workflow settings contain `executionOrder: v1`; local files omit settings. This is not a missing node deployment and requires no re-import.
- Zero running executions and zero production strategy plans for organization 1 were observed.
- Full comparison output is retained in `.local/email-gap-audit-result.json`.

## Correction to earlier status

The statement that final core workflow changes still needed importing was too broad. The core release is already installed. The optional campaign-specific rollout builder has not produced or imported an enabled release because there is no approved production plan to bind. This is campaign configuration, not missing core implementation.

No further migration, core workflow import, executor rewrite, repeated successful mock suite, or additional release framework is needed based on this audit.

## Small remaining local rollout scope

1. OAuth refresh is now verified in isolation. `verify-gmail-refresh.cjs` installed a dummy invalid access token in a memory-backed scratch credential, executed a read-only Gmail profile request through native n8n, then confirmed a new access token was persisted in scratch and the mailbox identity matched. The encrypted live credential hash remained unchanged. No inbox content was read and no email was sent. Evidence: `gmail-refresh-verification-20261020.json`. This establishes the current refresh mechanism, not immunity to future consent revocation.
2. Prepare an authorized campaign/test plan through existing gates, with exact recipients and content. Previous test-send approvals are not reusable authorization for another test.
3. Bind the coordinated workflow pair to that approved scope, review the resulting definitions, then import and activate under the existing release procedure.
4. Observe one scheduled end-to-end run and reply-stop behavior. The earlier real email/thread/reply tests and isolated real-timer tests remain valid evidence; do not repeat unrelated tests.

Do not activate the currently closed gates and describe the resulting no-op schedules as an operational executor. Do not invent verification or transfer scratch approvals into production.

Multi-account onboarding, broader lead collection and Hostinger deployment are outside this single-mailbox milestone. Actual prospect sending still requires verified recipients; the current clinic campaign has none.

## Approved scheduled transport test

The user approved one message to their owned test mailbox with subject `Email executor scheduled verification`. A native n8n Schedule Trigger executed the Gmail sending node, and Gmail accepted the message on 20 October at 15:01:17 UTC (20:01:17 Pakistan time). A persistent exclusive-create attempt marker prevented another attempt on subsequent ticks. The isolated test container exited with code 0 and is stopped. Evidence: `email-scheduled-verification-20261020.json`.

This verifies a real scheduled Gmail send. It does not activate production 07A/09 or prove the entire production SQL campaign chain in one execution: this narrow test used isolated SQLite and a test-only one-send guard. Existing separate SQL/approval/quota/reply-stop tests remain the evidence for those stages. No prospect campaign was enabled.

On 21 October, a read-only retrieval found two messages in that Gmail thread. The existing deterministic reply matcher identified one reply from the expected recipient with no review reasons. Evidence: `email-scheduled-reply-check-20261021.json`. Matching used explicit fixture activity IDs because this transport-only test has no production activity row; no production stop event was written. The prior real reply persistence and stop-gate tests remain separate evidence. No further email was sent.
