# Contact discovery refresh — deployed to local Docker

Deployed 2026-11-08 at 13:28 UTC. Migration 052 and the contact runtime were
installed under the existing contact-controls lock with no active leases.
The old SQL function, old helper and fresh database backup are saved privately in
`.local/contact-refresh-1794144505586/`. Installed SQL and runtime hashes were
verified; workflow definitions, activation, financial ledger and outreach counts
were unchanged during installation. No provider requests were made by deployment.
An offline extraction check also passed inside the actual n8n container.

The existing minute schedule subsequently claimed leads 167 and 449 for free
website discovery. Global paid social discovery and external verification remain
disabled. No new schedules, workflow imports or outbound messages were needed.

Live scheduled results at 13:29 UTC:

- Lead 167, Fiaz Dental Care: five pages attempted, three HTTP 200 pages
  (192579, 112904 and 138121 bytes), two HTTP 404 pages; no fetch errors or
  truncation; result `not_found`, zero relevant candidates, page budget reached.
- Lead 449, Zia Dental Consultants: four pages attempted, three HTTP 200 pages
  (55300, 17774 and 20005 bytes), one HTTP 404 page; no fetch errors or
  truncation; result `not_found`, zero relevant candidates, relevant pages exhausted.
- Six discovery attempts had finished since rollout when checked at 13:30 UTC.
  External verification and paid social discovery were still disabled.

These tests verify successful fetching and truthful negative-result handling;
they do not demonstrate an increased real-world email yield.

The read-only inventory found benchmark discovery tasks completed `not_found` in
September despite their discovery caches having expired. Cache expiry alone did
not make those tasks claimable again.

Migration `052_contact_negative_refresh.sql` retains the existing contact_sync
behavior and adds a bounded refresh of negative website searches: at most 20 per
sync, completed at least seven days ago, no attempt in the last seven days, no
fresh matching cache, no canonical email or existing usable candidate, current
website match, and existing ownership eligibility. Record-only, blocked, failed
and processing tasks are excluded. The existing claim path still owns leases,
concurrency, suppression and retry limits. Attempt history is retained. This
does not invoke providers or change billing, budgets or verification controls.

The runtime now decodes explicitly published Cloudflare protected emails and
bracketed `[at]`/`[dot]` variants. It does not invent addresses, render JavaScript
or bypass identity/relevance filters. The decoder has bounded matching and is
tested against large non-email text. Recovered candidates remain unverified.

Validation:

- `node tests/lead-contacts/runtime.test.cjs`: 37 checks passed.
- `node tests/lead-contacts/quality.test.cjs`: passed.
- `node tests/lead-contacts/published-obfuscation.test.cjs`: passed, including
  provenance, deduplication, vendor exclusion, invalid-address exclusion,
  malformed inputs, oversized local parts and large-text runtime.
- `node scripts/diagnostics/test-contact-refresh-scratch.cjs`: seven SQL checks
  passed in `scratch_contact_refresh_20261108`, restored from the saved backup
  inside network-isolated `lead_016_1794141179811`. Container stopped afterward.
  No live database writes, provider calls or workflow imports.

Deployment complete: 052 applied and updated contact runtime installed.
No workflow nodes or connections have changed.
UNVERIFIED: incremental real-world email yield from the added protection decoders
(covered by offline fixtures, not observed on these two sites). Paid verification
and AI remain paused.
