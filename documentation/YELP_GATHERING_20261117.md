# Yelp gathering source — 17 November 2026

Yelp is implemented as an additional independently selected source. Google Maps,
Facebook, their combined option, and US-only Yellow Pages remain available.

## Current scope

- US searches only, at most 50 new businesses / 150 candidate records per job.
- Provider ceiling at most $0.50; platform/BYOK admission, organization quotas,
  wallet checks, reservations, provider account binding and settlement are reused.
- Actor: `tri_angle/yelp-scraper`, published by an Apify-maintained developer.
  Input uses documented `searchTerms`, `locations`, bounded `searchLimit`, no
  direct URLs and `maxImages:0`. This business actor does not collect full reviews.
- Name, published phone/website, street/city/state/postcode/country, categories,
  rating and review count are mapped from the documented business output.
- Canonical Yelp business listing URL and business ID are retained as provenance.
  A Yelp listing in the website field is not treated as the business website.
  Missing email/contact/geography stays missing. Listing data is not contact
  verification, business fit or permission for outreach.
- Existing closed/contact/category/country filters, cleaning/dedup and assessment
  pipeline remain in use. No automatic source fallback or paid refill is added.

## Installation and evidence

Migration 068 extends only the existing admission function, preserving owner and
grants. Six rollback-only real database probes covered a valid request and rejected
non-US/missing-country, target, candidate and spending scope. No test job committed.

The new authenticated worker was cloned from the installed guarded Maps worker.
Only its name/webhook/claim source and actor/transform code changed. The existing
orchestrator gained an explicit Yelp branch and updated input validation. Original
settings, credentials, existing routes and paid-start retry protections were retained.
Workflow write/readback matched; rollback function and main workflow snapshots are
under ignored `.local/yelp-source-20261117/`. A write with an unknown result must
be reconciled from this journal and live state, not repeated blindly.

Eighty gathering checks passed, including four Yelp-specific tests. The search UI
checks also passed, including US-only selection and no submission during review.
Installation created zero Yelp jobs and made zero paid actor starts or outreach.

**Live Yelp result quality and billing yield are not yet accepted.** The UI says
so. The next acceptance is a separately authorized small US search with a reviewed
provider ceiling, followed by checking usable contacts, new/duplicate businesses
and actual provider cost. Do not substitute another actor if this one fails.

Primary actor contracts:
- [Input schema](https://apify.com/tri_angle/yelp-scraper/input-schema)
- [Documented business output](https://apify.com/tri_angle/yelp-scraper)

## Recovery

Before removing this source, stop new Yelp admissions and check for queued/running
or unsettled Yelp jobs. Preserve any provider IDs and held reservations until
reconciled. Existing source admission must remain available. Restoring the backed-up
main workflow/function is only appropriate after checking for newer modifications;
do not restore a whole database over newer work. The inactive historical Twilio
and unrelated channel workflows are outside this installation.

Installed read-only preview also passed through the local gathering transport: five requested businesses, fifteen candidate records, BYOK budget checks passed. No reservation, job or Apify request was created. The production frontend built successfully and the served bundle was verified.
