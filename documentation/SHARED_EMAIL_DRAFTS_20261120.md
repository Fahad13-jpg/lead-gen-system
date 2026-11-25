# Shared email drafts

Campaigns → open a campaign → Prepare a draft → Shared message for a group.

Owners/admins can save one shared email template, select up to 10 businesses from all saved leads, a search or a CSV import, and preview every rendered recipient/message/follow-up. Saving shared wording uses the existing versioned campaign-preferences action. It explicitly switches email-only campaigns to template mode, preserves the existing sending sequence and requires fresh content review.

Preparation queues the existing native template jobs, with deterministic per-business request IDs. It uses no AI requests. Existing worker checks, queue limits, package policy and the template validator still apply. Businesses with pending/current valid drafts, missing data, replies, opt-outs or conflicts are excluded. The organization and campaign are locked during admission; reviewed evidence/template hashes are rechecked. Failed admission rolls the group back. An uncertain result is reconciled against durable jobs; explicit retries use the same IDs.

After processing, group review shows the exact saved messages. Only current, intact customer-template plans whose initial/follow-up artifacts exactly match the rendered template qualify. Group approval acknowledges customer-supplied claims and invokes the existing hash-bound strategy_approval gate in one transaction. Repeated approval does not insert duplicate approval records. Approval creates no release, enables no sending and grants no execution authority. Use Approve and start for the existing exact recipient/message scope and sending controls.

Initial scope: English plain-text email, at most 10 selected businesses and up to 25 listed matches per filter. Shared drafts do not use the AI service. Other channels and individual AI personalization remain on the one-business path. There is no automatic grouping, automatic factual claim verification or shared-template support for other channels.

## Implementation

- scripts/dashboard/draft-batch.cjs: fixed signed-review endpoints, existing SQL enqueue and approval functions, durable receipt lookup.
- scripts/organization-policy/customer-email-template.cjs: existing deterministic renderer.
- dashboard/src/components/SharedDrafts.jsx and DraftPreparation.jsx: shared/individual choice, template editing, selection, review and reconciliation.
- No migration, new provider credential, quota increase or scheduler change.
- Local Docker adds read-only mounts; release gateway images copy the scripts directory.
- Deployment DB privileges must cover SELECT/row locking of organizations, campaigns, jobs, plans and approvals, plus EXECUTE on strategy_context, strategy_enqueue and strategy_approval using the existing registry transaction role. No database grants were expanded here.

## Verification

Focused service tests cover changed/forged/other-actor reviews, concurrent duplicates, transaction rollback, idempotency, exact-message approval and role/batch limits. HTTP tests cover authentication, origin, methods and definite conflicts. UI tests cover explicit template saving, source selection, group review, acknowledgements and uncertain results.

A local SQL integration test cloned an email campaign inside a transaction, prepared two template jobs, materialized native customer plans, and checked group approval/replay against the real SQL gates. It was always rolled back. No real drafts, approvals, AI requests or outreach were committed by testing.
