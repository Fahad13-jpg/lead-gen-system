# Follow-up checks — local only

Prompt strategy_v2.5 warns against assuming prior sending, delivery or viewing. It requests no routine follow-ups for weak-fit leads. Existing approval gates, budget and lease behavior remain unchanged.

Validation now rejects common English references to a demo/product link when the campaign lacks a CTA URL in the allowlist. The saved live response for lead 449 is a regression fixture: it passed v2.4 validation historically, but fails current validation with FOLLOWUP_ASSET_UNAVAILABLE. The original result is preserved.

Every accepted follow-up has deterministic review metadata requiring previous confirmed sending, no reply, no suppression and current channel readiness. Recognized asset-dependent intents additionally require that asset in the previous confirmed send. Weak-fit follow-ups require human review. checks_performed and execution_authorized are false. These are requirements for a future executor, not claims that event checks or a new approval mechanism have been implemented. A configured link does not prove it was sent or viewed.

Limits: the English phrase detector is deliberately narrow; arbitrary paraphrases and non-English assumptions are UNVERIFIED. Internal intent text must not be executed as outgoing copy. No unrestricted prose classifier or general proof of event prerequisites is claimed. Existing offline-only blocking remains in place. Weak-fit no-followup behavior is requested in the prompt and implemented in templates; an AI plan with a conditional weak-fit follow-up may still validate and carries the human-review requirement.

Tests: 64 cases across contract, adapter, quality and native suites passed, plus saved-response, scoped-schema and follow-up regression scripts. The new cases cover the actual defect, conditional intents, allowlisted assets, event requirements and no-followup plans. Native tests use Node VM; no n8n import, database migration, model call or send occurred. Updated two local Code-node bodies only; structure and settings preserved. Live performance of prompt v2.5 remains UNVERIFIED.
