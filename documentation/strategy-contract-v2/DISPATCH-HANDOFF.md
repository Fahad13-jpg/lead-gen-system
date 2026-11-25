# Dispatch handoff — 14 October 2026

User approved adding dispatch metadata to the existing outreach_activities table as an exception to the earlier existing-JSON-only constraint. Migrations 018 and 019 were applied atomically to local Docker lead_db after a fresh backup. The deployment result is in dispatch-deployment.json; private backup is .local/dispatch-foundation-20261014/before.dump.

018 adds dispatch_metadata (object, default empty) and an org/plan/step unique index. Existing rows keep empty metadata. Identifiers require org scope and canonical positive-string plan/step values. Approved plan bodies and their hashes are never repurposed as dispatch state.

019 adds check, reserve and recheck functions for a first email only. They reject plan blockers/errors, absent or revoked approval, changed hashes/fingerprints, expired plans, suppression/replies/bounces, unsupported channels, unreviewed follow-up steps and unverified email. A valid reservation gets a five-minute lease and one activity identity. Duplicate reservation attempts stop. Expired, missing, mismatched or ambiguous reservation state requires reconciliation rather than automatic resend.

All functions return execution_authorized:false, including a successful reservation. The JS adapter is database-only, validates org/plan/database-MD5 identity, manually escapes SQL strings and exposes no transport. Do not connect this return value directly to Gmail/SMS/WhatsApp/Retell. No sender activation or release of v2_offline_only occurred. Current production plans cannot bypass their existing blockers.

Scope limits: this is a reservation foundation, not a functioning sender or delivery reconciler. It does not implement provider receipt recording, delivery callbacks, quota scheduling or cross-channel retries. Follow-up intents are not approved messages and step >1 is rejected. Phone/WhatsApp/SMS/LinkedIn/Retell permissions and transport remain unintegrated. The legacy 07/08 workflows remain untouched and inactive. Migration 016 and enrichment refresh are still separate pending work.

Tests passed in isolated scratch under a non-superuser runtime role: metadata constraints, legacy defaults, duplicate identity, distinct step, malformed JSON, org requirement; then plan/approval/hash/fingerprint gates, revocation, replies, missing verification, malformed IDs, reservation duplication, lease/reconciliation behavior and offline blocker retention. The latter suite explicitly stubs strategy_context within a rolled-back transaction; it is not a live end-to-end send or concurrent-load test. The actual strategy-context function was restored by rollback. JS tests passed identity/lease validation, escaping and preventing implicit send authority.

Live checks confirmed activity row count, plan hashes, AI ledger counts and sender states unchanged; nonexistent-plan check returned blocked and role execution permission was present. No real dispatches, provider calls or sends occurred. Actual delivery remains UNVERIFIED.

Rollback must first confirm that no activity has nonempty dispatch_metadata. If dispatch records exist, preserve them and reconcile before changing schema. With none, functions/index/constraint/column can be removed in a reviewed transaction; do not restore the entire database automatically. A fresh backup is retained. No rollback has been executed in production.
