# Mailbox capacity and opt-outs — local/scratch only

Migration 026 extends `outreach_email_step_begin` without replacing its existing approval, plan hash, org quota, lease, recipient or sending-window checks. It requires explicit `email_dispatch.mailbox_rolling_limit` (1–9999) and `min_interval_seconds` (1–99999). No defaults or live sender policy were configured.

The normalized sender email identifies the shared mailbox allowance, even when different credential references use that same address. An advisory transaction lock protects capacity checking and the existing attempt write in a single transaction. All enabled current campaign policies for that address must be valid; the smallest cap and longest spacing win. Existing org UTC-day quotas remain additional constraints. Credential identity/ownership must still be independently verified; an email string alone is not authorization. Different aliases of the same physical mailbox are not automatically consolidated (UNVERIFIED); onboarding must canonicalize the actual account.

Counts attempts over the prior 24 hours, including ambiguous results. Falls back to historical sent time where no attempt timestamp exists; unassigned sender history within the org is conservatively counted. Invalid/future/missing attempt timestamps fail closed for review. Manual Gmail activity remains outside our counter.

Validation: non-superuser scratch SQL tests passed for rolling expiry, alternate credential references, conservative cross-campaign policy, minimum spacing, uncertain attempts and invalid timestamps. Two concurrent PostgreSQL sessions running the real step-begin function against synthetic approved plans yielded exactly one authorized attempt and one mailbox-quota rejection. No messages sent. Race database `scratch_mailbox_race_20261018` is retained; script refuses overwrite. Cross-organization simultaneous execution has not been separately tested.

Reply matching now classifies only explicit standalone English unsubscribe requests as opt-out. Quoted footers, negations and questions do not trigger automatic permanent classification; ordinary matched replies still pause for review. Automatic responses remain review pauses. Migration 025 accepts the scoped opt-out event, and existing step checks prevent further outreach to that lead. Broader language handling and suppression of other lead records sharing an address remain pending.

## Remaining before activation

- Integrate capacity preflight and safe deferral before reservation. A begin denial currently retains a reserved record requiring review; do not enable this as a finished queue scheduler.
- Validate actual Gmail sender ownership/read permissions, configure sender mapping and approved limits, and implement fresh-inbox gating before dispatch.
- Complete bounce handling, address-level suppression, outbound threading, OAuth reconnect handling and deployment bundle validation.
- 026 is scratch-only. Reapplying 023 overwrites the new begin function; apply 026 after 023. The reply-scan test currently reapplies 023, so rerun the capacity test afterwards to restore 026 in the shared scratch DB.
- Gmail nodes, mailbox access and live sends remain UNVERIFIED; all live workflows and data untouched in this work.
