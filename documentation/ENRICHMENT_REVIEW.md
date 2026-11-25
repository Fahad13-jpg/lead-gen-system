# Enrichment review and next implementation order

Reviewed 06A, 06B and 06C workflow JSON, including node parameters and connections.
All three are inactive on localhost. No enrichment provider calls were made.

## Findings

1. 06A asks AI to infer website descriptions, contact forms and technologies from
   names/domains. Guesses become stored facts; null contact-form results become false.
   Replace this with observed website/source evidence; retain unknown as null.
2. 06A assigns every +1 phone the United States and New York timezone. Preserve
   cleaned geography and only set timezone when location evidence supports it.
   Do not treat a free email domain as the company's website.
3. 06A's transformation drops category/city/state before its prompt uses them.
   Several code nodes use first-item output in default batch mode: verify each
   input produces exactly one result and retains organization/lead identity.
4. 06B prompt contains two incompatible result formats; its parser supports the
   older format. Define one schema with explicit unknowns and evidence per fact.
   An empty result must not become successful research through placeholder strings.
5. Database writes interpolate model/source strings into SQL. Some enum and URL
   fields lack escaping. Use parameters throughout, scoped by organization and lead.
   Carry org_id through 06B/06C; validate ownership at every read and write.
6. Selection has no task leases, bounded retries, freshness or provider spend
   reservations. Reuse the queue patterns established in contact discovery.
7. 06C rewards AI-generated response percentages, generic pain-point counts and
   email presence. Separate campaign fit, evidence confidence and channel readiness.
   Verified deliverability is distinct from permission and suppression checks.
8. 06C lacks seller offer/campaign context. A dental website offer needs explicit
   target industry/location, portfolio evidence and seller value proposition.
   Generate drafts only from supported facts; do not invent personal observations.
9. Website/search content must be treated as untrusted data. Restrict tool actions,
   validate output schemas and URLs, and attach sources/timestamps to all claims.
10. Search nodes reference a query variable whose binding needs execution testing;
    06A's search node has no explicit POST method. Correct the provider contract
    during implementation and test with mocks before any paid calls.

## Implementation sequence

- 06A: deterministic business facts and website observations, category/phone
  conflict review, provenance, task queue, safe SQL, cache and freshness.
- 06B: optional evidence-bound AI summary, services and observed business signals.
  Company size/decision maker remain unknown without sources; hypotheses are
  labelled separately. Paid search stays off until configured with a budget.
- 06C: campaign-specific fit scoring and evidence-supported outreach drafts.
  Missing campaign context produces a configuration-needed state. Sending remains
  a separate stage with verification and channel eligibility gates.

Acceptance: mixed organizations, batch item preservation, hostile source text,
malformed model responses, unknown facts, conflicting facts, retries/timeouts,
duplicate executions, exhausted budget and suppressed/unverified channels.
No stage number alone proves a lead is ready for outreach.
