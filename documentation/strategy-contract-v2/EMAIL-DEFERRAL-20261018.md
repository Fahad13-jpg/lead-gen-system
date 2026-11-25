# Safe email deferral — local/scratch only

Migration 027 extends the existing reservation record; no new table or job-state enum is introduced. Supported begin denials (org quota, rolling mailbox quota, mailbox spacing and the checked sending-window boundary) record a next check time at least five minutes away. The reservation keeps `state=reserved`, `attempts=0`, with no `started_at`, and its old lease is removed. Execution remains unauthorized.

The scheduler's existing candidate query now permits those explicitly deferred, due reservations. Reserve rechecks approval and content hash, locks the plan/activity, and renews the same unique plan/step record with a new lease. An old lease cannot begin a send. Missing, malformed, ambiguous, attempting, accepted or previously started records are never reclaimed. This is not a generic retry mechanism for expired leases or uncertain provider calls.

The injected executor returns `queued` with `next_check_at`, not a failed send. No transport/finish call occurs for that outcome. Followup checks recognize due unattempted reservations; their existing previous-confirmed-send, reply and plan checks still apply.

## Tests

`scripts/diagnostics/test-email-deferral.cjs` runs as the existing non-superuser role in network-isolated `scratch_v2_release_20261014`. Verified actual step begin -> quota deferral -> early claim denied -> simulated due time -> new lease -> old lease denied -> exactly one authorization. Attempted, ambiguous and malformed records cannot resume. Synthetic rows roll back. No sending.

Migration 027 is applied only to scratch. Local 07A now depends on 027. Apply order for a future reviewed bundle: 021, 022, 023, 024, 025, 026, 027. Reapplying 023 or 026 later replaces functions from 027. Older deployment scripts remain unsuitable without updates.

## Remaining

Mailbox identity verification, fresh-inbox gates, bounce/address-level suppression, outbound threading, OAuth reconnection and authenticated Gmail runtime tests remain incomplete. Some early eligibility denials (before the supported begin branches) still require review; this change does not promise automatic recovery from every blocker. Quota `next_check_at` is a recheck time, not guaranteed delivery time. Workflow sending/entry gates remain closed. No live import, migration, activation, Gmail access or provider calls.
