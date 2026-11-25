# Manual LinkedIn outreach — local implementation

Status: **deployed to local n8n, inactive**, on 2026-10-28. Migration 045 is applied
to live `lead_db`. Both 7B and 6C are inactive; the LinkedIn feature flag is off.
See [deployment verification](LINKEDIN_MANUAL_DEPLOYMENT_20261028.md).
No new tables, webhooks, credentials or LinkedIn provider connection were added.
No model/Apify request, message, connection request or invitation was sent.

10 November update: the React dashboard now provides task preparation, the manual
queue and customer-reported actions through Firebase-verified membership. See
[dashboard implementation and remaining gaps](LINKEDIN_MANUAL_DASHBOARD.md).
The older Flutter references below describe the original proposed client; current
client development uses React. Scheduled preparation and generation stay disabled.

## Customer flow

1. Enrichment supplies a matched person's profile with current evidence. A company
   page is research context, not a connection target. Missing, conflicting, future,
   stale or ambiguous matches require review; no CEO/profile is invented.
2. A selected LinkedIn campaign and the operator's `LINKEDIN_MANUAL_ENABLED=true`
   opt-in let strategy v2 prepare a manual artifact before hashing and approval.
   The flag is not set on the live system. Existing plans are never rewritten.
3. The artifact contains the target/provenance, a neutral or customer-supplied
   connection note and the exact strategy message/follow-up drafts. No new AI call
   happens in the helper. AI-mode still obeys the unchanged allowance and budgets.
   Customer templates are rendered before approval and explicitly labelled as
   customer supplied; that label is not independent verification of their claims.
4. Normal plan approval is required. The schedule prepares idempotent activity
   records in existing `outreach_activities.dispatch_metadata`, one per plan/step.
5. Flutter can show Open profile, Copy note, Request sent, Already connected,
   Accepted, Copy message, Message sent, Reply received, Not interested, Opt-out,
   Wrong person, Snooze, Skip and Assign actions. Flutter is not implemented here.
6. Copy never sets sent_at or advances send state. First copy/action claims an
   unassigned task atomically. Another member cannot operate it without verified
   management permission. Assignment targets must be verified same-org members.
7. Acceptance must be reported before message sending. Follow-up timing starts
   from the server timestamp of the customer's confirmed message report, never
   draft generation or copying. This conservative time can be later than the
   actual send; no claimed independent delivery/read measurement exists.
8. Queue reads expose due reminders only within campaign working hours and after
   snooze expiry. Awaiting acceptance and awaiting reply do not prompt another
   initial request. Customers may still operate LinkedIn outside our dashboard;
   working hours and preparation limits cannot enforce LinkedIn-side behaviour.
9. Replies/refusals stop the current automated conversation using the existing
   durable reply mechanism; explicit opt-out/wrong person use existing stop events.
   A stop can be recorded even after plan expiry or revocation. Copy/send actions
   require current approval, unchanged snapshot, fresh evidence and no stop.

All action, acceptance and reply states are **customer reported**, not
provider-verified. No automatic inbox/acceptance detection exists. Pasted replies
are stored as bounded plain-text notes (1000 characters), not executed as commands
or interpreted as independent evidence. Automatic reply interpretation is deferred.

## Content and scope boundaries

- Connection notes default to at most 200 Unicode characters; messages at most 500.
  These are conservative product limits, not a claim about every LinkedIn account.
  Unknown template variables, missing values, prohibited claims, unapproved URLs
  and unscoped website-absence claims are rejected. Content is never silently cut
  after approval. Customer message templates must include `Reply STOP to opt out.`;
  invitation notes need not contain that line within their short allowance.
- LinkedIn's own personalized-note allowance is separate from our service plan.
  `daily_task_limit` controls task preparation (default 10, 1–100); it is not a
  guaranteed safe LinkedIn invitation quota. The old workflow sticky note's 300
  characters / 20–30 invitations recommendation is preserved but superseded.
- Same-channel LinkedIn sequences work. An approved email → LinkedIn suffix is
  gated by the previous confirmed email and existing email/reply-check gate.
  Call/SMS/WhatsApp → LinkedIn is explicitly blocked pending integration review.
  Switching from LinkedIn back to an automatic executor is not implemented: the
  generation handoff leaves such plans blocked for review. No existing executor's
  receipt, lease, budget, approval or retry rules were relaxed.
- Existing customer-email-only plan generation is unchanged. It is not silently
  upgraded to mixed LinkedIn campaigns. Configure a dedicated LinkedIn campaign
  for the initial rollout; missing artifacts receive an explicit review blocker.
- Changing target or outgoing content requires a new plan and approval. Retire
  the old task with Skip if necessary; don't edit its activity draft. An expired
  pending task can be skipped so it does not block a newly reviewed campaign.
- No extension, cookies, password collection, automatic profile opening, clicking,
  connection requests, InMail sending or LinkedIn inbox scraping is included.
  Open profile is a customer-initiated link to a validated linkedin.com/in/ URL.

## Campaign configuration

The existing campaign normalizer now preserves and validates this optional key:

```json
{
  "linkedin_manual": {
    "enabled": true,
    "daily_task_limit": 10,
    "assignee": null,
    "target_profiles": {},
    "connection_note": null
  }
}
```

`target_profiles` optionally maps a lead ID to one of its current matched profiles,
e.g. `{"167":"https://www.linkedin.com/in/example-owner/"}`. It cannot introduce
an uncorroborated profile. `assignee` is an opaque member reference; a trusted
application must validate it before saving campaign configuration. This application
login/member mapping remains UNVERIFIED; no public route is enabled.

Existing `templates.linkedin.body` and `.followups` support customer text.
Available placeholders: company_name, city, offer_name, offer_description, cta,
demo_url, sender_name, sender_company. `connection_note` accepts the same variables.
All text is rendered, length-checked and put inside the approved artifact. The
neutral default note does not claim familiarity, praise or knowledge of a need.

## Backend / Flutter interface contract

`scripts/linkedin-manual/backend.cjs` is an injected-auth adapter, **not an HTTP
endpoint**. A future trusted dashboard backend supplies:

```js
{
  org_id: 1,
  member_ref: 'opaque-member-id',
  can_manage_outreach: true,
  can_manage_assignments: false,
  assignable_member_refs: []
}
```

These fields come from verified membership, never request arguments or model output.
All SQL functions revoke PUBLIC execution and grant the existing `n8n_user` role.
They are trusted database operations, not a customer authentication mechanism.

Operations:

| Operation | Arguments | Result |
|---|---|---|
| queue | `{}` | Up to 100 active items, state counts, assignee, profile, immutable drafts, due flag and gate reason |
| prepare | `{plan_id, step}` | Prepared activity or explicit gate/duplicate/quota reason |
| event | `{activity_id, content_hash, action, event_id, confirmed_by_customer:true}` | Customer-reported receipt or rejection |

Optional event fields: `note`, `snooze_until` (future RFC3339 with offset, ≤30 days),
`assignee`. Event IDs must be persisted by the client; reusing an ID with different
content is rejected. Assignment permission cannot be passed by the caller body.
Copy events return the exact approved `copy_text`; update the clipboard only after
success. An idempotent replay returns a receipt without repeating clipboard work.
UI must honour rejection/due states and never treat a copied/opened item as sent.

`Open profile` needs no backend write. For a pasted reply, send action `reply`
with its text in `note`; a saved reply pauses outreach immediately.

Queue statuses: ready, request_sent, accepted, message_sent. Terminal statuses
appear in aggregate counts: replied, not_interested, opt_out, wrong_person, skipped.
Lifecycle events remain on the activity JSON for the existing lead history view.
History UI and pagination beyond the bounded queue are deferred to Flutter work.

## Workflows and deployment boundary

`07B_linkedIn_outreach_helper.json` keeps its original graph and sticky notes,
adds a corrective note, uses explicit Code modes and alwaysOutputData on PostgreSQL
nodes. It schedules every five minutes but is inactive, with operator org binding
0. It prepares tasks and reads reminders; it has no sending node. Successful and
failed execution payload saving is disabled.

`06C_outreach_strategy_generator.json` only refreshes embedded runtime/strategy
bodies and the opt-in branches. Its graph, routing tails, modes and sticky notes
are preserved. AI generation/provider gates are unchanged.

Before deployment, obtain approval; take a fresh backup; apply migration 045;
review same-org member mappings and campaign limits; set only the approved org
binding and feature flag; import the two reviewed workflows. Do not activate
calling, change AI allowance, or rewrite already approved plans. Test the manual
flow without sending, then connect the authenticated Flutter controls. Rollback:
disable only the helper/feature flag, restore the previous two workflow versions,
retain historical activities. Drop the four new functions only after checking
dependencies; no table restoration is required.

## Verification

- Offline tests cover target URL filtering, current/ambiguous evidence, suppression,
  template rendering/claims/limits, state transitions, assignment authentication,
  generation hashing, actual embedded n8n Code execution and unchanged old routing.
- Network-isolated scratch SQL tests use the existing enrichment_report and
  strategy_context chain, prepare tasks and exercise copy/acceptance/send/delay,
  revocation, immutable snapshots, ownership, snooze, quota, cross-org refusal,
  late opt-out, refusal/reply stopping and malformed payloads. All fixture rows
  and functions roll back. No live DB is touched.
- UNVERIFIED: activation/end-to-end execution on local n8n, real Flutter authentication/member
  mapping, clipboard/UI behaviour and LinkedIn-side actions. These are not claimed
  as live or end-to-end tested. Customer LinkedIn tier/allowance is not inspected.

Commands:

```
node scripts/linkedin-manual/build.cjs
node scripts/lead-strategy/v2/build-native.cjs
node --test tests/linkedin-manual/*.test.cjs
node scripts/diagnostics/linkedin-manual-scratch.cjs
```

The last command hardcodes only `lead_diag_pg_20261011` /
`scratch_email_release_20261019` and requires network mode `none` before running.

LinkedIn references reviewed 2026-10-28:
- https://www.linkedin.com/help/linkedin/answer/a563153/personalizing-invitations-to-connect?lang=en
- https://www.linkedin.com/help/linkedin/answer/a1340567/automated-activity-on-linkedin?lang=en
