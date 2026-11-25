# Strategy-generated manual Messenger messages

Installed locally on 16 November 2026. Messenger is an explicit channel in the
existing strategy agent, using its native evidence, benefit, claim, fit, schema,
AI allowance and approval checks. This is not reuse of an email/LinkedIn approval.

## Customer flow

1. Create a campaign and select **Messenger · manual send**. This selects AI mode,
   English and one initial step. Supply the actual offer, approved benefits, sender
   and CTA as usual. Saving does not request generation.
2. Request a strategy for a Facebook lead from the campaign. This uses the existing
   AI allowance; no separate free generation promise is made.
3. Review the generated message and approve its saved content. Failed output never
   becomes a template fallback or a copyable approved draft.
4. Follow the lead link in strategy review. The Manual Messenger composer loads
   the newest current approved Messenger draft for that lead, including campaign
   and plan identification. Generated text and target are read-only; revisions
   require a changed campaign/new strategy and approval.
5. Acknowledge review, then Copy message & open Facebook. Paste and send manually.

Initial scope is one message, at most 1,500 rendered characters, no follow-ups or
mixed-channel sequences. Targeting requires one unambiguous same-organization
source-linked Facebook Page observed within 30 days. It does not prove ownership,
prospect fit, permission or chat availability. Stops, replies and conflicting
evidence remain blockers. Separate user-written manual composition is retained
when no current approved Messenger draft is available and is not labelled approved.

## Implementation and validation

Migration 062 conditionally adds source observations to `strategy_context` only
for Messenger campaigns and includes them in its fingerprint. Existing campaign
contexts/fingerprints and function grants are preserved. No new tables, account
connections, provider sends, schedules or activity statuses were introduced.
The nine existing shared-runtime Code bodies were updated in the live planner;
graph, non-Code configuration and activation state were preserved. Installation
included rollback-only SQL checks, fresh database backup and workflow rollback.

The composer rechecks latest approval, exact message, source plan/hash, current
campaign version, expiry, integrity, context fingerprint, saved Page and known
stops before returning copy text. It never marks copy/open as sent or delivered.
Read-only SQL remains the dashboard access path for draft loading/preparation.

Focused native, embedded Code-node, approval-prefill, campaign configuration and
UI checks passed, along with existing native/contract regression checks. The
production build and static UI detector passed. Served assets were checked after
gateway reload, preserving existing email switches. No AI/model request, scraper
run or external message was made during this implementation. Real provider
generation and authenticated browser review/copy/open remain a user walkthrough;
mock responses validate integration, not live AI quality or Facebook delivery.

Evidence/rollback: `.local/messenger-strategy-20261116/` and
`.local/messenger-strategy-ui-20261116/`.
