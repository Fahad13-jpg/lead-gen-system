# Contact discovery strategy and implementation plan

Proposed 2026-09-28. This document is a development plan, not a claim that all
features below are implemented. Flutter, Retell and outreach remain outside scope.

## Objective

Find at least one relevant, evidence-backed business contact route per eligible
lead at controlled cost. Distinguish discovering an email, establishing business
relevance, verifying deliverability, and authorizing outreach. Success is not
merely producing a string containing @. Never guarantee an email for every lead.

Maintain an email candidate even when verification is paused, but do not label it
verified or outreach-ready. Leads with only phone, WhatsApp, social or contact-form
routes can progress to enrichment with those limitations explicitly recorded.

## Current baseline and gaps

Implemented: scoped leased queues, saved-record extraction, bounded HTTP crawl,
organization-specific exact-website cache, candidate evidence, alternative routes,
verification controls, and a $5 monthly platform Apify ceiling.

The current resolver stops at any syntactically valid saved email. Replace that
rule with candidate qualification: a vendor, unrelated branch, no-reply address,
or irrelevant department must not prevent a search for a better business contact.
Existing scoring is heuristic; expose its reasons, not a fabricated probability.
Normalize source adapters, including Yellow Pages socialLinks objects and Maps
social arrays, so known profiles are not discarded.

The Facebook experiment returned three emails, two previously missing, for
$0.04. This selected sample supports testing a Facebook fallback, not a general
yield guarantee. The Roto-Rooter social inbox illustrates why relevance matters.
Automatic Facebook discovery is not currently integrated.

## Routing policy

1. Validate eligible organization/lead ownership, current input snapshot and
   supported URLs. Check suppression policy before spending on a suppressed lead.
   Preserve user edits and raw source records.
2. Recover explicit saved business contacts and known official profile links.
   Never mine reviewer emails or unrelated text. Reuse fresh evidence within the
   organization and correct business/branch scope.
3. Qualify candidates. Stop further discovery when a sufficiently relevant
   candidate exists; send it to the verification queue only when enabled. While
   verification is paused, retain it as a candidate and avoid unnecessary paid work.
4. If a website exists, perform the cheap HTTP pass. Prioritize actual contact,
   branch and team links; consult a bounded sitemap when direct navigation fails.
   Decode published structured/encoded contact data. Retain source snippets.
5. When unresolved and a trustworthy Facebook business URL is already known,
   offer a budgeted Facebook contact lookup. Skip generic links and ambiguous
   matches. Match returned website, phone, address and page identity to the lead.
   Domain match alone does not establish the correct branch of a large chain.
6. Use local browser rendering only when HTTP evidence suggests missing
   JavaScript content; do not render every lead or bypass access blocks. A bounded
   text-readable PDF pass may inspect explicitly linked contact brochures.
   Use a sandboxed browser/container with private-network egress blocked, including
   redirects, subresources and browser requests. Never submit contact forms.
7. If no website exists, skip website work and use known official social profiles.
   If neither is known, retain available routes and mark research needed. Profile
   search is a separate future capability, not automatic guessing by business name.
8. Stop on a relevant candidate, exhausted allowed sources, explicit block,
   attempt/time cap or insufficient budget. Preserve partial results and reasons.

Facebook and rendering are conditional branches. Once comparative measurements
exist, reorder those branches by additional relevant contacts per unit cost and
latency for the source/business category. The initial order is a hypothesis.

## Candidate and identity rules

Store email, normalized address, provenance, source URL/field, observed time,
business/branch match evidence, role classification, relevance reasons and
verification status separately. Keep alternatives without overwriting primary
contacts. Deduplicate normalized candidates per organization and canonical lead.

Business-domain general inboxes and explicitly published local-business contacts
are candidates. Gmail/Yahoo addresses can be legitimate for SMEs when linked to
the correct business. Named contacts are retained only when their business role
is supported. No-reply, website-agency, unrelated-company and known-invalid
addresses are excluded from automatic selection. Corporate/shared and social,
support or recruitment inboxes require relevance review rather than automatic
promotion. Deliverability alone cannot establish sales relevance.

Do not generate info@/contact@ guesses or ask an LLM to invent addresses. No
catch-all result is sufficient to establish that a guessed mailbox exists.

## Scheduling, cache and failure handling

Use separate short-lived tasks for source recovery, HTTP, Facebook, rendering and
verification. The coordinator chooses the next eligible task from saved evidence.
Do not keep a long synchronous n8n execution waiting for a paid actor.

Reserve a paid attempt before dispatch; store its run ID immediately and resume
polling that run after interruptions. An uncertain start is reconciliation work,
not permission to submit another paid run. Bind outputs to their input profile,
never their order in an actor dataset. Atomic, replay-safe saves require a live
lease and matching input fingerprint. Reject stale results after website/profile
or ownership changes. Retry only transient failures, with bounded backoff.

Reuse website and social evidence with TTLs and explicit observed times. Share no
tenant data across organizations. A shared corporate page can reuse fetch data,
but requires branch qualification before candidate attribution. Add an in-flight
lock per organization and source URL to avoid concurrent duplicate paid fetches.
Cache genuine no-contact results briefly; do not cache outages as absence.
Source changes or explicit refresh can invalidate completed discovery tasks.

## Initial limits and paid controls

Proposed initial operational defaults, adjustable after measurement:

- HTTP: five pages and 55 seconds per attempt (existing limit).
- Facebook: one validated page per unresolved business; small bounded batches;
  no profile-search charges and no repeated paid lookup while its cache is fresh.
- Rendering: one candidate page, 20-second browser deadline, one concurrent worker;
  browser support must pass network-isolation tests before activation.
- PDF: at most one explicitly linked document per lead, bounded download size and
  extraction time; no OCR in the first implementation.
- Transient retry: at most three attempts; no retry for missing email alone.
- Result cache: initially seven days for positive evidence, one day for absence;
  verification freshness remains a separate policy.

The existing $5 platform monthly ceiling is shared by gathering and contact
discovery, not duplicated. Reserve remaining budget atomically across both.
Store actual provider charges and leave uncertain costs reserved. Add a discovery
sub-cap and organization fairness so one job cannot exhaust the shared allowance.
Paid discovery remains opt-in and defaults off; the authorized Facebook experiment
does not enable recurring spending. Use only verified platform/BYOK account
bindings. A BYOK account is never silently replaced with the platform account.
Honor platform customer-wallet rules; insufficient funds becomes budget-blocked.
Do not debit customer wallets for development diagnostics.

Abstract retains its 100-request monthly ceiling and remains paused until the
user explicitly enables it. Prioritize verification of the best relevant
candidate, not every weak address. Hunter/Snov and additional paid social actors
are deferred until measured gaps justify a separate account and budget.

## Outputs for downstream enrichment

Return distinct discovery, relevance, verification and budget states, with a
recommended next action. Examples: relevant_candidate_found, alternative_route_only,
no_public_contact_found, identity_review_required, source_blocked, retry_pending,
and budget_blocked. Include checked sources, stopping reason, actual cost and
timestamps. A candidate may be verification_pending; none of these states by
itself authorizes outreach. Expose paginated contact evidence through scoped
backend APIs later consumed by Flutter, without exposing provider credentials.

## Evaluation and completion criteria

Freeze a representative 20–30-lead benchmark before further rollout: businesses
with known public emails, no-website businesses with official social pages,
JavaScript sites, corporate/shared pages, wrong-profile links, and businesses with
no published email. Preserve baseline candidates to measure incremental yield.
Use offline fixtures and mock provider failures for repeat testing; paid live
samples need bounded caps and known input URLs, not an automatic benchmark spend.

Measure additional correctly attributed candidates, known-email extraction
coverage, wrong-business/vendor matches, duplicate contacts, alternative-route
coverage, requests avoided, time per lead and cost per additional relevant
candidate. Verified-contact cost cannot be measured while verification is paused.

Before moving to enrichment, demonstrate:

- End-to-end n8n runs save correct identities and evidence across all branches.
- Wrong-business and reviewer/vendor fixtures are excluded or placed in review.
- Retries/replays and concurrent runs do not duplicate paid starts or records.
- Restart recovery resumes the same provider run; source changes reject old output.
- Organization boundaries, wallet/quota controls and global cost reservations hold.
- Source failures do not masquerade as no-contact results.
- Existing nonempty/user-edited contacts and raw source data remain intact.
- Abstract and outreach remain disabled; bounded live results and limitations are
  reported without implying a guaranteed email hit rate.

## Implementation sequence

1. Candidate qualification, source adapters, identity checks and source snapshots.
2. Budgeted asynchronous Facebook fallback with cache, accounting and recovery.
3. Conditional rendering/PDF support and explicit partial/failure states.
4. Scoped evidence/status outputs, benchmark comparison and controlled rollout.

Validate each slice before the next. Keep paid production branches disabled until
their billing and identity controls pass; do not activate outreach in this stage.
