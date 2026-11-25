# Strict response schema for native AI drafts

The next user-started Smile Center request (job 11, plan 10) failed with
`CHANNEL_NOT_PERMITTED,INVALID_STEP1`, consuming 2,197 tokens and one request.
Four monthly requests remain. No outgoing message or approval was created.
Raw execution content was not retained, so the precise generated channel or
null/empty first-message form cannot be reconstructed from this failed plan.

The native path previously sent `response_format:json_object`, with its scoped
schema only in the prompt. It now sends Groq's documented `json_schema` format
with `strict:true` for the existing `openai/gpt-oss-120b` model. The provider
schema is cloned per request, types enum nodes, requires every object property,
forbids extra properties, constrains fit to the computed verdict, requires a
nonempty channel plan and nonnull first message when a channel is available,
and prohibits routine follow-ups for weak fit. No-channel plans stay blocked.
Optional historical follow-up parts become required in newly generated output;
reading older plans is unchanged. Local full semantic validation remains in force.

Eleven focused checks plus fifteen bundled workflow checks passed without model
calls. These cover schema validation of valid drafts and rejection of wrong
channels, null first message, empty channel plan, fit overrides and weak-fit
follow-ups, as well as existing warning and approval boundaries. They do not
establish live provider acceptance or prose quality. A new user-started request
is needed for that acceptance; no automatic request, retry or allowance reset
was performed. Both failed plans remain unchanged.

Installation requires an idle queue and exact prior code parity, backs up the
workflow and updates only three embedded runtime bodies. Graph, credentials,
settings, activation and HTTP retry settings remain unchanged. Compose With Groq
already sends the complete prepared request, so it carries the new response
format without further transport changes. Evidence and rollback are under
`.local/strategy-structured-output-20261115/`.

Provider reference: https://console.groq.com/docs/structured-outputs
