# Email implementation checkpoint — 15 November 2026

End-to-end preparation update: user created campaign 4 and confirmed sender
`mohmmadfahad53408@gmail.com` and owned recipient `fah7861234@gmail.com`. This
exposed a remaining customer-template admission mismatch; migration 059 now
recognizes the properly reviewed customer format while retaining hash-bound
customer acknowledgement, current render, authority, quota and lease checks.
The earlier implementation-ready statement was too broad for this branch.
Isolated format checks passed; the old function definition is saved for rollback.
Campaign 4 version 3 and plan 6 were prepared through normal campaign save,
enqueue/claim/finish functions. The contact is explicitly labelled owned test
data with source-record evidence and unknown deliverability, never provider
verified. Global processing stayed paused, no AI was called, and no approval,
release or email was created. The user is reviewing plan 6 before sending.
Evidence: `.local/owned-email-test-20261115/`.

Plan 6 became stale when the normal background basic/contact checks finished
after its creation; the attempted UI approval did not persist. The same outgoing
messages were regenerated through enqueue/claim/finish as current plan 7. Global
processing was checked disabled before commit, from an independent session, and
after commit. No approval or send was written. The user must review/approve the
current plan hash. See `refreshed-plan.json` in the same private directory.

Email implementation is ready locally for a reviewed eligible campaign. The local
campaign approval/start/pause/revoke controls and one-minute renewal supervisor are
enabled. There are **zero approved campaigns**; no campaign has been launched and
no new email was sent. The separate legacy manual-batch start switch stays off.
Enabling controls is not an approval or permission to contact recipients.

## Closed in this pass

- Verified the real n8n create/start/pause API contract with two inert fixtures.
  Both installed inactive; reply monitoring started before sending; pause retained
  reply monitoring. The fixtures contained no credentials or provider nodes and
  were both deactivated afterward. This validates the controller/API lifecycle,
  not live customer campaign transport.
- Fixed the demonstrated multi-day blocker: check workers previously ignored
  ready senders even after their 24-hour readiness proof expired. A manual recheck
  changes the sender version and requires campaign rebinding, which could stall
  a later-day follow-up.
- Added migration 058 and updated Gmail/SMTP check branches. Ready connections are
  eligible for a routine identity/capability refresh after 12 hours. Successful
  verification updates freshness while preserving the sender version, limits,
  credentials and existing campaign approvals. Failed verification clears
  capabilities and increments the version, blocking old campaign bindings.
  SMTP also checks the bound inbox reference. Manual reconnect/recheck behavior,
  send admission, quotas, recipient checks and one-attempt transport are retained.
- Installed the function and two worker updates after backup and idle checks.
  Workflow activation was preserved. The SMTP shared worker hash changes for the
  check-only fix; the earlier `015b...` hash is now historical. Its sending/reply
  branches and the separate campaign SMTP namespace were not altered.
- Ran the existing Gmail check workflow once. It returned ready, and readback
  confirmed fresh capabilities with the same registry version. No inbox scan or
  message send accompanied that check.
- Enabled the local supervisor only after confirming zero approved authorities.
  A real runner pass found zero campaigns and performed no release or installation.
  The Campaigns page is served locally; normal user authentication, scope review,
  explicit acknowledgement and all SQL gates remain mandatory.

## Verification reused or performed

Prior live evidence already covers two emails in the same Gmail thread and a
matched reply (`.local/email-final-test-20261019`). No repeat send was needed for
this change. Existing campaign authority, pause/revocation, lease, exact-step and
send-admission checks remain applicable.

This pass added real inert n8n lifecycle acceptance, 13 focused Gmail/SMTP worker
checks, and eight isolated SQL checks rolled back in the network-disabled scratch
container. The final read-only check confirmed ready/fresh Gmail, preserved
registry version, zero approvals and inactive probe workflows.

Evidence:

- `.local/email-installer-acceptance-20261115/result.json`, `cleanup.json`.
- `.local/email-completion-20261115/refresh-scratch.json`, `install-journal.json`.
- `before.dump`, worker backups and `rollback.sql` in that same private directory.
- `.local/gmail-recheck-last-result.json`.
- `.local/email-completion-20261115/controls.json`, `completion.json`.

The local gateway currently runs with `EMAIL_CAMPAIGN_RENEWAL_ENABLED=true` and
`EMAIL_BATCH_DASHBOARD_START_ENABLED=false`. Its default startup remains off;
restarting manually without those flags does not silently resume automation.

## Acceptance limit

A real customer multi-day campaign through the new renewal installer has **not**
been run. The inert API fixtures and prior Gmail delivery evidence do not claim
that result. Current saved clinic plans still need eligible contact evidence and
current content/scope approval before release; no data, consent, approval or
sender binding was fabricated to make a campaign sendable. A new eligible campaign
can now use the local controls. Customer SMTP account acceptance and Google's
production OAuth availability remain account/provider-specific requirements.

When moving to another channel, retain this limit rather than repeatedly reopening
passed email implementation checks. Deployment hosting, domains and production
process supervision remain in the later whole-system deployment phase.

## Controlled owner-account acceptance in progress

The user approved and started organization 1, campaign 4 version 3, plan 7 for
the single owner-supplied test recipient. This uses customer template messages,
not AI generation. The approved sequence is an initial email, a same-day second
email subject to the five-minute sender interval, and a third email one day later
only if no stop condition has been recorded. Scope ends 17 November at 18:00 PKT.

The first installation suspended because n8n resolved the credential display
name while preserving its ID. The controller now ignores only credential display
names during remote workflow comparison; IDs, types, node parameters, connections,
settings and project ownership remain checked. Twelve controller checks passed,
including normalization reconciliation and rejection of changed credential IDs.
The three supervisor checks also passed.

The existing inactive reply workflow was reconciled without another create. The
send workflow was installed, reply monitoring activated first, and sending then
activated under the same approved slice. Both activations were confirmed in the
private slice journals. The gateway supervisor was restored with renewal enabled
and manual batch starts disabled. This is not yet proof of delivery or reply-stop
acceptance; those require the scheduled runs and the owner's reply to email two.

The first real scheduled send (execution 168582) failed at **Load Sender Profile**:
Google rejected the authorization grant/refresh token. It never reached message
reservation or send; plan 7 has no outreach activity. The exact candidate query,
sender-policy filter and pure customer-message rendering passed diagnostic checks
(database checks rolled back). Campaign automation is now paused at revision 6,
and both test workflows are confirmed inactive. Reconnect the existing Gmail
sender through Settings; then refresh its binding and obtain current approvals
before resuming. Do not repeat the old slice or treat activation as delivery proof.

The user subsequently authorized a second connection to the same Gmail mailbox.
It passed its initial identity/scope check and is ready. The test was rebound
through normal versioned campaign saves to campaign version 5. Plan 8 contains
the exact same three message bodies and recipient as the approved earlier test;
it has no content approval or automatic authority. Global strategy processing
remained disabled outside the draft-generation transaction, and no AI was used.
Current content and campaign scope approval are required before starting again.

The user approved plan 8 and started campaign version 5. Both new workflows
installed and activated without manual installation recovery. The first scheduled
send completed successfully: activity 13, Gmail external ID `1a1dec679e8fcd8f`,
provider accepted at 2026-11-15 10:35:10 UTC (15:35 PKT). Inbox arrival has not yet
been confirmed by the recipient. Follow-up/reply-stop acceptance remains pending.

Activity storage uses a UTC `timestamp without time zone`. The renewal snapshot
now explicitly converts it with `AT TIME ZONE 'UTC'` before JSON serialization,
preventing the Windows scheduler from reading it as Pakistan local time. A live
snapshot verified the correct UTC instant and elapsed age. Database timing guards
were already evaluating the stored timestamp correctly. The four dashboard
authority checks passed; the broader renewal suite had one unrelated expired-date
fixture failure in its SMTP adapter test (its fixed November 10 slice expires
before the current date). This is not recorded as a fully passing renewal suite.

## Owner Gmail acceptance passed

The recipient confirmed receipt of email two and replied in the same thread.
Activities 13 and 14 are provider accepted, share the same reply-thread reference,
and both have a recorded reply stop. Before cleanup, with automation still enabled,
the actual renewal decision returned `renew:false` with reason
`lead_stopped_or_unconfirmed`; no third activity exists. This verifies real initial
send, follow-up, threading, reply persistence and automatic reply-stop admission.
It does not claim an elapsed next-day observation, SMTP acceptance, bounce/opt-out
live acceptance, or production OAuth verification.

The paired slice monitors overlapped a scan: one committed the reply/checkpoint
while the other reported `REPLY_SCAN_NOT_PERSISTED` on the compare-and-set fence.
The saved reply and stop were verified directly; that warning was not a lost reply.
Avoid treating this warning as a need to resend. Reducing duplicate mailbox scans
is separate operational polish, not a failed send or missing stop in this test.

Evidence: `.local/owned-email-test-20261115/end-to-end-result.json` and
`end-to-end-cleanup.json`. After capturing the reply-based denial, campaign 4 was
paused normally and its four current test workflows were confirmed inactive.
The two earlier failed-authorization slice workflows remain inactive as well.
