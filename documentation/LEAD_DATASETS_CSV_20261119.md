# Lead datasets, CSV import and export

19 November 2026

## Available locally

Installed dashboard main.eea33630.js. Migration 072 creates lead_import_batches and lead_import_rows. A fresh encrypted backup was created and verified at .local/backups/before-lead-imports-20261119 before the migration. Existing lead records were not changed by migration. The dashboard container alone was recreated with the new read-only module mounts; n8n and PostgreSQL were preserved.

1. Find leads / Search progress: each search has View leads from this search. /leads?search_id=ID includes businesses linked through staging/cleaning or saved gathering-result matches, including reused matches. EXISTS predicates avoid duplicating a business across source records. Results may be empty while cleaning is still in progress.
2. Leads: Upload or view CSV imports opens the template, uploader, preview, confirmation and recent-batch list. Each batch links to /leads?import_id=ID.
3. During campaign draft preparation: choose all leads, a recent search (up to 100 shown), or a recent CSV batch (up to 20), plus a processing-stage filter. Generation and channel admission checks remain mandatory. Existing businesses are selected individually; this change does not bulk-authorize outreach.
4. Download CSV: choose cleaned leads, system enrichment, user-provided enrichment or outreach activity. Download uses the selected search/import and text/contact filters. Enriched rows include the public report fields shown by the dashboard; outreach includes aggregate activity/reply/bounce counts and latest recorded status per channel, including sanitized call outcomes. It does not export credentials, internal provider payloads or message bodies.

## Import contract

Owners/admins may import UTF-8 CSV files up to 1,000 rows, 40 columns and 1,000,000 bytes. Preview shows the first eight accepted rows, skipped-row errors (up to 20 shown), and rows requiring review. Accepted headers: company_name (required), email, phone, website, address, city, state, zip, country, category, enrichment_notes. Common aliases such as business name, email address and phone number are accepted. Unknown columns are reported as ignored rather than treated as verification or execution fields.

Users label files raw, cleaned or enriched. These are provenance claims, never a grant of system enrichment, deliverability verification, permission or campaign approval. Uploaded notes appear separately on lead details and in exports; they are not automatically converted to verified AI evidence. The existing cleaner normalizes data and preserves its established business-identity/duplicate rules, including businesses sharing reception numbers. CSV source record identities use normalized contact/business fields, without notes or claimed stage; repeated rows link through the existing cleaning pipeline.

All accepted rows enter staging under source csv with no scraping job or provider start. Original row data and claims are retained as upload provenance. Invalid contacts remain unverified; usable contacts can still require channel verification. Rows needing review can be corrected in the source CSV and reuploaded. Existing cleaning controls are enabled with automatic scope locally; eligibility is based on the normal cleaning links/status. No global worker, funding, strategy or sending flags were changed.

The browser saves a request receipt before committing. The database enforces a unique request per organization and verifies a content hash on replay. An uncertain result can be checked, or the same file/request can be explicitly retried; it cannot silently create a duplicate batch. Session receipts contain request/hash/stage only, not the CSV text. An encrypted database backup includes the durable batch records.

## Export contract and limits

Exports include canonical cleaned contact/location/quality fields, current saved verification flags, assessment timestamps, dashboard enrichment JSON when requested, latest per-channel outreach statuses and provided upload labels/notes. Missing events remain unknown. Latest statuses do not establish delivery, reading, consent or completeness of enrichment. Up to 20 recent uploaded-note observations per lead are included; this is not a full historical audit archive.

Exports page through up to 10,000 matching leads per download with a fixed upper lead ID. Larger sets must be narrowed by search/import/filter; they are rejected rather than silently truncated. The page size is 250; read-only rate-limit responses can wait and retry once, with cancellation available. No file is downloaded when a later page fails. Values can change during the read; this is not a transactionally frozen audit snapshot.

CSV fields are quoted correctly, include a UTF-8 BOM, and escape spreadsheet formula prefixes. Phone values beginning + are protected as spreadsheet text; the importer recognizes that phone escape on reimport. No search, AI request or outreach action occurs during export.

## Validation

Passed: 5 CSV/scope/service tests, 1 new HTTP route/auth test, 42 existing HTTP tests, 13 data-service tests, 3 report-projection tests and 22 focused UI tests (86 tests). Production Vite build passed in 6.14 seconds. Rollback-only database integration verified preview, atomic import, replay without duplicate rows, normal cleaning_finish, retained unverified email state, search/import scope, system and supplied enrichment exports, empty and populated outreach exports, status/reply counts and receipts. No fixture transaction was committed or exposed to workers.

Desktop/mobile layout checks used rendered fixture data with installed styles; the page had no horizontal overflow and the wide preview table had its own scroll area. Live anonymous reads and import actions returned 401. A real signed-in customer CSV walkthrough remains an acceptance step; no real customer CSV was uploaded automatically.

## Deployment notes and remaining work

Apply migration 072 before deploying these modules. Include the new module files and source metadata in the gateway image, and use a fresh frontend build. Review least-privilege production role grants for the new tables/sequences and parameterized staging insert path; do not solve missing privileges with a blanket database grant. Preserve import tables and staging/cleaning links during application rollback, and reconcile any pending import receipts before user retries.

Broader launch work remains: frontend SDK/routing and legacy test dependency remediation, backend moderate dependency findings, n8n image review, real SMS/calling acceptance, final domain/HTTPS/OAuth registrations, legal operator details, off-host backups/recovery and monitoring. Optional analytics/indexing remain disabled until final setup.
