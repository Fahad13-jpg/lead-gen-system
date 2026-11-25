# V2 preview parity

The existing Build Preview node now uses the same compact brief builder, qualifier, campaign-gap reporting and channel readiness as v2 job processing when STRATEGY_CONTRACT_VERSION=strategy_v2. No nodes, webhooks or tables were added. The v1 branch remains available when opt-in is absent.

For an AI campaign, the response explicitly returns plan:null, ai_generated:false and provider_requests:0. template_example is labelled as a deterministic example, not an AI response or fallback plan. For a template campaign, plan contains an unsaved template_completed draft. Both responses have preview_only:true and execution_authorized:false. Neither creates a reservation, job, approval or database plan. Do not submit a preview's local hash as a database approval hash.

Preview responses also expose brief, qualification, campaign_gaps and token_estimate. Estimates remain approximate; a preview does not prove sufficient provider quota or model output quality. Invalid/hybrid mode returns a 400 response; upstream errors retain their status. Actual readiness continues to block unavailable channels. No synthetic readiness is used by the deployed node.

Validation: five benchmark parity cases plus error/hybrid, no-channel and legacy compatibility tests passed; nine native tests and 56 acceptance scenarios passed. The actual isolated n8n runtime passed six generation cases and six corresponding preview cases with networking disabled. These are not live model tests.

Deployment follows the existing user authorization for the draft-only rollout. See preview-deployment.json for the recorded outcome after import, restart, exact workflow comparison and non-mutating API smoke checks. This update supersedes the legacy-preview limitation in DEPLOYMENT-20261014.md only after that deployment record exists. Migration 016 and executor integration remain pending.

Targeted workflow rollback, if needed after checking active work: node scripts/diagnostics/deploy-strategy-preview.cjs rollback. The private previous workflow/control snapshot is in .local/strategy-preview-deployment-20261014. No migration is applied by this update or rollback.
