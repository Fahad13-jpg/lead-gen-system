# Authorized live quality matrix — 14 October 2026

Three requests, no retries or repairs, each capped at 6,000 completion tokens. Windows-host HTTPS transport, historical saved evidence, sample campaign and synthetic WhatsApp/call permissions. Prompt tested: strategy_v2.5. No production writes, sending, migration, import or trial-ledger extension.

| Lead / case | Result | Time | Reported tokens |
|---|---|---|---|
| 167 / strong fit, no usable present facts | HTTP 200; rejected: missing thin_evidence flag and selected angle's benefit | 3.901 s | 2,020 prompt + 721 completion |
| 449 / weak fit with service evidence | HTTP 200; contract passed; supported quote and benefit; no follow-ups | 2.770 s | 2,037 prompt + 666 completion |
| 445 / unclear, thin evidence | HTTP 429, rate_limit_exceeded, type tokens; no strategy returned | 0.297 s | Unreported |

Known reported token total: 5,444. Third-request usage and monetary charges are UNVERIFIED, not assumed zero. This is one accepted plan out of three attempted requests, not a statistically established success rate.

Manual technical review: 449 preserves weak fit and uses an exact saved service heading without asserting need. It places the service quotation before the greeting, so copy flow is awkward. Supported personalization is not proof of persuasive copy. Human ratings remain unfilled. 167's output identifies evidence limitations internally but fails the explicit outgoing benefit/flag contract; it was not repaired or accepted. 445's substantive quality was not tested because the provider refused the request.

Local follow-up: provider and native paths now classify rate limits as PROVIDER_RATE_LIMITED, with no automatic retry or fallback. Prompt strategy_v2.6 explicitly requires the chosen angle's benefit in step 1 and thin_evidence whenever no present facts exist. Its live effectiveness is UNVERIFIED. Semantic checks were retained. The local 06C bundle was rebuilt without graph changes.

Tests: 64 cases in contract/adapter/quality/native suites, four standalone regressions (saved-response, scoped-schema, follow-up, live-matrix), and 56 acceptance scenarios passed. Tests overlap and must not be described as independent live trials. Original v2.5 results are preserved under .local/strategy-v2-quality-20261014-{167,449,445}; sanitized fixtures are in tests/lead-strategy/fixtures/quality-live-*.json.

Handoff observation: local 07a email and 08 follow-up workflows still contain their own preparation/sending flows and no strategy_v2 reference. The latest strategy metadata is not evidence that these executors enforce its requirements. Their full event/approval integration needs separate work before any sending; neither workflow was changed, run or activated during this task.

Release remains blocked on current-prompt live quality, human review, actual executor prerequisite integration and authorized deployment. No model allowance remains from this three-request approval.
