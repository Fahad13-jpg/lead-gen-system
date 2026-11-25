# Gmail executor and reply progress — local development

## Implemented

- 07A Schedule Trigger changed from hourly to every five minutes. SQL still owns eligibility, time windows, leases and quotas. Sending gates remain closed.
- 09 Schedule Trigger checks every two minutes, behind a closed mailbox-binding gate. One verified, fixed Gmail credential per workflow instance; this is not dynamic multi-account OAuth onboarding.
- Replaced the reachable legacy reply path (deprecated user ID, first-item attribution, fabricated replies and mandatory AI) with original-message and conversation retrieval, deterministic matching and immediate stop persistence. Legacy nodes and sticky notes preserved, disabled/disconnected where superseded.
- Match requires organization, actual configured credential reference, sender identity, recipient, Gmail thread, message references and message time. Unknown senders/references go to review. Automatic replies conservatively stop for review; no automatic resumption.
- Local migration 025 stores bounded reply excerpts and review details inside existing activity JSON. Calls existing idempotent stop function before advancing scan time. No new tables/webhooks. Oldest scanned activities selected first, ten per tick. This is bounded conversation rescanning, not Gmail history-cursor synchronization.
- Mockable polling helper has no network implementation, credentials or sending path.

## Validation

Node regression tests cover sender/tenant mismatch, false replies, duplicate events, nested MIME, empty messages, malformed timestamps, uncertain writes and existing send gates. Scratch tests exercise 024 and 025 as a non-superuser in `scratch_v2_release_20261014`, container `lead_diag_pg_20261011` (network none). Synthetic fixture transactions roll back. 023 is reapplied after older fixture generators restore 022.

## Not deployed / remaining

- 025 applied only in scratch; live DB/workflows untouched. Local 07A requires pending migrations 021–023; reply path additionally requires 024–025. Old rollout scripts are not a safe deployment bundle for these versions.
- UNVERIFIED: authenticated HTTP Request Gmail credential compatibility and full-message payloads in installed n8n; real mailbox ownership, permissions and controlled reply test. Tests did not contact Gmail or any model.
- Sender gate remains empty; no implicit org1 mapping or daily quota chosen. Existing 07A fixed Gmail credential cannot safely route arbitrary organizations. Verify each mapping before enabling an instance.
- Shared rolling-mailbox quota, minimum send spacing, fair multi-campaign dispatch and latest-reply checks immediately before dispatch remain to implement. Current SQL quota is the existing org UTC-day quota, not a new rolling mailbox limit.
- Reply read/write failures stop that workflow execution; they do not yet pause sending centrally. Do not enable sending until failure and inbox-freshness gates are wired into dispatch.
- Bounce/DSN parsing, unsubscribe classification/suppression, thread-aware outbound followups, OAuth reconnect handling and historical backfill remain. A matched unsubscribe text currently pauses as a reply, not a permanent unsubscribe classification.
- Reply matching is deliberately strict; aliases, changed subjects/threads, stripped reply references and delivery agents need review. No heuristic lead attribution.
- No Gmail send, model call, Apify run, live migration, import or activation performed.
