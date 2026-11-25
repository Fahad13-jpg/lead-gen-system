# V2 sample and integration review

Read-only code/sample review on 2026-10-12. No workflow edits, database access, model calls or deployments. This document is the only file added in this review.

## Sample findings

| Lead | Finding | Assessment |
|---|---|---|
| 167 | Strong template-site fit; message only offers a demonstration with an enquiry form. | Safe but generic. The template-site finding appears only in internal notes; it is not a supported outgoing observation in the current compact brief. |
| 445 | Unclear fit; stored website result unknown. | Appropriately avoids claiming no website, but the draft has no lead-specific relevance. |
| 446 | Same evidence limitation and message structure as 445. | Safe category-level draft, not demonstrated intelligent personalization. |
| 447 | Same evidence limitation and message structure as 445. | Safe category-level draft; long business-name greeting also merits editorial review. |
| 449 | Weak fit; quotes “Orthodontics & braces”, then offers an enquiry-form demonstration. | The quote is traceable but does not establish why a website offer is useful. Internal notes acknowledge weak fit, yet the outward pitch remains essentially unchanged. |

The five responses were authored mocks. Passing validation demonstrates constraint enforcement, not actual model judgment or persuasive quality. No blind human ratings have been assigned. All real-gate examples have no permitted channel; illustrative message examples use explicitly synthetic permissions.

## Integration conflicts found

1. **Storage contract:** `database/migrations/015_outreach_strategy.sql`, `strategy_finish(jsonb)`, explicitly rejects versions other than `strategy_v1` and requires `messages` to be an array. V2 uses `strategy` and draft artifacts instead. Relabelling v2 as v1 would conceal the incompatibility and is not proposed.
2. **Reservation/recheck contract:** `strategy_ai_gate(jsonb)` creates a reservation and rejects an existing reservation (`already_reserved`). V2's injected gate is called before the first transport request and again before retries/repair. Directly mapping it to that SQL function would fail. A read-only reservation-validation operation is needed separately from reservation creation, preserving the same lease and reservation. Returning true blindly would bypass the intended gate.
3. **Lease metadata:** `strategy_claim` returns job ID, org ID, lease, input and execution, but not lease expiry. The v2 wrapper needs authoritative expiry and reservation identity. It must not invent these from local time or create a replacement reservation.
4. **Approval contract:** `strategy_approval(jsonb)` checks the database content hash, freshness and blocking errors, but has no explicit fallback acknowledgement check. V2's local SHA-256 must not replace the database's existing authoritative hash. Fallback acknowledgement must be enforced atomically within the existing approval transaction, scoped to that stored hash.
5. **Transport contract:** 06C currently has a single native HTTP request node with retries disabled. The v2 wrapper's repair and instrumented pre-send retry behavior is not wired into this graph. The native error code alone is not sufficient proof of pre-send failure. No graph restructuring or blanket HTTP retry setting was applied.

These findings come from local source definitions; deployed database function definitions and live n8n behavior were not checked in this review (**UNVERIFIED**).

## Proposed next implementation, not applied

Preserve all existing exclusive claims, billing limits, tenant checks, hashes and approvals. Prepare local compatibility changes that accept both plan versions, expose authoritative lease/reservation metadata, separate reservation creation from validation, and enforce fallback acknowledgement in the existing approval function. Prove the behavior against mocks first; SQL behavior still requires separately authorized scratch testing before any deployment.

Before model evaluation, improve the sample quality criteria: require an explicit evidence-to-approved-benefit rationale; flag weak-fit pitches for human review; distinguish genuine observed personalization from an irrelevant quoted service name. Do not turn a heuristic template-site flag into an unsupported assertion that the business needs a website. Do not change the deterministic fit verdict.

Per the instruction to stop and report rather than override structural decisions, wiring is paused at these compatibility boundaries. Existing workflow JSON, SQL, gates and zero allowance remain unchanged. No new test run is claimed for this read-only review; the prior 33 offline contract scenarios and four regression suites remain the last recorded tests.
