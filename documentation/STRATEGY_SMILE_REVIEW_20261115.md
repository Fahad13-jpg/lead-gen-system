# Smile Center draft and attempt history

User-started job 12 produced plan 11 in `ai_completed` state under the strict
provider schema, consuming 2,895 tokens. This confirms live provider acceptance
of the strict format. Plans 9 and 10 remain the prior failed attempts. The latest
draft is still weak fit and is not proof of marketing relevance or permission.
No outreach or automatic approval was performed.

The message quoted Dental Implants and then offered a website to a clinic that
already has one. The quotation was factual but unnecessary to the weak offer.
For future v2.9 generation, weak-fit output must be category-level with no
observed first-message parts; strict provider constraints and local semantic
validation both enforce this. With confirmed existing website presence and the
website_presence offer profile, the supplied greeting introduces the configured
sender and makes the offer conditional on considering an existing website update.
Approved offer text and campaign CTA remain unchanged; no defect or business
need is invented. No existing saved plan or approval hash was edited.

The review page now collapses an older failed plan when its loaded page also has
a newer completed draft for the same business and campaign version. Its summary
labels the earlier failed attempt and identifies the newer draft number. The
historical record remains accessible. A failure without a newer draft is still
shown in full. This is a presentation change, not a stored state change.

Twelve focused runtime checks and four page checks passed. The idle local n8n
runtime was updated while preserving settings, graph, credentials and activation;
no model requests were created. Runtime evidence is in
`.local/strategy-relevance-20261115/`; UI installation evidence is in
`.local/strategy-history-20261115/`.

After the user authorized continuing with one updated draft, job 13 generated
plan 12 successfully using v2.9, one attempt and 2,950 tokens. The actual message
uses the conditional existing-website-update greeting, the approved benefit and
CTA, sender and STOP text. It contains no incidental observation quote or
routine follow-ups. Fit remains weak and is explicitly flagged; this verifies
the constrained weak-fit drafting behavior, not business need, persuasive value
for every campaign or strong-fit strategy quality. The campaign sending policy
remains false and the new plan has no approval. Monthly usage is 8/10, leaving
two requests. No further model call or outreach is authorized by this checkpoint.
Evidence: `request.json`, `result-plan.json` and `acceptance.json` in the private
strategy-relevance directory.
