# Blind strategy review — unscored

Open `blind-review.html` without opening `blind-key.json`. Rate A and B separately. Current responses are **MOCKED**, with synthetic WhatsApp/call permission: this tests the contract and review format, not model quality. The JSON files also include plans with the actual blocked readiness gates.

Score each dimension 1–5; leave blank when not assessable:

| Dimension | 1 | 3 | 5 |
|---|---|---|---|
| Evidence fidelity | Invents a claim | Accurate but weakly relevant | Clearly supported and appropriately qualified |
| Offer relevance | Ignores qualifier | Broad category relevance | Explains the approved benefit's relevance without inventing need |
| Clarity and brevity | Confusing or long | Understandable | Concise, natural and one clear CTA |
| Personalization | Wrong business or invented detail | Honest category-level draft | Useful, current lead-specific evidence |
| Channel suitability | Wrong or blocked channel | Reasonable draft | Suitable length, permission language and opt-out |
| Follow-up/call usefulness | Pushy or unsupported | Generic but usable | Clear intents, permission and graceful stop/handoff |

Record: lead ID; A scores; B scores; preferred draft A/B/neither; factual corrections; would approve Y/N/unsure; reason. Do not reward fake specificity over honest uncertainty. Any unsupported claim, unscoped absence, forbidden URL, ignored suppression or invented benefit is a hard failure regardless of average score.

Only internal fit notes and follow-up intents allow free prose. Outgoing factual prose is deliberately bounded to exact supported quotations and approved benefits; judge that limitation explicitly. Non-English campaign drafts currently require reviewed localized copy; English fallback text with a language-review flag is not a finished translation.

Reproduction: `node scripts/lead-strategy/v2/render-review.cjs`. Optional `--responses path/to/responses.json` reads previously saved responses keyed by lead ID. This script never contacts a provider. Do not treat saved external responses as successful until local validation passes. Open the answer key only after recording ratings.
