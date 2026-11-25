# Manual LinkedIn dashboard — 10 November 2026

15 November acceptance checkpoint: the installed live queue returns no items,
manual_only=true and execution_authorized=false. All organization-1 saved research
contains zero person profiles and zero usable person-profile URLs. There are no
saved linkedin_manual_v1 plan artifacts or enabled manual LinkedIn campaigns.
Thus the customer lifecycle walkthrough remains pending real target evidence,
campaign setup, draft and content approval. A profile owned by the user or used
with permission, and its actual business association, has been requested. No
identity evidence, approval or customer outcome was fabricated. No LinkedIn API,
scraper, AI request, profile visit or message was performed by this preflight.

Once an eligible task exists, the walkthrough is: Outreach → LinkedIn; verify the
displayed target; Open checked profile; Copy connection note and verify that copy
does not mark anything sent; use Skip this task for a no-send dismissal, then
check its saved customer-reported outcome in outreach history. Do not report
request_sent, accepted, message_sent or reply without the corresponding real
customer action. A real sending lifecycle is a separate user action.

The user then supplied `https://www.linkedin.com/in/muhammad-f56/` and explicitly
selected personal-test-only use. A labelled owned-test record (lead 481), dedicated
template campaign 5 and unapproved plan 13 are now saved through ordinary campaign,
enqueue, claim and finish functions. The profile assertion is recorded as
`user_supplied_personal_test_profile`, independent_verification=false and
business_affiliation_claimed=false. Research storage describes that assertion;
no scraped page, website assessment or independent identity check is fabricated.
No AI allowance, approval, task or external send was used. The campaign has one
manual LinkedIn step, daily preparation cap 1 and explicit no-send copy.
Preparation evidence is `.local/owned-linkedin-walkthrough-20261115/prepared.json`.
Next is the customer's content review/approval, explicit Add LinkedIn task,
opening the supplied profile, copying the connection note and reporting Skip.

The first website-assessment worker subsequently completed a partial/no-website
assessment and invalidated the initially stored research, making plan 13 stale.
No content approval had been recorded. After confirming that this test record had
no pending/processing enrichment tasks, the operator restored only the user's
personal-profile assertion against the completed assessment fingerprint and
generated deterministic plan 14 through ordinary enqueue/claim/finish. Plan 13
was expired without modifying its content. Plan 14 is current and unapproved;
no AI or external message was used. The task controls correctly remain disabled
until content approval is recorded. Recovery evidence: `refreshed.json` in the
owned-linkedin-walkthrough directory. The user should review/approve plan 14,
refresh, and then select Step 1 under Manual LinkedIn task.

The user prepared task 15 from plan 14; its saved state is ready with sent_at
null and no reported events at the combined-button checkpoint. The UI now has
**Copy note & open LinkedIn** and, for accepted connections, **Copy message &
open LinkedIn**. These use the existing authenticated copy events and SQL approval
gate. The exact returned approved text is copied before opening the canonical
checked person profile, keeping the dashboard focused for clipboard permission.
No message is prefilled or sent, and no sent/accepted outcome is inferred.
Clipboard denial offers selectable text and a profile link; blocked or closed
popups offer an explicit Continue to LinkedIn link. Rejected/uncertain copies
never open the profile or repeat a request. Unsafe destinations are rejected.
Ten focused UI checks passed, including these outcomes and existing no-repeat
event/preparation reconciliation. No backend authority or schema changed.
The customer must still paste/send inside LinkedIn and explicitly report real
outcomes. For this no-send test, use Copy note & open LinkedIn and then Skip.

Customer no-send walkthrough passed on 15 November: task 15, plan 14. The user
confirmed using the combined action; SQL records two explicit copy_note clicks
and the subsequent skip report. Final state is manual_skipped / skipped, with
sent_at null and provider_verified=false. This accepts the personal-test profile
open/copy/customer-dismissal path; it does not establish a real connection request,
acceptance, message delivery, reply receipt, or automatic person discovery.
Evidence: `.local/owned-linkedin-walkthrough-20261115/walkthrough-result.json`.

Implemented in the existing React dashboard and authenticated gateway. No new
tables, migrations, webhooks, LinkedIn credentials or automated sends were added.
The installed migration 045 remains the lifecycle authority.

## Customer operations

- In campaign review, a current approved manual LinkedIn plan exposes its exact
  checked person profile, connection note, message and delay. An owner/admin can
  explicitly prepare one due step. The database retains approval, fingerprint,
  matched-person freshness, delay, suppression and daily task-limit checks.
- In **Outreach → LinkedIn**, members see unassigned tasks and their own tasks;
  owner/admins can see all tasks and assign a task to themselves. Arbitrary team
  assignment and member directory management were not added.
- Open checked profile is an explicit external link. Copy requests use the current
  SQL gate and return approved text; copy never reports a request or message sent.
  Clipboard failure offers selectable text instead of falsely claiming success.
- Explicitly acknowledged reports cover request sent, already connected,
  acceptance, message sent, reply, refusal, opt-out, wrong person, snooze and skip.
  Reports remain customer reported and provider_verified=false. Existing stop
  functions handle replies/opt-outs even after approval expiry or revocation.
- Unknown outcomes persist in session storage. Refresh checks the same saved
  actor/event/hash/action, or exact prepared plan/step/hash, without repeating a
  mutation. Unconfirmed outcomes require reconciliation.

## Backend boundaries

Fixed routes: GET `/dashboard-api/api/linkedin-queue` and `linkedin-receipt`;
POST `/dashboard-api/linkedin/event` and `linkedin/prepare`. Origin, bearer,
request-size and rate checks use the existing gateway. Actor and management
permission come from verified organization membership, with a second membership
check in the write statement. The browser cannot supply either privilege.
Preparation also verifies the current plan version/hash and any configured
assignee against active same-organization membership. SQL uses bound parameters.

Queue reads include at most the first 100 active tasks before visibility filtering;
this is an explicit initial bound, not complete pagination. Completed/stopped tasks
remain visible through existing outreach history. Task creation is explicit; the
scheduled helper remains inactive and its generation flag remains off.

## Verification and remaining work

Five service tests and the fixed-route authentication/origin case passed. Four
plan-projection tests passed, including exact bounded manual copy and exclusion of
private artifact fields. Seven relevant React tests passed (manual actions and
existing plan review). Production build: `main.3ea41534.js`.

The real read-only adapter loaded the empty local queue and parsed both action
queries with EXPLAIN without ANALYZE. It created no activity or customer event.
Evidence: `.local/linkedin-dashboard-20261110/read-adapter.json`.

14 November: campaign creation and preferences now include explicit manual
LinkedIn settings for a dedicated English AI campaign: enablement, a bounded
daily task-preparation cap, and an optional connection note. Settings use the
existing versioned save and invalidate older plans normally. Public requests
cannot replace trusted target-profile mappings or assignees; those fields remain
private. Existing template and mixed-channel paths were not silently widened.
Twenty relevant backend checks and fourteen relevant React checks passed. A
fixture connects saved settings to the existing manual artifact handoff while
retaining matched-person evidence, operator opt-in and false execution authority.

The updated dashboard build passed with one minifier worker on the 4 GB host:
`main.229002dc.js`. The gateway is started locally with both email start switches
false. The temporary build helper is `.local/build-dashboard-small-memory-20261114.cjs`;
it limits parallelism and heap use without disabling CRA build checks. No Docker
service was stopped or restarted for this update. The operator LinkedIn generation
switch and existing campaign/workflow activation were not changed.

Still UNVERIFIED: authenticated browser/customer manual-task acceptance with an
eligible approved plan. The operator generation switch remains disabled and no
new model request is authorized by a configuration save. No customer task was
fabricated to hide missing evidence.
No LinkedIn connection request, message, browser automation, inbox read, model or
Apify call was performed by this work.
