# Clinic enrichment audit and rollout

The initial website benchmark ran on 2026-10-05. The fixes were deployed and
the two affected clinic records refreshed on 2026-10-10.

## Sample and measured results

The sample contains all nine eligible real clinic records identified in the
existing cohort: 167, 445–449 and 460–462. Synthetic ABC Dental records and
historical records without organization ownership were excluded. This is a small
existing-data cohort, not a representative market-wide accuracy benchmark.

- Seven of nine clinics had no saved website: collection reported unknown website
  observations and did not fabricate evidence or contacts.
- Two clinics had websites. Nine unique page attempts across those two domains
  took approximately 11.6 seconds in the original run. Basic enrichment and contact
  discovery shared fetched pages during the benchmark; this timing is not a full
  production pipeline throughput measurement.
- No email candidate was discovered for any of the nine clinics: 0/9 overall and
  0/2 among clinics with saved websites. This does not establish that emails do not
  exist elsewhere. No deliverability verification was performed.
- No paid provider calls were made by the benchmark or rollout. Provider API
  spend for this work was $0; hosting/network costs were not measured. Cost per
  verified lead is undefined because no lead was independently verified.

## Review and fixes

| Record | Finding | Result |
|---|---|---|
| Astoe, 162 (separate diagnostic) | Saved Maps phone and website phone differ. | Kept both pieces of evidence and the review flag; neither number was overwritten or declared wrong. |
| Fiaz Dental Care, 167 | Construction-news heading was treated as a dental service; placeholder appointment links counted as usable bookings. Earlier DNS failure had remained partial evidence. | Industry-specific heading filtering removes the unrelated claim; placeholder/self links are excluded. Fresh website collection now succeeds; contact form observed, booking link not observed. |
| Zia Dental Consultants, 449 | Appointment-request form lacked email/message fields and was missed. | Form now recorded as an appointment request, with submission explicitly untested; relevant service headings retained with source URLs and review status. |
| Seven clinics without websites | No website evidence available to inspect. | Remain incomplete; missing website does not mean no website exists. |

Manual comparison used the captured website HTML and publicly accessible pages:
[Astoe](https://www.astoecompany.com/),
[Fiaz Dental Care](https://fiazdentalcare.com/) and
[Zia Dental Consultants](https://ziadentalconsultants.me/).
Additional searches corroborated some names/locations, but did not independently
verify all nine businesses or their phone ownership. No accuracy percentage is
claimed. Generic slogans and observed headings are not independently verified
services; retained candidate headings still require review.

## Recovery and deployment

`observations.cjs` is used by the existing 06A external worker. No workflow nodes,
connections or sticky notes were changed for this rollout.
Future installations must copy `observations.cjs` alongside `worker.cjs`,
`runtime.cjs` and `ai-research.cjs` under `/home/node/.n8n/enrichment-stage/`.
The older implementation document predates this dependency; use this rollout
note and LEAD_TRUST.md for migrations 013–014 and current helper requirements.

When no usable HTML page is collected and DNS/network errors, HTTP 408/429 or 5xx
indicate a transient failure, the worker now reports a failed attempt. Existing
database recovery requeues after ten minutes, up to three attempts. Missing
websites, blocked targets and ordinary 403/404 results are not blindly retried.
Partial success on other pages remains partial rather than a full retry.

Migration 014 preserves that retry mechanism while naming temporary-source errors
correctly instead of reporting them as invalid worker results. It was tested in
`lead_gathering_test_20260926`, then applied to `lead_db`.

The rollout saved the prior worker, database function, affected profiles and
processing controls inside the n8n container under
`/home/node/.n8n/enrichment-stage/clinic-rollout-20261010/`. It refreshed only clinic
IDs 167 and 449, through task claims and the normal save function, then restored
the previous enabled state and unrestricted allowlist. AI and Abstract remained off.
No contact fields were overwritten and no outreach was sent by the rollout.

## Checks

- Observation and enrichment runtime tests passed.
- Saved-page replay passed against the original benchmark: identical input pages,
  no extra network calls, corrected classifications.
- SQL tests passed: delay, three-attempt ceiling, no fresh evidence from failed
  requests, successful recovery and stale-lease rejection.
- Both live basic tasks and both deterministic research tasks completed.
- Live localhost API assertions passed for both refreshed records: corrected
  observations, fresh usable HTML, service evidence, and no false verification or
  automatic-outreach eligibility. Both report `evidence_available_contacts_unverified`.

Raw benchmark HTML and replay results remain in ignored `.local/clinic-benchmark/`.
External discovery for the seven website-less clinics and mailbox verification
remain outstanding capabilities, not completed results of this deployment.
