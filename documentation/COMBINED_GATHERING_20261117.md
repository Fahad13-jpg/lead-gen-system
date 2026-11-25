# Google Maps + Facebook — combined search

Find leads now supports Google Maps, Facebook business Pages, their combined
option, and the existing US-only Yellow Pages source.

The combined option creates two existing, independently admitted jobs. It does
not introduce a new scraper or bypass the authenticated preview/admission paths.
The requested target, provider ceiling and platform charge cap are split between
the two jobs, with any odd business/cent allocated to Google Maps. For example,
five businesses and $0.51 become Maps: three/$0.26 and Facebook: two/$0.25.
The combined target is capped at 100, and its provider ceiling at $1, preserving
Facebook's existing maximum 50 businesses/$0.50 per job. Website-only filtering
is reset for the combination because it is not supported by the Facebook source.
Category/contact filters remain available. A combined review shows both source
allocations and total caps; aggregate platform charge and available wallet balance
must pass, with the normal locked checks performed again on each admission.

One confirmation starts each signed request at most once. Each source has a
distinct saved request ID. The browser persists uncertainty before submission,
stops on a rejection/unknown response, and preserves any earlier accepted job.
Reloading reconciles only uncertain request IDs using reads. It does not restart
a failed request or silently start the remaining source. Progress remains visible
as two source-labelled jobs. Admission can accept only one source if queue/budget
conditions change; this is stated in the review. Overlap can reduce unique results,
and no paid refill or automatic expansion is authorized.

Thirteen focused UI/orchestration tests cover budget allocation, combined credit
checks, partial admission, storage failure, reload and no-retry reconciliation.
No paid search was used to verify this change.

## Yelp status at the combined-source checkpoint

Superseded later on 17 November: Yelp is now implemented as a separate US-only
source; live acceptance is pending. See `YELP_GATHERING_20261117.md`. The paragraph
below records what was found before that addition.


Yelp appears in source-evidence/enrichment handling, but is not an enabled gathering
source: the runtime validator supports only Google Maps, Yellow Pages and Facebook
Pages; the repository has no Yelp gathering workflow; the installed workflow-name
lookup also returned no Yelp workflow. Yellow Pages is a separate source, not Yelp.
Adding Yelp would require its own adapter, scoped admission/budgets and acceptance;
this change does not advertise it as available.
