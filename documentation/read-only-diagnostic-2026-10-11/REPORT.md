# Read-only diagnostic — 11 October 2026

No workflow, database, model, Apify, network-setting, activation, or trial-ledger changes were made. Only local diagnostic artifacts were created. Database reads used BEGIN READ ONLY and ROLLBACK. Network tests were GET /openai/v1/models only, with the key held in memory. The deployed worker files were compared with local source and match.

## 1. Why the leads have 0 or 6 strategy excerpts

| Lead | Excerpts | Classification and cause | 06A pages | Website status |
|---|---:|---|---|---|
|167, Fiaz Dental Care|0|Thin/repetitive/template business evidence; restrictive heading extraction and omitted non-heading signals. Not a failed fetch or empty JS shell. Stored conflicts are empty despite suspicious template content.|3 HTTP 200, usable HTML, not truncated|page_observed_ownership_unverified|
|445, Islamabad Dental Clinic|0|No saved website; no fetched website evidence or matched LinkedIn excerpts.|0|missing|
|446, Luminosity Dental Clinic|0|No saved website; no fetched website evidence or matched LinkedIn excerpts.|0|missing|
|447, The Dental Care Clinic|0|No saved website; no fetched website evidence or matched LinkedIn excerpts.|0|missing|
|449, Zia Dental Consultants|6|Eight accepted service headings exist; strategy context takes only the first six. Not a fetch failure, block, empty shell, stale or conflicted record.|3 HTTP 200, usable HTML, not truncated|page_observed_ownership_unverified|

All five currently have website_current=true, research_current=true, conflicts=[] and outreach_context=[]. For missing websites, website_current describes a fresh saved assessment; it does not mean a website exists. All remain fully_verified=false. Live 06A data for 167/449 was saved on October 10. 445–447 basic assessments are from October 3, within the 30-day freshness window; research is October 10.

06A does not persist fetched HTML or text-byte counts. Exact text bytes for its October 10 fetches are therefore UNAVAILABLE. The following are reproducible estimates from the existing October 5 benchmark snapshots, not claims about the later response bodies. Strip script/style/noscript and tags from body, collapse whitespace, count UTF-8 bytes; entities remain encoded and CSS visibility is not evaluated.

|Lead|URL/path|HTTP|HTML bytes|Approximate static text bytes|
|---|---|---:|---:|---:|
|167|https://fiazdentalcare.com/|200|192579|3455|
|167|/index.php/contact-us/|200|112904|1431|
|167|/index.php/about-us/|200|138121|3122|
|167|/contact (03b only)|404|796|71|
|167|/contact-us (03b only)|404|796|71|
|449|https://ziadentalconsultants.me/|200|55300|5957|
|449|/contact/|200|17774|1986|
|449|/about/|200|20005|2501|
|449|/contact-us (03b only)|404|10784|1042|

445/446/447: no pages, hence zero fetched text. Three successful pages total 8,008 approximate text bytes for 167 and 10,444 for 449 in the historical snapshots. Fiaz's text includes lorem ipsum, unrelated construction-news headings, a generic foreign-format phone/address, and generic staff names. These are warning signals, not proof that the business itself is false. Its generic dental headings do not match the accepted service taxonomy; specific implant/smile-design wording in ordinary page text is not examined by the heading extractor. Its WordPress and contact-form observations survive storage but are not strategy excerpts.

449 first six headings: Orthodontics & braces; Clear aligners; Cosmetic dentistry; Dental implants; Metal braces; Braces cost in Islamabad. Braces vs clear aligners and Orthodontic consultation in Islamabad are dropped by the six-heading cap.

Raw records: database.json. Historical response evidence, headings and extracted text: historical-page-evidence.json. Original HTML: .local/clinic-benchmark/baseline.json in the repository root.

## 2. Observation storage and exactly where it is lost

Canonical table: enrichment_profiles, scoped by org_id and lead_id. JSON paths below are inside its basic column. enrichment_report() returns the entire basic and research objects; strategy_context() forwards both entire objects. Neither strips these observations. The loss is primarily in 06C strategyRuntime.context(), embedded in the deployed Prepare Strategy Code node, corresponding to scripts/lead-strategy/runtime.cjs lines 35–62.

|Observation|Canonical column/path|Legacy enriched_leads projection|Report/context exposure|Actual 06C use/drop point|
|---|---|---|---|---|
|Business name/category/city/country/website/domain; timezone null|basic.business.*|domain, detected_country|Both retain basic; context separately supplies cleaned lead identity|Uses cleaned lead company/category/city/website for draft greeting, targeting and scoring; does not use most basic.business fields as evidence. No inferred timezone.|
|Booking link|basic.observations.booking_link; basic.evidence[] type booking_link, value/source_url/submission_tested|data_sources_used.evidence|Both retain|Never added to context().evidence or bank; absent from AI input.|
|Contact form, including appointment forms|basic.observations.contact_form; basic.evidence[] type contact_form|has_contact_form, data_sources_used.evidence|Both retain|Never read by context(); no AI block. Presence is not a tested working submission.|
|WhatsApp link|basic.observations.whatsapp; basic.evidence[] type whatsapp|data_sources_used.evidence|Both retain|Never read by context(); WhatsApp readiness only checks cleaned phone and records permission/ownership unresolved.|
|Facebook/Instagram/LinkedIn profile links|basic.social_profiles[]; basic.evidence[] type social|data_sources_used.evidence|Both retain|Ignored by context(); only independently matched research.linkedin.profiles affect LinkedIn readiness/research coverage. A raw social link is not a matched profile.|
|Telephone links|basic.evidence[] type phone|data_sources_used.evidence|Both retain|Ignored as evidence; context uses cleaned_leads.phone rather than website-observed number.|
|Technology markers, only WordPress/Shopify|basic.technologies[]; basic.evidence[] type technology_marker|technologies_detected, data_sources_used.evidence|Both retain|Ignored by context(); not converted to factual blocks.|
|First matching meta description, up to 500 characters|basic.website_description; basic.evidence[] type website_description|website_description, data_sources_used.evidence|Both retain|06B evidenceFor() accepts it, but 06C context() ignores both the description and research.ai_research.evidence/facts.|
|Industry-matched H1/H2/H3 service headings, up to 20|basic.services[] text/source_url/method/requires_review; copied to research.services|Not directly projected as service columns|Both retain|context() takes first six only if website_current, truncates each quote to 240 characters. Remaining headings discarded here.|
|Fetch result/status/truncation/usability/error|basic.pages[]; basic.status/reason/coverage|Not directly projected|Both retain|Used indirectly through trust; raw diagnostics never enter AI input. Worker basic() pages.push omits fetch response bytes and body at collection time.|
|Quality flags, observed time, fingerprint|basic.quality_flags/observed_at/input_fingerprint; basic_at column|Not directly projected|Both retain|Trust uses freshness/fingerprint; raw flags and observation metadata are not sent to AI by prepare().|

Additional upstream loss: serviceHeading() in scripts/lead-enrichment/observations.cjs supports dental, plumbing, electrical and software/web taxonomies only; generic headings, ordinary paragraphs and unknown industries yield no service evidence. worker.basic() only reads a narrow meta-description attribute order. contactRoutes() recognizes selected hostnames and caps routes at 20 per page. No full page text is saved to the canonical profile.

06B evidenceFor() in scripts/lead-enrichment/ai-research.cjs admits website descriptions, service headings, matched LinkedIn profiles and posts. It excludes form/booking/phone/social/technology observations at its type-selection loop. This does not remove them from basic storage.

06C prepare() constructs AI input from channels, company_name, factual text blocks, tone and mode. Full basic/research/trust, provenance URLs and timestamps are not passed to the model. They remain outside the prompt. Locally, required_evidence_id was added; the deployed runtime differs on that later correction. Both versions share the six-heading bottleneck and 2400 token cap.

Current SQL definitions, extracted directly from pg_get_functiondef, are included in full in current-functions.sql (including the underlying report, wrapper, legacy projection and strategy_context).

Current public.enrichment_report definition:

```sql
CREATE OR REPLACE FUNCTION public.enrichment_report(p_org integer, p_lead integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
 SELECT CASE WHEN r IS NULL OR t IS NULL THEN NULL ELSE r||jsonb_build_object('trust',t,'outreach_context',
 CASE WHEN t->'freshness'->>'website_current'='true' AND t->'freshness'->>'research_current'='true' AND jsonb_array_length(t->'conflicts')=0 THEN coalesce(r->'outreach_context','[]'::jsonb) ELSE '[]'::jsonb END) END
 FROM (SELECT enrichment_report_evidence_v1(p_org,p_lead) r,lead_trust_report(p_org,p_lead) t) q
$function$;
```

Migration lineage: database/migrations/009_evidence_enrichment.sql:69 originally defines the report; 010_linkedin_collection.sql:44 replaces it with the LinkedIn-aware report; 013_lead_trust.sql:46 renames that definition to enrichment_report_evidence_v1, and :49 defines the current wrapper. 015_outreach_strategy.sql defines strategy_context. No migration was run for this diagnostic.

## 3. JavaScript rendering

Neither 06A nor 03b renders JavaScript. Both use native HTTP(S), static response HTML and regular-expression extraction. 06A calls contact.publicPage: at most three pages/45 seconds. 03b discovery allows five attempts/55 seconds. publicPage limits individual bodies to 2 MiB, pins a public IPv4 address after DNS checks, validates same-host redirects and limits individual request time.

No configured JavaScript-rendering fallback was found in the repository pipeline. No Playwright/Puppeteer/browserless/render switch was found by repository search. The internal rendering behavior of third-party Apify actors is UNVERIFIED here, and those actor integrations are not an automatic render fallback when a 06A/03b static page is empty. No actors were run.

## 4. Token-free connectivity test

80 sequential-per-environment requests: 20 default, then 20 forced IPv4 from each environment. Windows and container test processes overlapped. Native Node HTTPS, fresh connection per request, normal certificate validation, no retries, 15-second overall ceiling, 200 ms gap. No chat completions. Per-request raw data is in windows-probes.jsonl and n8n-probes.jsonl; aggregates in probe-summary.json.

|Environment/mode|HTTP 200|Errors|DNS p50/max|Connect p50/max|TLS p50/max|Post-TLS response-header wait p50/max|Cumulative TTFB p50/max|
|---|---:|---|---|---|---|---|---|
|Windows default|20/20|None|5/791|37/216|59/166|342/376|455/1277|
|Windows IPv4|20/20|None|3/14|54/3439|68/5588|422/3024|645/11497|
|n8n default|6/20|14 ETIMEDOUT before connect|250/3692|246/530|161/370|424/1118|1119/4715|
|n8n IPv4|19/20|1 ECONNRESET before secureConnect|8/30|49/2269|86/1453|354/1409|525/4814|

All times milliseconds. Statistics use only requests reaching each phase: default n8n connect/TLS/TTFB n=6; forced IPv4 n8n connect n=20, TLS/TTFB n=19. No explicit TLS certificate/protocol errors. The reset before secureConnect is not enough to establish a TLS configuration fault.

DNS timing is request-start to the last socket lookup event, so it includes local setup and may include multiple address lookup events. Connect is from that event to connect. First-byte timing is approximated by the response-header callback, not a packet capture. The logged family is the last DNS lookup event, NOT proof of the connected peer's address family. Default n8n failures occur around 0.5–1.2 seconds; these are Node/network ETIMEDOUT errors, not the diagnostic's 15-second ceiling.

Interpretation: container default networking is unreliable in this sample. Explicit IPv4 markedly improved success, but did not eliminate failure. This is a lead for further network diagnosis, not proof that IPv6 alone is the root cause. Timing variability also exists on Windows. GET success cannot guarantee inference success; the production workflow may use a different HTTP client/connection pool. Earlier commentary claiming all 80 succeeded was incorrect and was explicitly corrected after reviewing the full raw records.

Proposed only: inspect Node address-selection behavior and the actual workflow HTTP transport; compare its model-list requests using the same HTTP client. Consider explicit IPv4 only after targeted validation. Do not apply firewall/proxy/Docker changes based on this sample alone.

## 5. Provider documentation and token budget

Groq documents reasoning_effort=low, medium, high for openai/gpt-oss-120b; medium is default. Unsupported values return 400. Deployed 06C does not set reasoning_effort and uses max_completion_tokens=2400.

Groq's model page lists a 131,072-token context and 65,536 maximum output. This is a model ceiling, not a recommended strategy budget. The reasoning guide describes reasoning as output tokens and hidden as an output presentation option; hiding it is not a promise to eliminate its token use. The API reference defines max_completion_tokens as the generated-token limit.

No documented fixed reasoning allowance or guaranteed safe completion cap for a 2,500-token strategy JSON was found. That value is UNVERIFIED and cannot honestly be guaranteed from documentation alone. 2400 is insufficient for 2500 visible tokens even without reasoning. Budget must exceed desired visible tokens plus variable reasoning. Any proposed 4096/8192 cap needs a separately authorized empirical test; none was run, and the exhausted trial ledger was not extended.

Official sources:
- https://console.groq.com/docs/api-reference (reasoning_effort, max_completion_tokens)
- https://console.groq.com/docs/reasoning (effort levels and presentation)
- https://console.groq.com/docs/model/openai/gpt-oss-120b (model limits)

## Proposed priorities — not implemented

1. Preserve and pass sourced description, booking/form, technology and channel observations into strategy evidence with their provenance and limitations. Do not turn absence into an asserted business problem.
2. Broaden evidence extraction beyond industry-specific headings; retain bounded, relevant paragraph excerpts and source-quality flags. Detect template/identity inconsistencies before treating a site as trustworthy.
3. Persist fetch/text diagnostics so later investigations can distinguish missing website, network failure, block, JS shell, thin content and filtering loss accurately.
4. Add a strictly bounded rendering fallback only for identified JS shells; these two sites do not establish a need for rendering.
5. Resolve container connection reliability, then validate reasoning budget and complete JSON handling before claiming production reliability. Keep review/send gates and existing budgets intact.
