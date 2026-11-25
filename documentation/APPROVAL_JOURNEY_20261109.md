# Approval and revocation checks — 9 November 2026

## Scope and evidence

The existing network-none container `lead_016_1794141179811` and database
`scratch_contact_refresh_20261108` were used. The harness exercised actual
campaign save, queue admission, claim, strategy context, native template assembly,
strategy_finish, dashboard approvalLoader/approvalService and strategy_approval.
Identity and contact readiness were explicitly mocked. No Firebase login, provider,
model, send or live campaign mutation was involved.

The normal generated plan's `v2_offline_only` blocker was checked first and correctly
prevented approval. A separate scratch-only released fixture was used to test the
positive approval path. This fixture is not an eligible live lead or a production
release decision; the blocker remains unchanged in source and live plans.

All row changes and the tested function replacement rolled back. PostgreSQL
sequences may advance in scratch; no production sequence was affected. The scratch
container was stopped. Private results: `.local/approval-journey-20261109/result.json`.

## Findings confirmed against the live local function

The gateway already checks plan integrity and supported states. The SQL approval
function did not repeat those checks atomically with its plan-row lock. The scratch
baseline accepted a changed body under an old stored hash, an unknown v2 state, and
a string `"true"` fallback acknowledgement. These are defense-in-depth gaps; this
does not establish that an ordinary dashboard customer could bypass the gateway.

A read-only live definition check confirmed the same missing guards. Owner:
`n8n_user`. Baseline SHA-256:
`755b0275fefa1937188bb0ed34f3ba8f30d7ca1938c5067a6fa3db225bf326fb`.
The live definition was saved privately for rollback and parity checking.

Migration **054_strategy_approval_integrity.sql** strengthens the existing function:

- Recomputes the authoritative PostgreSQL JSONB body digest under the existing lock.
- Rejects unknown versions/states and malformed v2 approval/execution flags.
- Requires an actual JSON boolean for fallback acknowledgement, bound to the hash.
- Rejects missing action/blank actor without falling into an insert exception.
- Preserves customer-content acknowledgement, freshness, org scoping, history,
  function grants and the ability to revoke stale/blocked content.

No tables, webhooks, lease model, budgets, hashes or sending authority are replaced.
The user explicitly approved migration 054 and it is **APPLIED to local lead_db**.
The installer took a fresh backup and required an unchanged baseline. It verified
that the owner/grants, business records, AI allowance/ledger and processing gates
were unchanged. No workflow import, activation or n8n restart was needed.

Installation evidence: `.local/approval-054-install-1794215635809/result.json`.
Backup: `before.dump`; targeted rollback: `rollback.sql` in that same private
directory. Installed definition SHA-256:
`d66f2c6fb7e898162587644035b54f1c79e655ab7fa52ad638d345cf80f82e5c`.
The original definition and grants remain in `before.json`; this is a function-only
rollback and does not rewrite plan or approval history.

## Results

13 scratch checks passed: offline blocker, locked digest validation, unknown state,
typed fallback rejection, correct hash-bound fallback acceptance, customer review
requirements, invalid action/actor, gateway approval/actor, gateway integrity and
revocation, cross-org/hash rejection, normal revoke, expiry/revoke and unchanged
AI/outreach counts. Positive approvals always returned `execution_authorized:false`.

Five dashboard approval-service checks and seven UI checks passed. The UI already
cleared definite rejection markers; this behavior was retained and regression-tested.
The only new UI behavior disables approval for an older campaign version while
keeping revocation available. No content or acknowledgement gate was removed.
The frontend build `main.9793ae4e.js` compiled successfully and is served locally:
strategy review returned 200 with the new bundle, while anonymous plan access
returned 401. This read-only smoke check created no approval record.

## Still unverified

- Actual customer-browser login → generated, releasable plan → approval/revocation.
- Sendable personalized-message quality from current eligible real contact data.
- Desktop/mobile visual QA (the computer-use runtime was unavailable previously).
- Releasing the existing `v2_offline_only` gate; no release was performed here.

The previous four approved AI calls remain separate evidence. This test used zero
new requests and did not change the trial ledger or the monthly allowance.
