# Email release preparation — 19 October 2026

**Superseded deployment status:** the user subsequently approved the inactive release and it completed. See EMAIL-DEPLOYED-20261019.md and email-release-deployment-20261019.json. The preparation details below remain historical; sending is still disabled.

This is a review bundle, not a deployment or sending authorization. A read-only live check confirmed the migration-020 lifecycle function exists and the migration-021 window function does not. This boundary check is not a full comparison of every historical function definition. Do not rerun old deploy-email-lifecycle.cjs or deploy-email-schedule.cjs against this release: they assume six test cases, the former Gmail sendTo parameter and a different migration boundary.

## Bundle

`node scripts/lead-strategy/v2/email-release.cjs pack .local/email-release-20261019`

Includes migrations 021–030 in order and complete inactive workflows 07A and 09. It checks explicit Code modes, zero-row preservation, disabled entry gates and blocked sending, then records SHA-256 hashes. It refuses overwrites. No credentials, database contents or other stage workflows are copied. Credential references already in workflow JSON remain references, not exported tokens.

`node scripts/lead-strategy/v2/email-release.cjs verify .local/email-release-20261019`

Verification rejects changed file bytes, changed manifests, missing migrations and opened gates. A hash confirms package consistency, not independent security review or database compatibility.

## Required deployment sequence (not executed)

1. Inspect live function definitions/owners, runtime roles and workflow IDs; compare with the historical migration-020 baseline. Stop if the baseline differs. Identify concurrent jobs and writers before choosing a pause window.
2. Obtain a fresh PostgreSQL backup and workflow exports, then restore that backup into an isolated scratch database. Rehearse the complete 021–030 sequence there as the intended deployment role. Recheck execution privileges as the actual runtime role. Prior scratch tests validate individual functionality; they do not replace this fresh full-sequence rehearsal.
3. Keep 07A and 09 inactive, preserve all current activation states, and pause affected scheduling during the reviewed change. Apply 021–030 in order only after preflight review. These files commit individually; this is not an all-or-nothing deployment transaction.
4. Import the matching 07A/09 JSON only after SQL checks succeed. Preserve workflow identities, credential references, sticky notes, leases, plan hashes and approval records. Do not import unrelated stages or run old rollback scripts.
5. Verify exact node/connection contents, inactive status, closed entry/transport gates, runtime privileges and unchanged activity/ledger counts. Keep the AI allowance at zero. No provider call is part of this check.
6. Sender verification, approved limits and activation are a separate release. One explicit organization/mailbox/credential binding per workflow instance remains required. Operator recovery (030) is restricted; do not grant it to PUBLIC or expose it as customer SQL.

## Stop and rollback criteria

Stop on a baseline mismatch, permission failure, altered gates, unexpected activation, changed approval hashes or unexpected activity/ledger writes. Keep affected workflows inactive. Record the last migration committed; never blindly replay or drop functions. For a pre-send failure, restore only the saved workflow definitions and reviewed previous function definitions. Preserve activity, checkpoint and stop-event data. If any attempted, accepted or ambiguous sends exist, reconcile them before rollback; never reset their counters or leases to resend. Full database restore is not an automatic rollback method.

## Fresh rehearsal completed

On 19 October 2026, a new read-only pg_dump of lead_db was restored into scratch_email_release_20261019 in the network-isolated lead_diag_pg_20261011 container. All ten bundled migrations applied in order as email_release_owner_20261019, a non-superuser that owns the restored objects. The lifecycle fixture passed and rolled back. Reply-finish, contact-gate and operator-recovery execution privileges passed as that owner. See email-release-rehearsal.json. The fresh private backup remains under .local/email-release-rehearsal-20261019; never publish it.

The actual live n8n_user role is a superuser. The rehearsal deliberately used a non-superuser owner to expose privilege assumptions; it does not demonstrate least-privilege grants for a separate non-owner runtime role. Operator recovery remains owner-only unless an explicitly reviewed grant is added. No role changes were made live.

## Outstanding

Fresh backup restore and full-sequence rehearsal are complete. The read-only live preflight also passed: all five outreach function bodies match migrations 019/020 (normalized line endings and outer whitespace), no unexpected outreach functions were found, both target workflows are inactive, all existing sticky notes and credential references are preserved, no executions were running and the AI allowance remains zero. This compares function bodies and owners, not every PostgreSQL function attribute or schema object. Evidence: email-live-preflight.json. Recheck immediately before deployment because live state can change.

Authenticated Gmail compatibility, sender ownership and deployment approval remain outstanding. The user confirmed organization 1, mohmmadfahad53408@gmail.com, 10 emails per day, 10 per rolling 24 hours and a 300-second minimum interval. The resulting local draft is .local/email-sender-review-20261019.json, with enabled=false and execution_authorized=false. Confirmation of limits is not proof of credential ownership or authorization to send. No live migration, import, activation, OAuth access or sending occurred while building this package.

The concrete inactive deployment scope is migrations 021–030 plus workflow 07A (gTjsUEP8VLlxKfWf) and 09 (TrgeZrs4ILZnrXuJ), retaining closed entry and transport gates. It excludes unrelated workflows, sender-policy activation, credential changes, provider tests and sending. Gmail verification can follow this inactive deployment before any activation is considered.
