# Contact discovery and verification

Workflows `03b_email_scraper.json` and `05_email_validation(Batch).json` now use
independent, leased task queues. Their generator is `scripts/lead-contacts/build.cjs`;
migration 005 supplies storage, quotas, caching and atomic result handling.

## Workflow responsibilities

03b claims up to three discovery tasks each minute, calls the bounded website
worker for each task, and saves candidates and page evidence. It does not call
Apify, social actors, AI or generated-address verification. Paid escalation is
explicitly disabled until it has platform/BYOK billing integration.

05 claims at most one uncached verification request per scheduled minute. All
candidates use this path. The provider is Abstract's email validation endpoint;
the server's `ABSTRACT_EMAIL_API_KEY` never appears in workflow item data or logs.
User-approved monthly ceiling: **100 reserved requests per calendar month**.
Reservations count retries and uncertain outcomes conservatively and are never
refunded simply because an HTTP call failed. This ledger starts at deployment;
out-of-band use and previous untracked provider calls are not synchronized.

Tasks are organization-scoped and require an eligible cleaning link. Historical
ownership-review and orphan records are excluded. A task has a unique source
snapshot, a five-minute lease and up to three attempts. Expired leases recover;
temporary failures back off. Administrative `contact_retry(org_id, task_id)`
requeues work without erasing request history or bypassing quota.
The queue permits at most three active discovery leases and one active
verification lease across organizations. Organizations least recently served are
preferred within each selection round.

## Website worker

The small Node helper is installed under the persistent n8n volume at
`/home/node/.n8n/contact-stage/{worker,runtime}.cjs`. Execute Command nodes pass
only a validated numeric task ID and random lease; the helper loads the source
from PostgreSQL. URL/email strings are never interpolated into shell commands.
Updating the source files requires copying them to this installation as well as
rebuilding/importing workflow JSON. No extra npm packages are installed.

The helper permits HTTP/HTTPS with standard ports, resolves public IPv4 addresses
and pins the selected address to the connection. It checks redirects again and
allows only the same hostname, including its www variant. Literal IPs, internal
addresses, URL credentials and unsupported schemes are rejected. IPv6-only sites
and cross-domain redirects currently require review rather than a relaxed fetch.

Each discovery attempt has a 55-second wall-time budget, at most five pages,
bounded redirects and 512 KiB per response. It follows relevant same-site links
and a few root contact-page fallbacks. It handles HTML entities and mailto-style
addresses, retains up to 20 candidates, and records source pages and snippets.
Domain relevance, contact-page context and common business inboxes affect rank;
website-vendor context lowers rank. Low-scoring candidates stay in review and
are not automatically sent to the paid validator. Confidence is a heuristic,
not proof that the recipient owns or represents the business.

## Verification contract

Outcomes are `verified`, `invalid`, `risky`, or `unknown`; provider failures are
retryable task outcomes, never evidence that a mailbox is invalid. Both boolean
and nested-value provider response fields are handled. Verified requires positive
format/MX/SMTP evidence, deliverability, and explicit non-disposable/non-catch-all
results. Catch-all/disposable results remain risky. Missing evidence stays unknown.

Authentication, quota, client-contract and response-schema errors pause provider
work. Fix the underlying issue before clearing `contact_controls.provider_pause`.
Unknown/risky results expire after one day; verified/invalid results after seven
days. Fresh verification cache entries are reused within the organization without
another request. Expired contacts queue again, and expired primary contacts lose
their valid flag. Separate candidate records preserve alternative contacts.

Promotion updates the canonical cleaned lead only. It fills an empty primary
address or replaces an explicitly invalid address with a verified candidate;
customer-edited or otherwise nonempty primary addresses are preserved. A delayed
response for an old email cannot verify the current email. Raw staging email
values stay intact, with discovery provenance held in `lead_contacts` and
`contact_attempts`.

The inactive email outreach workflow now requires a matching, fresh verified
contact and eligible cleaning link. It was not activated. Suppression checks
remain in that workflow; outreach deserves its own review before activation.

## Operation and status

`GET /webhook/contact-status?org_id=1` requires the internal
`X-Lead-Gathering-Key` credential. It returns task/contact counts, organization
request usage and pause state. This shared server key must not ship in Flutter.
Future dashboard authentication must derive organization access from the user.

`contact_controls` has separate discovery and verification enable switches, the
monthly cap, provider pause reason and an optional staging-ID canary allowlist.
`scripts/lead-contacts/verify-live.cjs` performs endpoint checks and a controlled
rollout capped at three verification reservations before restoring the 100 limit.

Tests: 33 offline runtime checks, rollback-only PostgreSQL integration checks,
and actual isolated n8n executions with mocked two-business discovery and
verified/risky responses. The test helper refuses fixtures against production.
Backups are stored under ignored `.local/contacts-before`.

Not implemented in this revision: paid social/deep crawling, generated email
addresses, provider BYOK for Abstract, automated
review decisions, and frontend contact-selection controls.

## Deployment status — 2026-09-28

Migration 005 and the rebuilt 03b/05 workflows are installed in production. The
outreach verification guard is imported with outreach still inactive. The contact
status endpoint passed authenticated, missing-authentication and invalid-input
checks. Runtime, rollback-only database and isolated n8n mock tests passed.

The production canary selects staging IDs 137, 149 and 154. Its initial combined
test was not executed after automatic approval review required explicit
authorization to transfer email addresses to Abstract. The user then chose to
keep external verification paused. Website-only rollout uses `discovery-only`
and `automatic-discovery` modes; both enforce `verification_enabled=false`.
The configured monthly ceiling remains 100 for any later authorized verification.
No live verification result is claimed.

The website-only production canary completed for staging IDs 137 and 154. Both
sites returned readable public pages; within the five-page budget neither yielded
an email candidate. Both tasks recorded `not_found` with their page/status
evidence. No paid escalation occurred, no Abstract requests were recorded and
outreach remained at 11 records. After verifying that only canary records ran,
automatic website discovery was enabled for the remaining eligible queue.
External verification remains disabled at the user's explicit request. Workflow
05 is imported and scheduled, but its database switch prevents provider calls.

## Discovery coverage improvements — 2026-09-28

The worker now prioritizes published contact links ahead of about links, follows
relevant links discovered on subsequent pages, and deduplicates trailing slashes,
fragments, common tracking parameters and known redirect destinations. The budget
remains five attempted pages and 55 seconds; failures still consume an attempt.
An unseen redirect alias can still require a request before its destination is known.

Extraction now decodes percent-encoded mailto recipients and JSON-LD email fields
(including escaped Unicode). It does not infer addresses or execute website scripts.
Published phone, WhatsApp, social and contact-form page links are saved as
`contact_routes` in the attempt result, with source URLs. These are evidence for
later review, not validated contacts or permission to send messages. Forms are
never submitted. These alternative routes are not yet exposed by the summary
status API or promoted into canonical lead fields.

Attempt results include `stop_reason`, `pages_attempted` and `remaining_pages`.
Reasons distinguish exhausted relevant links from a page/time budget limit.
`not_found` continues to mean no email in the inspected pages, not proof that the
business has no email. JavaScript rendering and paid escalation remain unimplemented.

The repeat website-only diagnostic found phone and WhatsApp links for Zia Dental
Consultants using four requests, and phone/contact-form links for All Pro Plumbing
using five requests. Neither returned an email candidate. The diagnostic command
is `node scripts/lead-contacts/diagnose-sites.cjs`; it reads public websites and
writes an ignored local report, without database or provider calls.

The existing 03b Execute Command node loads these helpers on each task; its node
configuration did not need changing for this update. `install-worker.cjs` installs
staged helper files under a short queue-claim lock, requires zero processing tasks
and paused verification, and preserves the previous helpers in the n8n volume.
No workflow import or n8n restart is needed for this helper-only update.

After installation, production discovery tasks 9 and 18 were explicitly retried
through the scheduled 03b workflow. Both completed and saved the new routes,
page counts and stopping reasons in PostgreSQL at 09:38 UTC. The verification
switch remained false, its reservation count remained zero, and outreach stayed
inactive. The 100-request verification ceiling was unchanged.

## Source-first strategy — migration 006

The user selected free sources only. Workflow 03b is now named **3B - Contact
Discovery (Source First)**. The discovery order is:

1. Read explicit business email fields from the eligible lead's saved source
   record, including multiple emails, plus its existing canonical contact.
   Ignore reviewer addresses, descriptions and arbitrary nested text. Exclude
   currently invalid addresses. Keep provenance as `source_record`.
2. If no saved email is available, reuse a fresh result for the exact website URL
   within the same organization. Results are never shared across organizations.
3. Otherwise run the bounded public website crawler. Keep its provenance as
   `published_website`; store successful/negative results for seven/one days.
   Transient failures and blocked results are not cached. No provider is called.
4. Preserve published alternative contact routes, including those already saved
   by gathering. A lead without a website can finish with saved emails or a
   clearly reported `no_website_or_saved_email` result and its available phone.

Migration 006 enables discovery tasks for every eligible lead, including those
without a website. Existing nonempty canonical emails are preserved; recovered
addresses remain candidates until separately verified. A source-first success
means an address was recovered, not that it is deliverable. The source field and
staging ID are retained in candidate evidence. Raw staging data is unchanged.

The exact-URL cache stores website results only, never another lead's source
record contacts. Expiration is checked on access; tasks already completed do not
automatically rerun at cache expiration. Use an authorized scoped retry after a
source update or for a fresh discovery attempt. Concurrent first-time requests
for the same URL can still crawl independently. Cache evidence keeps its original
page count; `cache_hit` and `network_pages_this_attempt` identify zero-network reuse.

The authenticated status response includes the strategy and counts of successful
saved-record searches, cache hits and tasks with alternative routes, using the
latest completed attempt per task. Individual routes remain in attempt evidence.

New checks: `tests/lead-contacts/source-first.sql` verifies no-website queueing,
method provenance, pause controls, tenant cache separation, status metrics and
stale website results. `scripts/lead-contacts/test-source-first-n8n.cjs` runs the
real helper through isolated n8n with three fixtures: multiple saved emails,
phone-only/no-website, and a cache hit. It makes no website or provider calls.
Both passed along with the existing database suite and 33 runtime checks.

Deployment uses a full database backup and `deploy-source-first.cjs` to pause
discovery, import only 03b, run a representative canary, and restore the prior
discovery scope. Verification remains disabled with its 100-request ceiling;
Apify and outreach are unaffected. No paid provider integration was added.

Production rollout: the three representative canary leads were staging IDs 21,
88 and 154. ID 21 reused one saved email with zero website pages; ID 88 had no
website/email and preserved two contact routes with zero website pages. ID 154
encountered a transient website failure and entered the existing bounded retry
policy; this is not counted as a successful live email discovery. Automatic free
discovery was restored for all eligible leads. At restoration, verification had
zero reservations, its switch was false and its limit was 100; outreach was
inactive with its original 11 records. The local 03b JSON and imported n8n workflow
both use the new source-first name. No increase in email yield is claimed from
this small canary; the measured benefit is broader eligibility and avoided
network calls when saved contacts are available.
