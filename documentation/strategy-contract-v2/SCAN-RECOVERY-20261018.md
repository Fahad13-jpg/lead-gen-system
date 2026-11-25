# Explicit mailbox scan recovery

Local/scratch implementation only. Migration 030 has not been applied to the live database; workflow 09 has not been imported or activated.

An expired or rejected page token must not silently skip mail. The trusted operator may request a restart using `outreach_delivery_scan_restart(jsonb)`. The request must contain org_id, activity_id, credential_ref, sender_email, an exact expected_scan snapshot, actor and reason. Accepted reasons are `page_token_rejected` and `operator_verified_scan_interruption`. A provider error alone does not call this function.

The function locks the activity, checks tenant/mailbox identity and compares the complete stored snapshot. It removes only the page token, marks restart_pending and records operator/reason/time/count in dispatch_metadata.delivery_scan_recovery. It preserves window start/end, checked-through time, review flags, suppression, stop events and send state. The next scheduled scan replays that same window from its first page. Duplicate stop events retain their existing event IDs. There are at most two operator restarts per activity; further recovery needs investigation, not a counter reset.

The function is denied to PUBLIC. The migration owner can execute it. A reviewed deployment must explicitly select a trusted operator role if a separate role needs access; customer-facing SQL access must not receive this permission. No new endpoint or table was added. A dashboard recovery button is not implemented.

## Operator procedure (written, not executed live)

1. Inspect the failure and confirm whether it is a rejected token or a transient connectivity/authentication issue. Do not treat every 400/401/timeout as an expired token. The exact Gmail token-error response is UNVERIFIED.
2. Read the scoped activity and its delivery_scan JSON; retain the snapshot for review. Confirm organization, sender and credential mapping.
3. For a confirmed interruption, submit the function request with that exact snapshot and operator identity. Never reconstruct a newer snapshot automatically after a stale response.
4. Confirm saved=true and complete=false. If stale, reread and investigate competing progress. If the restart limit is reached, stop and inspect; do not reset the limit.
5. Allow the configured schedule to replay the fixed window. Confirm a completed checkpoint and fresh conversation scan before expecting any follow-up to become eligible. Existing review flags continue to block sending.

## Tests

`test-delivery-checkpoint.cjs` applies 029 and 030 only to `scratch_v2_release_20261014` in the network-isolated `lead_diag_pg_20261011` container. The fixture grants the non-superuser runtime role execution only within the rollback transaction. It checks wrong tenant/credential, missing actor, successful restart, stale replay rejection, preserved bounds/checkpoint/review, pending restart rejection, and the two-restart ceiling, along with existing checkpoint tests. All passed.

73 local JavaScript regression tests passed. The workflow now prefers dispatch_metadata.recipient_email over the lead's mutable current email, so a later contact edit does not change the original bounce/reply identity. Legacy activities without recorded recipients use the current email and fail closed if it does not match the original message.

The actual n8n graph passed four mocked scenarios in the isolated scratch container: empty page, cross-thread bounce, partial pagination and operator-requested replay. Replay preserved the fixed window and review warning and consumed the restart marker. Results are in reply-workflow-results.json; no real Gmail request was made.

UNVERIFIED: authenticated Gmail behavior, expired-token error shape, attachment-backed delivery reports and real mailbox permissions. Sender onboarding, confirmed daily limits and deployment review remain separate release requirements.
