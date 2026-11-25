# Application-computed review warnings

The user-started Smile Center request (job 10, plan 9) finished with
`MISSING_QUALITY_FLAG:offer_relevance_unproven`. It consumed one allowance unit
and 2,408 tokens; five monthly requests remained. Its failed record is retained.

Native response assembly now handles a narrowly defined metadata omission: when
strict validation reports only missing `weak_offer_fit`, `fit_not_established`
or `offer_relevance_unproven` warnings, the application appends those computed
warnings and validates the complete result again. The model's outgoing text,
fit, references, channel plan and follow-ups are not edited. Schema errors or any
additional semantic error still fail. Added warnings have hash-bound provenance
under `generation.application_review_flags`; content approval remains required
and execution remains unauthorized.

The validator itself is unchanged and continues rejecting missing warnings.
Nine focused offline tests passed, including unchanged content, provenance/hash,
invalid content, weak-fit follow-ups, draft-release boundaries and bundled code.
The workflow installer allows only this exact native runtime difference in its
three embedded code nodes, requires an idle queue and preserves routing,
credentials, settings and active status. Installation and rollback evidence are
in `.local/strategy-warning-20261115/`. No model request, plan, approval or
outreach is created by installation. A real corrected-output acceptance request
is still a separate user action; this fix alone does not establish draft quality.
