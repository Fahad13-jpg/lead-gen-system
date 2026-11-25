# Email executor handoff — 19 October 2026

**20 October update:** The Gmail-only IPv4 preload is now deployed. All 60 post-deployment credential-free connectivity checks passed, and all three preload tests passed. n8n readiness and unchanged workflow activation were verified. See `GMAIL-NETWORK-FIX-20261020.md` for evidence and rollback. This supersedes the earlier networking-blocker status below for the tested window; long-term reliability and scheduled production operation are still unverified. Email sending remains inactive.

**20 October completion update:** The local controlled-release builder now produces inactive, expiring workflow artifacts restricted to explicitly listed organization/plan/hash/recipient/step combinations, preserving existing approval and quota checks. Its rollout/executor/sender regression suite passed 21 tests. Real Schedule Triggers also passed eight dispatch and four reply-scan cases in an isolated, no-network container with mocked external boundaries; the container exited with code 0. See `EMAIL-CONTROLLED-ROLLOUT-20261020.md` and `email-real-schedules-20261020.json`. No production workflow was imported or activated in this continuation. Org 1 has no production strategy plans, so the remaining release prerequisite is a real approved campaign with provider-verified recipients and an explicitly reviewed sending scope. Forced OAuth token refresh remains UNVERIFIED. Historical incomplete-test sections below are superseded by the final verification outcome.

## Implemented and deployed

07A/09 and migrations 021–031 provide approved/hash-bound email content, organization/mailbox checks, leases, committed one-attempt dispatch, quota/spacing, scheduled discovery, deferred work, MIME/thread references, deterministic reply/opt-out/bounce matching, paginated scan checkpoints, stale-scan blocking and bounded operator recovery. Sending/entry gates remain closed and workflows inactive. A sender policy is prepared for org 1: 10/day, 10 per rolling 24 hours, minimum 300 seconds.

031 closes a cross-campaign safety gap: attempting or ambiguous records block the same contact/address even under another plan, lead alias or sender. It changes only outreach_email_contact_gate; its previous definition was saved, scratch tests passed and the installed definition was verified. No records were reset to retry.

## Evidence

- Gmail profile identity matched mohmmadfahad53408@gmail.com.
- One real self-test email was accepted and the user confirmed inbox receipt. Exactly one attempt; no retry.
- Existing local/n8n mock tests cover sender isolation, MIME/threading, ambiguous receipts, persistence failures and closed gates.
- Fresh backup restore and the 021–030 sequence passed in scratch with a non-superuser owner.
- Final current-release SQL tests passed reply persistence/replay protection, opt-out/bounce suppression, follow-up reservation/begin denial and Pakistan/US timezone, weekend and DST boundaries. Fixtures rolled back.
- 031 tests passed cross-plan/contact/sender blocking, tenant isolation and safe unattempted reservations.

## Live threading test: incomplete, do not resend automatically

The user supplied fah7861234@gmail.com for a two-message test. A fresh scratch plan approved both messages without rewriting the earlier self-test plan. The first attempt hit a container network failure and is durably recorded ambiguous in scratch_email_thread_20261019. A bounded read-only Sent search with exact recipient/subject/time found zero matches. No follow-up or replacement was sent. This negative search is not treated as proof of non-delivery. The safe outcome is reconciliation, not resetting the attempt.

The read-only lookup succeeded with IPv4-first/family-selection settings confined to the temporary CLI client. No production DNS, Docker networking or n8n process options were changed. This does not establish a production connectivity fix. Live threading and inbound reply-stop verification remain UNVERIFIED; SQL and mock behavior are tested.

## Release boundary

The backend implementation is available, but email is not yet fully live-validated or ready for unattended prospect sending. Keep gates closed until the uncertain test is resolved and normal inbound reply behavior is verified. Count all external test attempts when calculating the first same-day production allowance; their counters are in scratch. No real prospect has been contacted.

The user has requested completion of email validation before moving to another executor.

## Final verification continuation

- The recipient confirmed that the earlier uncertain message was not received. A fresh Sent lookup also returned zero matches. Neither result resets the original attempt.
- The user explicitly approved a separate two-email test to the same owned mailbox, subject `Email executor final verification`, five minutes apart. Its records are isolated in `scratch_email_final_20261019`; the original ambiguous attempt remains quarantined.
- Gmail accepted both steps of this new test in the same actual Gmail thread. Attempts were at 17:10:10 and 17:16:14 UTC (over six minutes apart); the fresh pre-follow-up reply/bounce scan found no events or review flags. Receipt, attempt and thread evidence is retained under `.local/email-final-test-20261019`. The user confirmed replying, and a real inbound reply was matched to step 2 and persisted with one stop event.
- The current local regression run passed 66 tests. Current-release scratch SQL passed scheduling, reply persistence, replay protection, opt-out/bounce suppression and blocked follow-up checks. The test now checks denial and persisted opt-out independently of which prior blocking activity is encountered first.
- `finish-live-email-final.cjs` checks the actual conversation and bounded delivery-report window, persists scan evidence in scratch, and permits only the approved second message after the five-minute spacing. It refuses attempted-message replay. Its read-only mailbox mode also verifies that a matched real reply blocks further contact in SQL.
- Production workflows remain inactive; these temporary-client checks do not prove production network reliability or authorize prospect outreach.

### Final outcome

`email-final-verification-20261019.json` records two accepted messages in the same Gmail thread, one saved real reply/stop event, and both `outreach_dispatch_check` (step 1) and `outreach_followup_check` (step 2) returning `suppressed_replied_or_bounced`, with `ready=false` and `execution_authorized=false`. This verifies the actual reply stop independently of stale mailbox scans. The initial attempt to verify dispatch used step 2 (invalid for that checker); correcting the diagnostic to step 1 produced the recorded successful result, without changing runtime logic.

A later repeat mailbox scan encountered ECONNRESET. No sends were retried; the stored reply remained intact. Email sending, threading and inbound reply-stop behavior are now live-tested through the isolated native n8n HTTP client and scratch SQL. Unattended production connectivity and schedule activation remain outside that successful test and must not be claimed verified. The earlier ambiguous test remains quarantined. No further executor work should begin until the user accepts this remaining rollout boundary.
