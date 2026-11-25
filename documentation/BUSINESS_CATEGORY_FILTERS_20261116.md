# Business category filters across industries

Category filtering is not tied to dental clinics. Find leads now exposes optional
Accept categories / Exclude categories fields for the existing three gathering
sources. Comma-separated terms are normalized to the existing bounded arrays,
included in the signed preview and displayed before submission. They match the
provider's category labels rather than business names; this is not semantic
classification. Empty fields keep the search broad.

For Facebook, a configurable filter handles common unrequested Page kinds:
government/regulatory categories, professional/trade associations/nonprofits,
and creator/fan-page categories. The filter reads the requested search terms;
explicit searches for those kinds preserve them. Unknown categories are not
automatically rejected. Users can disable this heuristic and use explicit category
terms instead. Source labels can be wrong and the English kind rules do not prove
business relevance, ownership, location or permission. Creative agencies or public
service providers using unusual tags may need the override. No positive fit claim
is created by surviving this filter.

The `exclude_unrelated_page_types` boolean is validated and preserved through
dashboard normalization, signing, n8n preview/admission and stored request settings.
It is only active for Facebook. Exclusions retain their original source payload
and an explanatory unrequested_page_type reason. Budget/result bounds, duplicate
matching and the no-refill/no-paid-retry policy remain unchanged. Filtering may
produce fewer leads within the same authorized run.

Checks cover plumbers, restaurants, law firms, real estate agencies and clinics,
plus intentional creator/government/association searches, unknown categories and
the explicit override. The five previously accepted records from search 123 were
replayed locally: the two clinic/office records remain, while the reel creator,
regulator and association are excluded. This replay changed no database records
and made no provider or AI call. Existing saved leads and accounting remain intact.

The relevant runtime/gateway suite passed 87 checks and the NewSearch UI suite
passed six. The installed authenticated read-only preview retained Plumbing,
Reel creator and the explicit false Page-type override. No job was submitted.
Two existing workflows received Code-node updates only; no tables/migrations,
credentials, graph, schedules or billing rules changed. The gateway was reloaded
with its existing email switches preserved. Evidence and rollback:
`.local/business-category-filters-20261116/`.
