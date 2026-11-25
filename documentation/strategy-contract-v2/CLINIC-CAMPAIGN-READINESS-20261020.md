# Clinic campaign readiness — 20 October 2026

Read-only checks against `postgres_db / lead_db`, organization 1. No provider calls, campaign creation, model calls, imports, activation or sending.

The draft matches four cleaned leads using city `Islamabad` and category containing `dental` or `dentist`. None has a primary email or any stored `lead_contacts` candidate. No production strategy plans exist for organization 1.

| Lead | Business | Stored website / pages | Current contact readiness |
|---|---|---|---|
| 446 | Luminosity Dental Clinic | No stored website; 0 pages | No email candidates; insufficient fresh business evidence |
| 447 | The Dental Care Clinic ( Dr.Shahnawaz Ahmed) | No stored website; 0 pages | No email candidates; insufficient fresh business evidence |
| 448 | Odontologia-Dental Setup | No stored website; 0 pages | No email candidates; insufficient fresh business evidence |
| 449 | Zia Dental Consultants | https://ziadentalconsultants.me; 3 pages | Business evidence available; no email candidates |

All four trust reports include `no_fresh_provider_verified_email` and `business_identity_unconfirmed`. Leads 446–448 also include `missing_or_stale_business_evidence`.

## Important deployment distinction

The live `lead_trust_report(integer,integer)` definition does **not** contain `website_presence`. All four reports return no such field, and their stored basic profiles have no `signals.web_presence.state`. Local signal-sheet features must therefore not be described as available in this live campaign.

Although all four reports return `website_current=true` and `research_current=true`, these indicate freshness checks, not successful evidence collection. Leads 446–448 have partial basic profiles and zero pages. A missing website value is **unknown**, not proof that no website exists. No “you have no website” pitch is justified.

## Next work, in order

1. Start contact discovery with lead 449's stored website; verify that it still belongs to the clinic before using new evidence. For 446–448, find a matching public website or business profile first.
2. Save discovered addresses through existing contact discovery and cleaning gates. Discovery alone is not email verification.
3. Obtain provider verification through the existing verification stage when an account is available. It remains paused; no manual status override is appropriate.
4. Review the outstanding signal-sheet deployment separately if its website-fit features are required. Do not implicitly apply migration 016 as part of email rollout.
5. Confirm the proposed offer and sender identity, then create the campaign through the existing versioned flow. Generate and approve exact plans only after evidence and channel readiness are sufficient; AI allowance remains unchanged.
6. Build the bounded release from real approved plan IDs and hashes. No release can be produced from these leads today without bypassing gates.

The email executor has passed its separate tests. This campaign is blocked by contact data and verification, not by the email transport implementation. Long-term provider connectivity and forced OAuth refresh remain UNVERIFIED.

## Completed public discovery pass

See `clinic-public-discovery-20261020.json` for per-lead sources, limitations and rejected contacts. The bounded search yielded no acceptable email candidates. InstaCare's own footer email was explicitly excluded. Zia's current public contact page displays appointment inputs routed through WhatsApp, so the proposed basic website offer should be deprioritized for that lead. The form was not submitted and ownership was not independently verified.

This completes the bounded free discovery check; it does not prove that these clinics have no email addresses. No database updates or verification overrides were made. The campaign remains a draft, with zero send-ready recipients. Further executor rewrites cannot resolve this data/provider prerequisite.
