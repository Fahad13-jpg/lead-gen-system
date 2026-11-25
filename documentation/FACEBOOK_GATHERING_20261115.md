# Facebook Pages gathering source

Installed locally as `facebook_pages` in the existing Find leads preview/admission
flow. This is third-party public-Page discovery through the connected Apify account,
not a Meta messaging authorization or an unrestricted Meta Graph API directory.
No customer Facebook login, session cookies or personal profiles are requested.

Provider contract was read without running an actor from
`https://api.apify.com/v2/acts/apify~facebook-search-scraper/builds/default`.
Its input schema defines categories, locations, searchType and resultsLimit;
resultsLimit is explicitly the total for the entire run. We select searchType=pages
and make one bounded run. No separate paid details/contact actor or refill is used.
Reference: https://apify.com/apify/facebook-search-scraper

Limits: target 1–50 businesses, at most 150 candidates, provider ceiling at most
$0.50. Existing signed preview, customer/platform billing, admission reservation,
ownership receipts, deduplication, cancellation, terminal accounting and no-blind-
paid-retry behavior remain in place. Migration 061 extends only the current
admission function and checks these source limits again inside SQL. It preserves
owner/grants and existing accounting rules. Its valid admission and three excessive
scope cases were probed in a rolled-back transaction; no test job was committed.

The new authenticated worker is `CCedag31c0pmbdAL`, named
`3B - Facebook Pages Scraper`, at `scrape-facebook-pages`. The existing main
orchestrator now routes Facebook jobs to it while retaining Google Maps/Yellow
Pages routing. Existing main settings/credentials and paid POST retry policy are
preserved. Source builds and deployment artifacts include the fifth workflow.

Mapping preserves available Page ID/URL, name, public contacts, external website,
categories, address and raw source evidence. It excludes personal/post search
results, applies explicit filters and candidate caps, and does not populate city
or country from the requested area. The area is a provider search hint, not a
verified business location. Missing contacts/Messenger links remain unknown.
An observed Messenger link is retained but automatic_messaging_eligible=false;
no recipient-scoped messaging identifier or opt-in is inferred.

A Facebook-only listing with a valid canonical Page URL can become a
needs_discovery lead with no invented phone/email/website, rather than disappearing
into contact-less review rows. Existing normalization for other sources is
unchanged. Lead detail projects only bounded Page/Messenger links and observation
dates from same-org linked source rows. Public listing presence is not independent
business/contact verification or an absence-of-website claim.

Validation: 94 gathering/service checks passed, followed by the added Facebook-only
cleaning case and 22 existing cleaning checks. Nine NewSearch/LeadDetail UI checks
passed. The production build `main.bc52cf61.js` is installed and served. The local
gateway was reloaded with the existing email switches preserved. The installed
authenticated preview returned source=facebook_pages, 15 candidates and a $0.10
ceiling for a five-business request; billing was ready. No submit/start was made.

Evidence/rollback: `.local/facebook-source-20261115/` and
`.local/facebook-source-ui-20261115/`. No paid scrape, AI request, outbound message
or Meta account connection occurred during installation. Real provider-result,
cleaning and billing acceptance remains pending one user-confirmed small search.

Messenger automation is a separate stage requiring the organization's authorized
Page and an eligible conversation or supported opt-in. Discovery or a Messenger
link alone does not satisfy those conditions. No cold-inbox sender was installed.

Live acceptance: the user confirmed search 121, target five / fifteen candidates,
with a $0.10 cap. It completed at $0.091, fetched fifteen results, saved five new
businesses and excluded ten after reaching the target. All five produced linked
needs_discovery leads (482–486) with canonical Page URLs. The actual `pages` search
response contains id/name/url/searchType/isVerified/profilePictureUrl/facebookUrl;
it does not contain phone, email, website, address or Messenger-link fields. Thus
these remain missing/unknown, not negative evidence. City/location also remains
unverified. No separate details actor, AI request, messaging attempt or retry was
started during verification. Details enrichment remains an optional additional
bounded provider operation, not part of this completed run. Evidence:
`.local/facebook-source-20261115/live-search-121.json`.
