# Lead cleaning

The generated workflow is `workflows/04_data_cleaning.json`. Its source is
`scripts/lead-cleaning/build.cjs` and the self-contained transformer in
`scripts/lead-cleaning/runtime.cjs`. Migration 004 supplies the transactional
database operations. It must be applied before importing the workflow.

## Processing contract

Cleaning has its own `cleaning_status`; it never overwrites email discovery's
`processing_status` or gathering's counts, costs or history. Every minute it claims
up to 50 rows, ordered in rounds across organizations. Claims expire after five
minutes. Expired work is retried after a minute, up to three attempts, then becomes
`failed`. An administrator can explicitly requeue with
`cleaning_retry(org_id, staging_id)`. Concurrent workers skip locked candidates;
under contention a batch may be smaller than its limit.

The save transaction locks the organization and staging record, checks the lease,
saves the cleaned record and its source link, appends history and updates cleaning
status together. An SQL failure rolls back the outcome; it never marks the row
successful. A repeated successful lease returns the saved outcome. Source field
changes invalidate outstanding claims and queue a fresh normalization, including
emails discovered later by another workflow.

Outcomes are `cleaned`, `needs_discovery`, `review`, or `failed`, in addition to
`pending` and `processing`. A website-only business is retained for discovery.
No usable contact and no website, or no business name, produces review. Paid
discovery is not invoked by cleaning.

## Normalization and preservation

- Unicode normalization preserves Urdu and other non-Latin business names.
- National phone conversion supports PK and US/CA with explicit country context.
  Other national formats stay uncertain; international strings get structural
  checks only. Extensions are separate. This is not carrier or reachability
  verification and does not infer WhatsApp availability.
- Email format, disposable classification and mailbox verification are separate.
  New records start unverified. Role inboxes receive the same completeness weight
  as other syntactically accepted addresses.
- Website normalization works without a `URL` global. It preserves HTTP/HTTPS,
  paths and query strings; drops fragments; rejects unsupported schemes, literal
  IP hosts, credentials in URLs and malformed hosts. It makes no network request
  and is not a substitute for SSRF controls in a future crawler.
- Latitude and longitude include valid zeroes. Review counts handle thousands
  separators. Invalid or ambiguous numeric values remain unknown.
- Existing records are filled only where fields are empty. Verified email values
  and customer edits are preserved; proposals and source snapshots stay in audit
  history. Existing potentially corrupted values require reviewed correction.

The 0–100 completeness score is based on name (15), email (20), phone (20),
website (15), address (15), country (5) and category (10). It does not measure
buying intent or verified contactability. Contact readiness is reported separately
in the normalization proposal. Existing records can retain different values from
the latest proposal; consumers must use the saved verification fields for actual
channel eligibility.

## Business identity

The same staging record is idempotent; source links retain organization and cleaned
record IDs separately. Shared phone/email uniqueness indexes are replaced by
lookup indexes so branches can coexist. Fuzzy name plus address/phone matches
within an organization are suggestions only. No fuzzy auto-merge occurs.
An existing cleaned record with a different or missing organization goes to review
without assigning ownership. Orphaned historical cleaned records are untouched.

## Internal API

Both endpoints require the existing `X-Lead-Gathering-Key` server credential:

- `GET /webhook/cleaning-status?org_id=1&job_id=115` returns counts and up to 100
  actionable rows with reasons. `job_id` is optional.
- `GET /webhook/cleaning-preview?org_id=1&staging_id=154` returns the proposed
  normalization without writing, claiming work or calling a provider. Preview
  excludes the processing lease and does not simulate identity resolution.

These are trusted-backend endpoints. The shared key must never be embedded in
Flutter; a future authenticated gateway must derive the organization from the
logged-in user. Cleaning's database switch defaults to disabled:
`UPDATE cleaning_controls SET enabled=true WHERE id=true` enables claims after
verification. Workflow activation and the database switch are separate controls.
The optional `cleaning_controls.staging_ids` array limits processing to selected
staging IDs for a controlled rollout. A null array allows the full queue.

## Tests and rollout

- `node tests/lead-cleaning/runtime.test.cjs`: 22 deterministic checks.
- `tests/lead-cleaning/database.sql`: rollback-only integration checks, including
  failure atomicity, shared contacts, tenant boundaries, replay, historical review,
  preserved edits, late-discovered email and bounded retries.
- `scripts/lead-cleaning/test-n8n.cjs`: real n8n execution against synthetic
  records in `lead_gathering_test_20260926`, with a separate SQLite n8n profile.
- `scripts/lead-cleaning/test-http.cjs`: isolated authenticated HTTP verification.
- `scripts/lead-cleaning/verify-live.cjs`: production preview, five-lead canary
  and activation checks. It reads the internal key privately and stores the
  canary baseline under ignored `.local/cleaning-deploy`.

Before production rollout, back up the database and exported workflow. Leave the
old duplicate cleaning workflow and discovery/verification/enrichment workflows
inactive until their own integration checks pass. No historical ownership repair
is included in this migration.

Further work from the design remains explicit: organization-specific policies,
multiple independently verified contacts, review correction/merge UI APIs,
pagination beyond the first 100 review rows, and coordination with the rebuilt
email-discovery and verification stages. They are not implemented by this core
cleaning revision.

## Production verification — 2026-09-28

Migration 004 and the updated workflow were deployed after saving the database
backup and previous workflow under `.local/cleaning-before`. The isolated HTTP
suite passed authentication, request validation, preview and tenant-boundary
checks. Startup readiness waits for the actual JSON API response; n8n can serve
its HTML page before registering webhooks.

Production dry-run previews passed. A five-record allowlist (staging IDs
150–154) then completed through the scheduled n8n workflow with exactly five
audit outcomes, preserved discovery statuses and no outreach activity. The
allowlist was removed only after these checks passed.

Automatic cleaning is enabled. The initial 86-record backlog completed with
43 cleaned and 43 in review: 39 historical organization mismatches and four
records without usable contact information. There were no pending, processing
or failed records at verification, and 86 distinct staging records had 86 audit
records. The 39 historical ownership mismatches and nine orphaned historical
cleaned records were preserved for reviewed reconciliation. Outreach remained
at 11 records. No paid scraping or verification service was called for rollout.
