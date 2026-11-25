# Website launch readiness

18 November 2026. The final domain, operator identity, support address and GA4 property are not ready. Public indexing and optional analytics remain off. No external business listing, verification claim, testimonial, review, tracking account, publication or message was created.

## Checklist applied to this product

| Item | Decision and current work |
| --- | --- |
| 404 and application errors | Implemented: actual 404 HTML status for missing document routes, JSON 404 for assets, safe 503 recovery, React rendering boundary, and helpful 401/403/404/429/5xx/timeout messages. |
| Separate titles and descriptions | Implemented for every route. Public initial HTML contains metadata for social crawlers; SPA navigation updates it. Private titles contain no company names or recipient identifiers. |
| Sharing preview | Implemented: 1200 x 630 PNG, Open Graph and Twitter tags. Absolute sharing URLs activate with the final HTTPS origin. |
| Internal links | Public home, terms, privacy, FAQ and contact pages link to each other; errors link to home/workspace/help. |
| Sitemap | Dynamic `/sitemap.xml` is ready for the real HTTPS origin and indexing flag. It includes public pages only, with no private IDs or invented modification dates. Locally it returns unavailable rather than listing fake domains. |
| robots.txt | `/robots.txt` blocks crawling during pre-release. `/robot.txt` redirects to the correct spelling. Production rules allow crawlers to see page noindex directives while blocking API/webhook infrastructure. |
| HTTPS | Caddy configuration and a separate public-web Compose overlay are prepared. Live DNS, certificates and redirects cannot be verified before hosting/domain setup. |
| Cloudflare form spam protection | No public contact-submission form exists; none was added without a support destination. The Contact page is informational. Add Turnstile with mandatory server-side verification if a form is introduced. Authentication continues through Firebase, not a pretend CAPTCHA wrapper. |
| Google Analytics | Optional opt-in public-page integration is prepared. No ID is configured and no analytics request is made locally. Activation needs a real property, settings review and a consent test. |
| Privacy policy | A factual pre-release notice is implemented. Final operator/contact, locations, provider review and retention commitments remain launch requirements. It does not claim all legacy storage has identical encryption or promise instant deletion. |
| FAQs | Implemented with actual channel, package, approval and funding behavior. |
| Testimonials | Deferred until genuine customer feedback and permission exist. No invented customers, quotes, counts or review stars. |
| Bing Webmaster Tools | Verification-tag configuration is ready. Account ownership verification and sitemap submission wait for the real public site. |
| Google Business Profile | Not a prerequisite for this online software service. Create one only if the actual business meets Google eligibility rules for in-person customer contact. Do not invent an office/address. |
| PageSpeed Insights | Route-based code splitting and compressed HTTPS delivery are prepared. Local layout checks and build sizes are recorded separately; no public PageSpeed score is claimed before a public HTTPS URL exists. |
| Trustpilot | Optional after real customer usage, a final brand/domain and a genuine review process. No account or trust badge was created. |

## Domain and search setup

1. Pick the final brand/domain, configure DNS and complete the operator/support/retention details. Update `dashboard/src/site.json`, `dashboard/src/legal.js` and the privacy notice where appropriate. Regenerate the sharing image with `python scripts/dashboard/render-share-image.py`, then rebuild the dashboard.
2. Set `DASHBOARD_PUBLIC_ORIGIN` to the exact HTTPS origin. Set `APP_DOMAIN` to the same hostname. Choose a reviewed pinned Caddy image digest in `CADDY_IMAGE`; do not use placeholders for deployment.
3. Use `deployment/compose.web.yml` together with `compose.application.yml` and both `application` and `public-web` profiles. It publishes only the HTTPS proxy on 80/443; keep database/n8n/credential service access private. Caddy needs reachable DNS and ACME access. Confirm valid HTTPS and HTTP-to-HTTPS redirection before use. Do not enable HSTS preload or includeSubDomains without reviewing all hosts.
4. Complete Google/Firebase OAuth authorized domains and exact callback registrations for the final origin. Existing local callback registration is not public-domain authorization.
5. Set `GOOGLE_SITE_VERIFICATION` and `BING_SITE_VERIFICATION` to the actual ownership tokens if using meta verification. These appear in public HTML and are not credential secrets. Verify ownership in the respective accounts.
6. When the public pages and legal details are ready, set `PUBLIC_SITE_INDEXING_ENABLED=true`. Confirm `/robots.txt`, `/sitemap.xml`, public canonical URLs, real 404 responses and private `X-Robots-Tag: noindex, nofollow` headers. Submit the sitemap in Google Search Console and Bing Webmaster Tools. A sitemap and verification do not guarantee indexing.
7. Check a shared link in the destination social service. Social preview caches may require a fresh scrape after brand/image updates.

## Analytics activation

Set a real `GA4_MEASUREMENT_ID` and leave `PUBLIC_ANALYTICS_ENABLED=false` until the GA4 property is reviewed. The property must use manual pageviews: disable Enhanced Measurement page-view tracking based on browser history and other automatic event collection that could capture private routes or form data. `send_page_view:false` alone does not disable Enhanced Measurement history tracking.

Then enable `PUBLIC_ANALYTICS_ENABLED=true` on the final origin. Verify no tag loads before a visitor opts in, decline leaves tracking off, public pageviews omit query strings and referrers, and private routes are disabled and produce no new pageviews. No user_id, email, recipient, campaign content or workspace values are sent by the integration. Recheck behavior with the real GA4 property before claiming analytics is connected. This optional integration is separate from necessary Firebase session storage.

## Contact form if later required

Do not add an unprotected or nonfunctional form. First configure a real support destination and durable submission behavior. Add a Cloudflare Turnstile sitekey scoped to the final host and a secret only on the backend. The server must verify each token with Siteverify, check the expected hostname/action, enforce request and rate bounds, and reject unavailable, expired or duplicate verification. Never treat the widget alone as protection or retry sending an uncertain support message blindly.

## Relevant primary references

- [Google technical requirements and noindex](https://developers.google.com/search/docs/essentials/technical)
- [Cloudflare Turnstile server verification](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Google Analytics manual pageviews](https://developers.google.com/analytics/devguides/collection/ga4/views)
- [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https)
- [Bing Webmaster support and sitemap setup](https://www.bing.com/webmasters/help/webmaster-support-24ab5ebf)
- [Google Business Profile eligibility](https://support.google.com/business/answer/7039811)

## Local installation verified on 19 November 2026

- Installed in the existing dashboard container at `http://localhost:3000`; other services and provider settings were preserved.
- HTTP tests: 42 passed. Metadata/status tests: 6 passed. Focused public UI, consent and request-error tests: 17 passed. Production build compiled successfully.
- Desktop 1280px and mobile 390px checks covered FAQ, privacy, contact, missing-page recovery and the homepage, including light and dark appearances. Fixed an inherited horizontal dashboard layout on public pages; final screenshots show readable full-width mobile content with no horizontal overflow.
- Main JavaScript bundle is approximately 133.91 kB compressed, compared with 310.14 kB before route splitting. This is a bundle-size observation, not a PageSpeed score.
- Installed entry points: `main.cfa82b87.js` and `main.d969ad66.css`. Previous hashed assets remain available for existing tabs.
- Live local checks confirmed 200 public pages, actual 404 HTML, missing-asset JSON 404, healthy gateway, deny-all robots, generic private metadata, no analytics tag and a working sharing-image asset. Sitemap activation remains deliberately unavailable until the final HTTPS domain and indexing flag are configured.
- Public review links: `/faq`, `/privacy`, `/contact`, `/terms`; try `/not-a-page` for the 404 screen.
