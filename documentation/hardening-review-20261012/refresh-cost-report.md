# Refresh cost report

Snapshot from isolated scratch copy, 12 October 2026 PKT. No providers called.

|Lead|Basic|Research|New LinkedIn company job|Provider execution now|
|---:|---|---|---|---|
|159|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|161|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|162|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|163|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|164|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|165|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|166|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|167|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|168|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|169|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|170|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|171|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|172|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|230|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|231|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|445|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|446|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|447|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|448|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|449|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|450|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|451|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|452|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|453|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|454|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|455|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|456|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|457|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|458|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|459|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|460|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|461|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|462|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|463|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|464|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|465|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|466|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|467|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|468|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|469|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|470|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|471|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|
|472|Requeued, $0 provider|Requeued, AI disabled|Eligible for enqueue; max 10 per advance|Blocked: platform wallet $0|

All 43 leads are eligible, organization 1, with existing basic/research tasks. Rollback-only calls to the actual claim function confirmed 43 basic + 43 research claims. Existing research tasks can be claimed even while their basic fingerprint is stale: the fresh-basic condition currently gates INSERT only, not claims of existing tasks. Do not run research concurrently with a basic-only rollout. No fix to that structural behavior was applied.

LinkedIn advance would enqueue up to 10 new company jobs per invocation, eventually 43 for the new fingerprint. It does not require a refreshed basic fingerprint before enqueueing. Employee/post follow-ons depend on future matched results and cannot be listed as certain tasks. The actual affected lead list is above.

Current budgets: enrichment AI disabled, monthly limit 0, monthly requests 0. LinkedIn enabled, global sublimit $0.50; used/reserved $0.0421. Its policy selects platform account 1 ($5 ceiling, $0.0421 spent). Organization 1 has no wallet entries: available customer credit $0. Its unrelated BYOK account is not selected by the LinkedIn policy. Therefore **incremental worst-case provider cost for these refreshes under the current snapshot is $0**, with all LinkedIn starts blocked by insufficient platform credits. Basic HTTP requests have no configured paid provider charge; infrastructure/egress charges are not measured.

If the wallet were funded later, current remaining LinkedIn sub-budget would be $0.4579, tighter than platform remaining $4.9579. Each start reserves $0.05: nine full-cap starts cost $0.45; actual lower settlements may allow more starts within $0.4579 total. All 43 company starts alone would request $2.15 before budget gates, excluding conditional descendants. Provider hard-cap enforcement and future prices are UNVERIFIED; these figures describe local reservations, not a billing guarantee.

Proposed staged rollout, approval required: (1) retain AI disabled, pause LinkedIn and research execution using existing controls/workflow controls; (2) refresh only basic, first benchmark leads then small batches; (3) review retained good data, failures and human labels; (4) run deterministic research against refreshed basics with AI still disabled; (5) separately approve any paid budget, wallet funding or provider enablement. No control, wallet or ledger changes made.
