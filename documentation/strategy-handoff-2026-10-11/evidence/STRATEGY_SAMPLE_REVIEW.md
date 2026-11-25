# Five-lead strategy review — 2026-10-11

**Verdict: plan generation works; message quality is not ready for automatic outreach.**

This review used five existing org-1 lead reports and a fictional clinic-website
offer, as authorized by the user. The sender and product benefits are sample
inputs, not claims about the user's actual business. No model requests, scraping,
database writes, emails, social messages or calls were performed. The runtime
generated the plans directly from reports in a PostgreSQL READ ONLY transaction;
this was a content benchmark, not a new webhook/queue test.

Complete generated plans: [STRATEGY_SAMPLE_PLANS.json](STRATEGY_SAMPLE_PLANS.json).
Reproduction script: scripts/lead-strategy/review-sample-plans.cjs.

| Lead | Business | Product fit | Data support / coverage | Usable excerpts | Readiness |
| --- | --- | --- | --- | --- | --- |
| 167 | Fiaz Dental Care | 40 | 25 / 25% | 0 | 0 |
| 445 | Islamabad Dental Clinic | 20 | Unknown / 0% | 0 | 0 |
| 446 | Luminosity Dental Clinic | 60 | Unknown / 0% | 0 | 0 |
| 447 | The Dental Care Clinic ( Dr.Shahnawaz Ahmed) | 60 | Unknown / 0% | 0 | 0 |
| 449 | Zia Dental Consultants | 100 | 25 / 25% | 6 | 0 |

Scores describe the sample campaign rules and evidence coverage. They are not
conversion probabilities. Lead 167 was blocked by the location rule; lead 445
by its recorded category. The latter's business name looks relevant, illustrating
why category-based mismatches need review rather than automatic deletion. We did
not change those records or override their checks.

## What worked

- All five generated complete plans without validation errors.
- Emails were concise and used a single question as the call to action.
- Follow-ups progressed from introduction to product benefit to close-the-loop.
- The generated text did not assert revenue, bookings, an existing relationship,
  or an unobserved problem with the recipient's website.
- Unknown evidence stayed unknown. All channels remained blocked; high product
  fit did not authorize sending. No matched LinkedIn person or verified selected
  email was supplied for these plans.

## Quality gaps found

1. **No source personalization in any message.** AI was disabled, and the
   deterministic fallback used the company name but ignored source excerpts.
   Lead 449 had six website excerpts, including Dental implants and Clear aligners,
   yet received the same pitch as the others. Four leads had no usable excerpts,
   so inventing personalization for them would be inappropriate.
2. **All five initial emails omitted opt-out instructions.** The workflow correctly
   raised a warning, but did not fix the generated default text. Follow-ups included
   `Reply STOP to opt out.` This text is only a draft instruction; an actual
   opt-out processor must exist before any sender uses it.
3. **LinkedIn and call drafts reused the same generic wording.** A calling brief
   existed, but the message was not a conversational opening with sender identity
   and a permission check. LinkedIn lacked a named matched recipient.
4. **Multi-channel configuration did not create a multi-channel sequence.** All
   three scheduled steps used email, which is the existing primary-channel default.
   LinkedIn and calling were alternate drafts, not fallback execution steps.
5. **No live AI quality conclusion is possible.** These were template fallback
   outputs, not outputs from GPT-OSS 120B. The model remains disabled.

## Representative initial email (actual generated output)

Subject: Clinic website demonstration for Zia Dental Consultants

> Hello Zia Dental Consultants,
>
> We build mobile-friendly clinic websites with clear service pages.
>
> Would you like to see a sample website?
>
> Alex (sample sender)
> Example Web Studio (sample)

## Recommended corrections before a sending integration

- Make the non-AI fallback optionally select a short, current excerpt through
  the customer-defined offer-fit rules, retaining its evidence ID and source.
  Keep exact customer templates unchanged and label missing evidence honestly.
- Add opt-out wording to system-generated email defaults and ensure all relevant
  drafts are checked consistently; do not imply an unsubscribe handler is connected.
- Give calling its own opening and branch guidance. Keep unavailable channels
  clearly labelled as blocked alternatives instead of implying they are scheduled.
- After those changes, repeat this same benchmark and compare actual text.
- Separately run a small explicitly capped live AI test before claiming AI draft
  quality. No request budget was enabled as part of this review.

This review changed only the review script and local artifacts, not workflow
nodes, schema, database records, provider budgets or sending settings.

## Correction pass — 2026-10-11

The initial results above are preserved as the baseline. The subsequent runtime
and generated 06C correction pass produced
[STRATEGY_SAMPLE_PLANS_AFTER.json](STRATEGY_SAMPLE_PLANS_AFTER.json).

- Missing opt-out wording in initial generated emails: 5 before, 0 after.
- Initial emails with source personalization: 0 before, 1 after. Lead 449 now
  quotes `Cosmetic dentistry` from its existing website evidence and retains the
  evidence ID. The four leads without supported excerpts remain unpersonalized.
- All five calling openings identify the sender and ask for the appropriate
  recipient. The calling brief separately asks permission to continue and supplies
  interested/busy/wrong-person/opt-out/unknown-question branches.
- Non-sequence channels are labelled blocked alternatives, not scheduled outreach.
- Scores, readiness blockers, and sending authorization did not change. All five
  remain blocked. No live AI request was made and no outreach was sent.

Local regression checks compare the five before/after artifacts. Additional
runtime tests cover stale/conflicting evidence exclusion and exact customer
template preservation. Exact templates without opt-out instructions are warned
about, not silently rewritten. These changes do not implement opt-out processing,
Retell, or channel execution.

Example corrected opening for lead 449:

> Hello Zia Dental Consultants,
>
> Your website lists: “Cosmetic dentistry”.
>
> We build mobile-friendly clinic websites with clear service pages.
>
> Would you like to see a sample website?

The generated email then includes the sample sender signature and opt-out wording.
This is evidence-based template personalization, not demonstrated live AI quality.

Deployment validation: corrected 06C imported and live nodes/connections matched
the tested file. Isolated n8n execution and HTTP tests passed, as did live
non-mutating endpoint checks. No provider calls were needed for this correction.
