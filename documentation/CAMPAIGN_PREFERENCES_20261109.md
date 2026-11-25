# Campaign preferences — local integration, 9 November 2026

Owners/admins can open **Edit campaign preferences** from strategy review and edit
offer/copy/channel settings plus tone, timezone, working hours/weekdays, existing
follow-up delays, plan validity and listing/source-check freshness. Members can
inspect the settings. These are preferences for newly generated plans, not a
reschedule of previously approved messages. Language localization remains deferred;
the saved daily cap can be edited within the existing sender ceiling.

The local gateway has been reloaded with this integration. The frontend build is
`main.074ff347.js`; GET `/campaigns/1/preferences` returned 200 with that bundle,
and anonymous GET of the campaign preference API returned 401. No live campaign
was saved as part of the rollout.

## Persistence and safeguards

- Reuses GET `/dashboard-api/api/campaigns?campaign_id=...` for a bounded preference
  projection and POST `/dashboard-api/campaign/create` for a preference update.
  No new n8n webhook, workflow node, migration or table is required.
- Every read/write verifies membership; writes additionally require owner/admin.
  The browser submits only allowed preference fields, campaign ID and expected
  version. It cannot replace sender binding, provider/billing settings, templates,
  offer, language or channels through this action.
- The gateway loads the current org-scoped configuration, checks the expected
  version, validates the merged settings with the existing canonical campaign
  validator, then calls the existing `strategy_campaign_save(jsonb)` function.
  The function locks the campaign and checks the version again, so a concurrent
  edit is rejected with HTTP 409. Strings are manually SQL-escaped.
- Preference writes use the gateway's existing fixed-function management write
  pool. Creation still follows the existing n8n campaign endpoint. Passing an edit
  through that endpoint's second normalization would drop the saved sender binding;
  the direct existing-function call preserves trusted extension fields without
  exposing them to, or accepting them from, the browser.
- Existing campaign history is retained. A new version changes the strategy
  fingerprint; old plans need regeneration/review and cannot reuse old approval
  as authorization for the new version. No approval records are deleted.
- Uncertain writes are not retried. A browser-session marker blocks another save;
  the user may read current settings to reconcile an exactly matching next version.
  A version conflict is a definite rejection and requires loading current settings.
  Confirmed saves can be followed by another edit of the current version.
- Requests changing organization cannot populate the next organization's screen
  with a stale response. Session markers are org/account/campaign scoped.

## Verification

- 45 backend checks passed: preference input bounds, version/race rejection,
  membership, safe projection, preservation of sender/extension data, escaped SQL,
  no retry, existing gathering/data/HTTP behavior.
- 12 UI tests passed across preference editing, strategy review and campaign
  creation, including duplicate clicks, uncertain-save remount/reconciliation,
  another edit after a confirmed save, and organization switching.
- Static UI detector reported no findings.
- Scratch database `scratch_contact_refresh_20261108` in the existing network-none
  container passed real SQL checks under `n8n_user`: version increment, stale-save
  rejection, history/template/sender retention, cross-org rejection and strategy
  fingerprint invalidation. Test changes rolled back; the container was stopped.
- Read-only checks of live campaigns 1/version 3 and 2/version 5 confirmed valid
  preference projections and permission to execute the existing save function.
  Live campaigns were not edited during testing.
- Browser inspection could not start because the computer-use runtime could not
  write its kernel assets. Visual desktop/mobile QA is **UNVERIFIED**.
- Authenticated end-to-end saving from an actual customer browser remains
  **UNVERIFIED**; mocked UI/service checks and scratch SQL checks are distinct
  evidence, not a claim that a real customer save occurred.

No model call, Apify run, outreach, live migration or trial-ledger change occurred.
AI processing remains paused; real-model verification of prompt v2.8 is separate.

## Recovery

For an uncertain save, use **Load current settings**; do not repeat the write.
For a mistaken confirmed edit, review the current version and save a correcting
version. Do not rewrite history, reactivate old approvals or auto-send a replacement.
For a code rollback, restore only these dashboard/gateway source changes and rebuild
the frontend; no database rollback migration is needed.

## Offer, channel and customer-copy editor extension

The preference form also edits campaign/product names, offer description,
approved benefits, prohibited claims, CTA/link, AI versus customer-template mode,
preferred channels and the channel assigned to each existing sequence step.
The English/email-only customer path exposes subject, initial copy and configured
follow-up copies; unsupported template languages/channels are visibly unavailable.
Copy whitespace is preserved. Dormant trusted templates survive channel/mode
changes; the browser cannot inject templates for unselected channels.

Changing benefits with existing indexed benefit-matching rules requires explicit
acknowledgement to clear those rules in the new version. No old rule silently
attaches to a changed benefit. The prior version retains the original rules.
Clearing rules does not prove offer relevance; later plans still require review.

Only changed preference fields are posted, and an uncertain-write marker retains
the desired snapshot for conservative read reconciliation. The campaign-save
request limit is bounded at 64 KiB to accommodate copy; other actions remain at
8 KiB. Canonical validation still bounds each field and rejects unknown variables,
invalid sequences, unsupported template combinations and malformed payloads.

Verification: 48 backend checks passed, then the additional dormant-copy
regression passed with all 12 preference checks; 14 UI tests passed (12 existing
screen tests plus two content-edit tests). The production build is
`main.fe77a74d.js`; the static UI detector returned no findings. Read-only queries
confirmed both real campaign projections. No live campaign version was changed.
Authenticated browser saves and visual QA remain **UNVERIFIED**. No migration,
workflow import, new table or webhook was needed for this extension.

The saved daily email cap can now be edited within the checked sender ceiling;
see STRATEGY_CONTACT_READINESS_20261109.md. Sender/mailbox/organization ceilings and
the existing shared-cap semantics remain unchanged. Language localization is
pending; merely accepting a language value is not a working localized template.
