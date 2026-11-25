# Evidence enrichment implementation

## Workflows and dependencies

06A now claims scoped jobs, reads at most three website pages using the contact
worker public-address/redirect restrictions, stores observed facts and coverage,
and preserves unknown values. No model guesses website technology or timezone.

06B creates a deterministic evidence summary, campaign fit checks, opportunity
hypotheses, LinkedIn identity checks and dated personalization evidence. The old
unconstrained Groq agent has been removed from these two workflows. Generative
AI research is not implemented in this version; descriptions and service headings
remain source observations. This is not a claim that all planned enrichment
features have been delivered.

Install migrations 009 and 010 after 008. Runtime files runtime.cjs, worker.cjs
and linkedin.cjs belong in /home/node/.n8n/enrichment-stage. The adjacent
contact-stage helpers are required. build.cjs generates the actual 06A/06B JSONs.
Database backups and prior workflow snapshots are preserved before import.

## LinkedIn collection

The Apify path uses harvestapi/linkedin-company (known URL or company-name
search), harvestapi/linkedin-company-employees (up to two role-filtered profiles)
and harvestapi/linkedin-profile-posts (up to five recent posts per profile).
Employee lookup follows corroborated company identity. Only supported current
employment and matching author profiles qualify for personalization. Company
and person authors remain distinct. Provider schemas and payloads were checked
against the actors' published documentation on 2026-10-03.

Platform LinkedIn sub-limit: $0.50/month within the account's existing $5 ceiling.
Each start reserves $0.05; the actor receives maxTotalChargeUsd=0.05. Account
charges and outstanding reservations are shared with gathering and Facebook.
Platform-funded customers require wallet credit; BYOK remains organization-bound.
Global and organization switches apply. No new credits are fabricated.
The existing apify_diagnostic_runs ledger stores LinkedIn run costs so all
existing account-budget functions include them. References use linkedin-job-ID.

Run IDs survive polling failures. An ambiguous start holds its reservation and
requires operator reconciliation; it is never automatically resubmitted.
Collection is not an official LinkedIn integration. Public availability and
actor schemas can vary. Live extraction accuracy and cost are not established
by fixture tests. No personal login cookies are requested.

## Service endpoints

All require the existing X-Lead-Gathering-Key internal service credential.
These are backend/operator APIs, not safe to expose directly to untrusted Flutter
clients with a shared key. A future user-authentication layer must bind org_id.

- GET /webhook/enrichment-report?org_id=1&lead_id=159
- POST /webhook/enrichment-linkedin: org_id, lead_id, profiles[]
- POST /webhook/enrichment-campaign: org_id, lead_id, config

Campaign config: offer (required), target_terms[], locations[], exclude_terms[].
Current config is one active campaign context per lead; multi-campaign history
is future work. Profile objects accept profile_url, name, website, description,
role, company_name, company_profile, observed_at and posts[]. Post objects accept
url, author_profile, published_at and text. Intake labels data submitted_evidence,
not provider-verified. The same identity/recency rules apply before use.

New profiles require observation within 30 days; recent posts within 90 days.
Personalization is draft-only with source/author/date and requires review.
No LinkedIn message, connection request or email is sent by enrichment.

## Storage and handoff

Canonical cleaned lead facts are preserved. enrichment_profiles stores evidence,
observations, research and coverage. Parameterized SQL and source fingerprints
protect writes. Queues have leases, capped attempts and periodic freshness checks.
A compatibility projection fills basic legacy enrichment fields without lowering
an existing stage or promoting channel readiness. Organization conflicts fail.

06C and 08 local JSONs now select fresh LinkedIn evidence and instruct their model
to preserve attribution and ignore instructions in source text. These workflows
are not activated by this deployment and require their own end-to-end review
before sending. The full outreach scoring redesign remains future work.

## Validation and remaining limits

Offline tests cover identity, author attribution, stale posts, URL validation,
missing evidence, campaign rules and page limits. SQL rollback tests cover leases,
replay, organization scope, changed sources, disabled controls, budgets and
settlement. Actual isolated n8n execution tests preserve both inputs through 06A
and 06B. Mocked Apify recovery confirms one start across a polling failure.

Not yet implemented: browser-rendered website audits, confidence calibration,
manual field locks, multi-campaign history, automatic repeat LinkedIn collection
for unchanged jobs, configurable decision-maker roles, and generative AI research.
Completed LinkedIn jobs reuse stored evidence; stale profiles are excluded until
refreshed evidence is supplied or a fresh collection job is deliberately scheduled.
Abstract remains paused, and this stage does not establish email deliverability.

## Localhost validation — 2026-10-03

Final migrations were reapplied after Docker recovered. Both revised workflows
were imported and n8n was restarted while idle. A three-lead free canary completed:
lead 159 complete, 168 and 463 partial with missing/unavailable evidence preserved.

Live Apify canary used a LinkedIn URL published on lead 159's website. One company
matched by company name and website, and one current co-founder/director matched
by employment at that company. Five recent company posts were saved with exact
author identity and dates; research produced three draft-only personalization
items. A company post is not attributed to the co-founder.

Actual provider costs: company $0.00405; employee lookup $0.02800; five posts
$0.01005; total $0.04210. Reprocessing the saved results added no scrape charges.
Real output led to tested fixes for bare website domains, legal company suffixes,
multiple current roles and company /posts author URLs. Personal-profile post
collection is implemented and fixture-tested; this live canary tested company posts.

The approved global LinkedIn cap is $0.50 inside the existing $5 platform account
ceiling. Organization 1 is intended to use the platform account with existing
wallet checks; its wallet balance is zero, so automatic paid collection is blocked
until funded. Operator canaries use the same shared cost ledger, without creating
customer credits. Abstract and sending remain disabled. 06C and 08 evidence-handoff
changes remain local files pending their later stage review/import.

Final checks: localhost report returned lead 159 with two LinkedIn profiles.
Authentication, malformed IDs, cross-organization requests, invalid LinkedIn
profile input and missing campaign offer tests passed. Both new workflows are
active; enrichment processing is enabled with normal scope. Organization 1's
LinkedIn platform policy is configured under the approved sub-limit, with wallet
checks still enforced. Website queue now excludes CSS/JS/image/font/PDF assets.
