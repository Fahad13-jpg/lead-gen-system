# 07A lifecycle integration

Local JSON only; inactive and not imported. Migration 020 remains scratch-only. No actual Gmail or model requests.

Existing selection and suppression nodes lead to draft preparation, then these inserted nodes:

1. Reserve Approved Email — org/plan/step reservation using migration 019.
2. Bind Email Reservation and Email Reserved? — preserve item identity and stop denied reservations.
3. Begin Email Attempt — migration 020 rechecks approval/readiness, exact message/recipient, sender binding and atomic org quota.
4. Bind Email Authorization and Email Attempt Authorized? — stop unless begin explicitly authorizes one attempt.
5. Existing Gmail node — remains hard-blocked; on eventual release, errors go to receipt classification without retries.
6. Classify Email Receipt — accepted ID or ambiguous, never a fabricated sent result.
7. Existing Log Email Sent node now calls outreach_email_finish. Existing Mark Email Sent node returns the persisted result; it does not trigger legacy follow-ups.

The upstream Daily limit check node remains a closed entry gate until a real sender mapping and release configuration are available. The Gmail recipient expression independently throws, including manual execution. These are intentional release blockers, not operational quota logic. Migration 020 owns quota enforcement. Sender credentials are unchanged. Sticky notes are preserved; the historical original note is not a description of the new path.

Postgres nodes explicitly preserve zero-row output; all Code nodes set execution mode. Reservation, begin and finish calls have retries disabled. SQL JSON strings use manual single-quote escaping. Approval bodies, leases, budget controls and the zero AI allowance are unchanged. The only graph change is inserting the lifecycle checks and receipt path around the existing send node.

Tests use actual n8n routing/Code/IF nodes in a network-disabled scratch container, replacing database and Gmail operations with explicit mocks. They test accepted, timeout, empty receipt, reservation denial, begin denial and receipt-save rejection, including paired-item identity across multiple leads. SQL functions are tested separately in scratch PostgreSQL; this is not an end-to-end real provider test. Real Gmail receipt behavior, actual sender identity and delivery are UNVERIFIED.

Results: all six scenarios passed in actual n8n on 15 October 2026 (`email-workflow-results.json`); all eleven focused offline tests passed. The scratch run initially caught a bundled `draft` declaration collision; helpers are now enclosed in a function scope and all generated Code nodes have a compilation regression check. A separate scratch log-directory permission issue was also corrected. Neither failure affected production. PostgreSQL canonical string IDs normalize only when representable as safe positive integers; unsafe/malformed IDs reject.

On receipt persistence failure, n8n stops with an error and the activity remains attempting; do not retry the send node. On ambiguous receipt, retain the quota charge and reconcile manually. No automated resend or provider lookup has been implemented.

Before deploying: finish runtime validation, back up live workflow/schema, apply reviewed 020 and import 07A inactive, verify gates and logs. Before sending: bind and verify the real org-specific sender, configure a daily quota, resolve plan readiness through the existing review process and explicitly authorize release. Never remove offline blockers from an already approved plan in place.
