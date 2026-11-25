# Stored-contact eligibility review — 2026-10-22

Read-only investigation found a compatibility bug in migration 033, not four missing email sources. Discovery appends evidence on conflict but preserves a contact's original `existing_record` method. Eligibility incorrectly required a newer top-level method and equal evidence method.

Migration 034 evaluates the supported evidence method instead. A source-record proof must identify this lead's org-scoped cleaning link, pass contact_eligible, and match the original staging email. Existing-record labels alone do not qualify. Published website/Facebook proofs still require their recorded source URL. All status, relevance, age, format and business-conflict checks remain in place. Missing selected email now returns email_missing rather than email_identity_changed.

Four real stored contacts qualify for basic mode under the corrected check: leads 165, 170, 171 and 172. Their original staging email matches their selected email and their cleaning link is eligible. Raw actor email fields were absent; this review corroborates the stored staging fields and recorded discovery evidence, not a new live scrape. They remain pending/unverified, with unknown deliverability. No mailbox existence or DNS check was performed.

Other cases remain blocked:

- 159: selected address is marked for review; another same-domain candidate exists. No automatic primary-address replacement performed.
- 162: conflicting phone evidence requires review; placeholder email stays excluded from eligibility.
- 168: category/name mismatch needs review; finding a Facebook email does not resolve it.
- 463: departmental/different-domain email requires review.
- 230/231: placeholder test addresses remain blocked.

Scratch command: `node scripts/diagnostics/customer-strategy-scratch.cjs --review-gate --latest-email --dispatch --basic-policy --legacy-evidence`.

Passed: four benchmark legacy evidence cases; strict policy rejection; evidence removal; missing source link; another lead's source link; review-state rejection; missing-email reason; existing malformed evidence, tenant, format, risk and age checks; complete mock dispatch lifecycle. SQL changes rolled back. Positive dispatch uses simulated contact evidence and receipts, never actual sending.

Deployment script backs up local PostgreSQL and the exact old function, verifies baseline before replacement, compares contact/lead/activity/workflow snapshots afterwards, and records live eligibility counts in `documentation/strategy-contract-v2/email-evidence-034-deployment.json` upon success. No workflow import, activation, contact promotion, plan approval or provider call is part of this correction.

Email eligibility alone is not campaign suitability or permission to send. The existing clinic campaign must not be treated as a suitable pitch for these non-clinic leads. A relevant reviewed campaign and transport release remain necessary. Live delivery under the new basic policy is UNVERIFIED.
