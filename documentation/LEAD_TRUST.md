# Lead trust reporting

Migration `013_lead_trust.sql` adds `lead_trust_report(org_id, lead_id)` and includes
its result in the existing enrichment report API. It reports confidence limits;
it does not perform additional collection or provider verification.

## Contract

- Organization ownership and contact eligibility are required.
- Website evidence must be less than 30 days old and match the current input
  fingerprint. Research must be less than seven days old and match its input.
- Outreach context is withheld if either evidence layer is stale or business
  conflict flags exist. This API gate does not retrofit the legacy outreach flows.
- An email status flag alone is insufficient. Provider evidence must include
  deliverability, SMTP, format and MX success, with disposable and catch-all false;
  the contact must be eligible and its verification dates current, not in the future.
- Business facts remain recorded or source-correlated, not independently verified.
  `fully_verified` and automatic outreach eligibility remain false.
- AI excerpts carry their sources. AI product-fit and outreach recommendations
  are suppressed even when their citations are valid. Suggested unknowns remain
  questions for review. Overlong quotations are rejected rather than silently cut.

## Change boundaries

The live 06B deployment patches only `Validate AI Evidence`, using the existing
live workflow as the base. Nodes, connections and sticky notes are preserved.
`refresh-evidence-validator.cjs` updates the local embedded validator from its
source without regenerating the workflow graph. The full build also embeds the
same source validator.

External Abstract verification and automatic AI usage remain disabled. No new
Apify field mappings or provider calls are introduced. Existing parameterized SQL
nodes are untouched; this change does not claim to resolve all convention gaps
identified in the repository handoff.

## Verification on 2026-10-05

- JavaScript runtime, AI validator and native graph tests pass.
- The SQL regression runs in `lead_gathering_test_20260926` and rolls back its
  synthetic records. It covers tenant boundaries, missing/stale evidence, changed
  website inputs, false verification flags, future dates, uncertain relevance,
  expiry, conflicts, and withholding outreach context.
- The migration was applied twice in the isolated database to check reapplication.
- Real isolated n8n executions of 06A and 06B preserved two synthetic leads,
  reported missing evidence honestly and made no external provider calls.
- Migration 013 was then applied to `lead_db`. A predeployment database dump is
  retained privately under `.local/enrichment-trust/`.

- The existing live 06B validation node was patched and n8n reloaded. A comparison
  confirmed all imported nodes/connections match the prepared live-workflow copy.
  Locally, comparison with the handoff snapshot confirmed only the validator code
  changed; graph, other nodes and sticky notes were identical.
- Live read-only API checks passed for leads 159, 162 and 165, invalid identifiers,
  another organization and missing authentication. An early startup connection
  failure/404 resolved after n8n registered the webhooks.
- Leads 159 and 165 reported `evidence_available_contacts_unverified`; lead 162
  reported `needs_review` with `conflict_needs_review`. All five recorded email
  candidates across the three leads reported `deliverability_unknown`.
- Previous enrichment processing was restored to enabled. Automatic AI and
  Abstract verification remain disabled. No live AI/provider call or outreach was
  initiated by these tests; no mailbox deliverability claim follows from them.

## Recovery

The container keeps the original 06B workflow and prior enrichment switch in
`/home/node/.n8n/enrichment-stage/trust-backup/`. The deployment script refuses to
overwrite that state on a repeated prepare. If import fails, claims remain paused
for inspection. Restore the saved workflow through n8n import if needed, reload
n8n, and restore the saved switch after checking the active workflow.

This report does not establish deliverability for any real email, independent
business identity, or outreach conversion performance. Abstract remains paused.
