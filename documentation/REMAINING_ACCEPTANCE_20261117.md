# Remaining acceptance — 17 November 2026

This is the current short checklist. Historical documents describe earlier stages;
their old quota proposals and pending-phone notes do not override this status.

General backend improvements are implemented; see `BACKEND_HANDOFF_20261117.md`
for the concrete changes and the integration gaps that remain before production.

| Area | Current evidence | Remaining action |
| --- | --- | --- |
| Email / connected Gmail | Owned-recipient initial email, follow-up in the same thread, reply persistence and stopping the next message passed | Production OAuth configuration/review; SMTP acceptance remains unverified if offered at launch |
| Discovery | Google Maps, Yellow Pages, contact-rich Facebook and US-only Yelp sources implemented; Facebook live contact extraction passed | Yelp live result/contact/cost test remains; no repeated paid search needed for already accepted sources |
| Strategy | Versioned, evidence-bound drafts and approval implemented; successful generation recorded, old failures retained | Do not consume more AI allowance without a specific necessary quality test |
| Manual channels | WhatsApp, LinkedIn and Facebook copy/open flows implemented | Messenger AI-generation/browser walkthrough remains deferred by the user; no automatic cold social DMs are claimed |
| SMS | Physical phone/SIM 1 saved; real signed heartbeat received through approved temporary HTTPS ingress | Balance/package, then one separately approved owned-recipient send, delivery and reply/STOP test |
| Calling agent | Reviewed published prompt/tools, approved brief handoff, opt-out/outcome and Calendar paths implemented; prior browser opt-out/booking acceptance recorded | Stable public tool endpoint, number/route/funding and one separately approved live call |
| Calling cost settlement | SQL final settlement and normalized multi-provider receipt validation implemented | Live provider billing adapter / evidence of final complete costs; current settlement wrapper deliberately remains mock-only |
| Automated WhatsApp | Integration and manual alternative exist | Business/domain verification, Meta review and customer-onboarding/delivery acceptance |
| Managed calling | Resource mode defined; unavailable in product | Prepaid payment/wallet integration and verified settlement before offering this service |
| Dashboard | Shared redesign, home page, themes and responsive review implemented | Simplify campaign/outreach flow and new-workspace onboarding; see FOCUSED_FINISHING_PLAN_20261117.md |

## Calling checkpoint verified in this pass

- Saved organization 1 Retell account exists; no calling number is saved.
- No real call activities exist for organization 1.
- Transport config remains `enabled:false`, `org_id:null`; tool attestations remain empty.
- The final-settlement SQL function is installed. It must not be confused with a
  verified live billing adapter: `scripts/calling/settlement.cjs` still refuses live mode.
- Thirty-one focused existing checks passed for brief handoff, tenant/account
  isolation, bound tool requests, single-attempt transport and normalized settlement.
  These are local fixture checks, not proof of telephone delivery or live billing.
- No call, paid provider/model request, number purchase or channel enablement occurred.

## Work order

1. SMS owned-recipient acceptance when the sending SIM has balance/package.
2. Calling: once a number/route is chosen, verify its billing coverage and implement
   the matching final-cost adapter. Preserve the current reservation until complete
   provider costs are verified; do not assume the Retell line item covers an
   independently billed carrier. Then perform the bounded live call acceptance.
3. Finish any launch-required SMTP / Messenger walkthrough that remains in scope.
4. At deployment, replace temporary ingress, configure production OAuth/Meta setup,
   service supervision and backups. Shared dashboard redesign is implemented; remaining usability work is ranked in FOCUSED_FINISHING_PLAN_20261117.md.

No extra channel, tier system, broad audit or repeated paid acceptance run is
required by this checklist. External prerequisites remain visible rather than
being treated as completed work.
