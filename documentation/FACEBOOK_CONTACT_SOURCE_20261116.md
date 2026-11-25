# Facebook as a keyword/location contact source

The user explicitly requested a third source comparable to Google Maps and Yellow
Pages, rather than enrichment of the earlier five businesses. Those records and
their accounting were left unchanged.

The existing Facebook source now requests the same Apify search actor's
`pages-google` mode. It accepts business keywords and locations and documents
contact-rich Page results (phone, email, external website and address when public).
This is Facebook Page discovery through Google search, not Google Maps scraping.
The input contract still has one total resultsLimit, one actor run and the same
$0.50 / 50-target / 150-candidate upper bounds, without paid retries or a second
detail actor. Public provider reference:
https://apify.com/apify/facebook-search-scraper

The mapper now accepts ordinary bare business domains, normalizes them to HTTPS,
retains an explicit HTTP scheme when supplied, strips tracking queries and excludes
Facebook/Instagram/Messenger URLs from the external-website field. Public phone,
email, Page links and address continue through the existing staging/dedup/cleaning
pipeline. No contact, location or messaging permission is invented.

Selecting Facebook in Find leads enables Require a phone, email or website by
default; the existing checkbox remains explicit and editable. Thus contact-less
records do not count toward the target when this filter is on. A public website
is useful for further contact discovery; it is not a verified email address.

Eight focused source/normalization checks and five NewSearch UI checks passed.
Only the two changed Code-node bodies were installed in the idle Facebook worker;
the installer verifies their precise old baselines. Graph, authentication,
credentials, billing, SQL admission, retries and activation remain unchanged.
No new migration or gateway restart is required. Evidence/rollback:
`.local/facebook-contact-source-20261116/`.

No paid run or additional contact request was made. The provider's documented
contact-rich mode is configured and locally tested, but real contact yield and
geographic relevance remain unverified until a separately user-confirmed run.
Do not describe the earlier discovery-only run as validation of this mode, or
claim that any scraper guarantees every business publishes all contact fields.

Live acceptance subsequently passed in user-started search 123: five saved records
from fourteen source results, cost $0.169 within the user's $0.30 ceiling. All five
reached cleaning with phone numbers, three have emails and three have external
business websites. No Messenger links were returned. A fourth apparent website
was a Google Maps navigation link; the mapper now excludes Maps hosts/paths and
short links, with a regression check. The confirmed bad website value on lead 494
and its linked staging row was cleared, preserving raw source data. No outreach
activity existed for that corrected lead. Nine focused source checks passed.

Contact extraction is verified, but prospect qualification is separate: results
include a dental regulator and an association, which are not established dental-
clinic sales prospects. Do not equate the five contact-bearing records with five
qualified customers. No additional scrape, AI request or outbound message was
made during verification/correction. Evidence: `live-search-123-corrected.json`
and `map-link-before.json` in the private contact-source directory.
