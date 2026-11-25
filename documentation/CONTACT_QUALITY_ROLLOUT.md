# Contact qualification and Facebook integration

Implemented 2026-09-28 in migration 008, workflow 03b and new workflow
`03c_facebook_contact_discovery.json`. This implements the core contact quality,
Facebook and evidence handoff portion of CONTACT_DISCOVERY_STRATEGY.md.

## Behavior

- Saved emails are qualified before they stop discovery. No-reply/placeholders
  and vendor-context addresses are excluded; unrelated domains and department
  inboxes go to review. Published Gmail/Yahoo contacts can qualify for SMEs.
- Website/public-source candidates have separate relevance and verification
  states. Relevant candidates remain pending while Abstract is disabled.
- Maps social arrays and Yellow Pages social-link objects are both understood.
  Generic Facebook links, sharing/login links and unrelated page types are rejected.
- Unresolved leads with a known Facebook page queue for 03c. The worker first
  checks the organization-scoped cache. It matches returned input URL, business
  name and exact website/branch URL or phone before qualifying an address.
- Returned business name, address, phone and websites are retained as observations
  from a matched page. They do not overwrite canonical/user-edited fields.
- An input fingerprint binds discovery/social output to the current business
  record and rejects stale results. Source changes requeue current discovery.
- An eligible, freshly verified contact stops further paid verification for the
  lead. Otherwise the highest-scoring eligible pending candidate is considered
  first. The configured Abstract limit is still 100/month and its switch is OFF.

## Paid Facebook controls

`contact_social_controls.enabled` defaults false, with a $0.50 discovery sub-cap.
Each organization also needs an enabled `contact_social_policy`, a verified
account binding and its own sub-cap. These are internal backend controls; no
Flutter UI is implemented. No new Apify account or credits are provided.

A paid single-page run reserves $0.05 and passes that cap to Apify. Actual costs
count against the same provider account budget as gathering and diagnostic runs.
Platform mode additionally requires funded customer wallet credit. Reservation
debits and refunds use unique references; uncertain costs remain reserved.
BYOK does not fall back to a platform key or debit platform customer credit.

03c starts actors asynchronously, stores run IDs, then polls the same runs in
subsequent executions. An ambiguous start enters `needs_review` without automatic
resubmission. Failed polling is retryable. A session lock and per-profile in-flight
constraint avoid duplicate starts. Review an unresolved reservation against Apify
before manually changing it; no self-service reconciliation UI exists yet.

The worker respects discovery pause/canary scopes and spreads work across
organizations. Cached results can run while paid lookup switches remain OFF.

## Backend handoff

Authenticated GET `/webhook/contact-lead?org_id=1&lead_id=...` returns cleaned
business facts, candidates, evidence, relevance, verification/freshness, the latest
discovery/social result and contact readiness. Unknown/cross-organization leads
return 404; invalid IDs return 400. The shared internal authentication key is not
appropriate for shipping in Flutter; end-user authorization remains future work.

The response explicitly keeps `enrichment_complete=false`: contact discovery is
not full strategic enrichment. No company descriptions, technologies or decision
makers are invented. All returned business details come from saved source facts
or matched page observations. Outreach stays disabled.

## Validation

- 37 offline runtime checks, including email relevance, malformed/profile URLs,
  source fields, branch matching, paid-verification response handling and SSRF targets.
- Rollback-only database suites for ownership, lease replay, budgets, freshness,
  source changes, social opt-in, customer wallets and actual-cost settlement.
- Real isolated n8n executions of 03b and 03c with real helper code and cached
  fixtures; no provider calls or unverified primary promotion.
- A mocked-provider recovery test confirms one actor start across poll failure,
  settlement after completion, and no restart after an ambiguous POST.
- Re-evaluation of the prior live Facebook evidence qualifies ALL ED ELECTRIC and
  Halsted; Roto-Rooter's social/different-domain address stays in review.

## Remaining scope

Browser rendering, PDF extraction, sitemap expansion, automatic social-profile
search and a representative 20–30-site live benchmark are not implemented in this
rollout. They must not be described as finished. Full enrichment workflows 06A–06C
have not been rebuilt here. Abstract is configured but cannot deliver verified
results until the user obtains access and explicitly enables it. Consequently,
this rollout does not claim fully verified and fully enriched leads.

## Localhost deployment check — 2026-09-28

Imported and activated 03b and 03c, restarted idle n8n, and tested staging
118, 121 and 122. All three Facebook jobs completed using existing cached
provider results at zero additional cost. ALL ED ELECTRIC and Halsted contacts
are eligible with verification pending; Roto-Rooter's social inbox stays in
review. The authenticated contact-lead endpoint passed valid requests, missing
authentication, malformed input and cross-organization 404 checks. Abstract
remained disabled with zero verification attempts; email outreach remained off.
The prior automatic discovery scope was restored after the canary.

Follow-up findings: Roto-Rooter's website returned response_too_large and remains
in the bounded retry path. ALL ED ELECTRIC retains the source category Plumbers;
category relevance and conflicting source phone numbers need enrichment review.
These results do not establish complete lead verification or enrichment.

## Large-page and review-flag follow-up

Installed bounded 2 MiB website reads with explicit truncation evidence; the
verification HTTP path retains strict response limits. Contact links are followed
from retained HTML. Long unbroken tokens are discarded before email matching to
avoid excessive regex scanning. Partial pages never imply exhaustive discovery.
Added conservative industry-term mismatch and normalized phone-conflict flags;
canonical source facts are not overwritten. Existing current evidence is refreshed
with these review signals; new worker results include them automatically.

Validation: original 37 runtime checks plus the new quality suite covering HTTP
caps, retained emails, contact fallbacks, long tokens, phone equivalence/conflicts
and ambiguous category names. Installed helpers with idle-task/social-lock guards
and persistent backups.

Read-only benchmark of 20 distinct website URLs from eligible existing leads:
5 with eligible candidates (3 saved-record successes, 2 website successes),
7 with no email inside the crawl budget, 6 blocked and 2 retryable failures.
49 pages attempted; 3 quality flags. Roto-Rooter completed 5 page attempts without
the prior oversized-response error, but no email was found. No pages in this sample
exceeded the new cap; truncation behavior was validated with synthetic HTTP tests.
This deterministic sample is diagnostic, not a representative conversion estimate;
found candidates are not necessarily new to the database and are not verified.
No paid providers or outreach were invoked. Private detailed report:
.local/contact-deploy/contact-quality-benchmark.json.
