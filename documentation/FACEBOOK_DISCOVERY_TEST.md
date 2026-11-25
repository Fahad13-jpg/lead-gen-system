# Facebook contact discovery live test

Tested 2026-09-28 with `apify/facebook-page-contact-information`, run
`u7K9P9qT3GUB8MX13`. Status: SUCCEEDED. Duration: approximately 39 seconds.
Three already-known business page URLs were supplied; no profile-search actor ran.

| Business | Returned email | Comparison with current lead data |
|---|---|---|
| ALL ED ELECTRIC | info@alledelectricil.com | New candidate; primary and candidate list were empty |
| Halsted Plumbing & Sewer | jrhal@yahoo.com | Already present; comparison case |
| Roto-Rooter Chicago | rr.social@rrsc.com | New candidate; primary and candidate list were empty |

Returned page titles and business website links matched the selected businesses.
The Roto-Rooter address appears to be a social-contact inbox; its suitability for
sales outreach is unestablished. None of these addresses was externally verified.
The 3/3 email result is a small selected sample, not an expected general success rate.

Apify reported **$0.040000 total**: $0.001 start + 3 × $0.013/result.
That is $0.02 per additional email candidate in this sample, not per verified or
sales-ready contact. The provider charge cap was $0.10. A result is chargeable
whether or not its email is useful; this is not pay-per-email-found pricing.

Migration 007 adds an administrative diagnostic ledger and includes reservations
and actual charges in the existing account-spend function. This test is recorded
against the platform's unchanged $5 monthly ceiling. Unresolved runs retain their
full reservation. No customer wallet was debited. The isolated rollback test for
reservation-to-actual accounting passed before deployment.

The test script refuses a second start for its existing reference, stores the run
ID and polls that same run. A transient status-network failure was retried without
starting another paid run. Raw evidence and the input manifest are saved under
ignored `.local/contact-deploy/facebook-test/` and the persistent n8n volume.

No lead emails were overwritten or promoted. No Abstract requests were made;
verification remains disabled and outreach remains inactive (11 existing records).
Automatic Facebook discovery is not integrated or enabled by this test.

Recommendation: add Facebook as an optional budgeted fallback for leads missing
emails, using known official page URLs, business-identity checks, reusable results
and candidate provenance. Reject generic/wrong-business links: the saved Wells
Plumbing link pointed to `facebook.com/platform` and was excluded from the test.
