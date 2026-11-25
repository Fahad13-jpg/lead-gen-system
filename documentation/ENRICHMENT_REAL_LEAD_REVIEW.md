# Real-lead AI research evaluation — 2026-10-05

Scope: saved public evidence for Techlio (159), Astoe (162) and EnDevSols (165).
The test used an explicitly hypothetical offer: a business website with service
pages and an enquiry form. This offer was not saved as a customer campaign.
These businesses were selected for evidence coverage, not because they are known
buyers. The sample contains software companies, not the target clinic segment.

Tests executed the generated 06B preparation and validation code against live Groq
responses. They did not change production leads, verify contacts or send outreach.
The native HTTP/database integration was tested separately in the isolated database.

## Confirmed findings and corrections

- HTML entities caused a false quote rejection: `&amp;` in website headings was
  quoted as `&` by the model. Website evidence now decodes standard/numeric HTML
  entities before deduplication and validation. Exact source checking is retained.
- The embedded whitespace regular expression had been over-escaped. It now embeds
  the tested shared function directly. A multiline regression test covers this.
- Prompt context now includes the known website URL and explicitly limits advice
  to the supplied offer. It asks the model not to invent competitor advantages,
  missing features or additional product capabilities.

## Human review observations

Astoe's accepted response quoted its published services and commercial terms
correctly. Its competitor-positioning suggestion had no supporting competitor
evidence. It also listed website existence as unknown despite a website source.
These findings prompted the context/prompt corrections above.

Techlio's corrected response passed source checks and identified the co-founder
as a co-founder/director, not a CEO. Its service organization angle was relevant.
However, one angle suggested a form feeding a sales pipeline and improving revenue
predictability. That integration and outcome were not part of the supplied offer.
Do not use that angle. Its presence shows prompt instructions and valid citations
do not prove all generated recommendations are supported.

The original EnDevSols response proposed a multilingual site, outside the offer;
that suggestion must not be used. Its HTML quote rejection was a formatting issue.
The corrected EnDevSols response passed the quote checks, recognized existing
service content and suggested asking about the enquiry form. It still proposed
an SEO audit, which was outside the supplied offer and must be rejected.

All three businesses ultimately produced source-valid responses; none was approved
as an unattended marketing strategy. Successful-response token usage across the
five completed calls was 8,262 tokens (including the two initially rejected
responses). An earlier Astoe attempt failed without a usable provider response;
its provider usage is unknown. No dollar charge is inferred from token counts.

## Release decision

Do not enable unattended research or auto-approved outreach on this evidence alone.
Keep generated interpretations draft-only and reviewable. Source-backed facts are
useful, but product-capability checking and evaluation on actual target clinics are
still needed before relaxing review. A matching quotation establishes attribution,
not independent truth or buyer intent. Local test artifacts are under
`.local/enrichment-ai/` and should not be committed or treated as production campaigns.

The normalization and prompt-context corrections were imported into native 06B
on 2026-10-05 after a workflow backup and idle restart. Local regression tests and
the live report/authentication/organization-scope API checks passed. Normal
enrichment was resumed; automatic AI remains off. Canary outputs remain local
review artifacts and were not inserted into production lead research records.
