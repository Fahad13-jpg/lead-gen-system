# Customer-defined email release candidate

Local candidate, 2026-10-22. Deployment and sending are separate approvals. No deployment commands in this document have been executed.

## Contents and prerequisites

The bundle contains migration 032 and complete inactive 06C, 07A and 09 workflows. JavaScript helpers are embedded in the Code nodes; no new external worker installation is needed for this change. Existing worker dependencies for other stages are unchanged. The manifest hashes every included file. Verify with `node scripts/organization-policy/customer-release.cjs verify <bundle-directory>` from the development repository.

This is an incremental release for an installation already at migrations through 031, not a fresh-install package. Before deployment inspect the target function definitions, workflow versions, runtime roles and existing release bindings. The October 19 scratch snapshot was tested; later live changes are UNVERIFIED. Confirm Code nodes can access crypto, URL and required environment variables. Do not print secrets or replace organization credentials.

## Deployment order — after approval

1. Export the exact current 06C, 07A and 09 workflows, including activation state, and back up PostgreSQL using the established backup procedure. Capture the existing `strategy_approval(jsonb)` definition and its grants for rollback. Verify the backup is readable before proceeding.
2. Record and pause these three schedules through n8n. Check active executions and outstanding email attempts. Reconcile uncertain attempts; never reset or replay them. Preserve current sender mappings and limits in a separately reviewed target configuration: this bundle deliberately has closed sender gates.
3. Apply only migration 032 with `psql -X -v ON_ERROR_STOP=1 -f database/migrations/032_customer_content_approval.sql` against the explicitly verified target database. Do not infer the target from a default connection. It replaces only the existing approval function and grants, adds no tables, and does not enable transport.
4. Import the three bundled workflows inactive, matching existing workflow identities. Check credentials, sticky notes, graph and SQL queries against the reviewed package. Do not replace unrelated stages.
5. Keep `CUSTOMER_EMAIL_TEMPLATES_ENABLED` unset/false initially. With `STRATEGY_CONTRACT_VERSION=strategy_v2`, customer drafts retain the integration blocker. After confirming 032 is installed, the server administrator may explicitly set `CUSTOMER_EMAIL_TEMPLATES_ENABLED=true` through the deployment configuration. Changing this setting may require an n8n container restart; that is part of the deployment approval, not an automatic action by the packager.
6. Enable only the planner for a reviewed draft test. The new switch allows NEW customer drafts to reach review; it does not alter old blocked plans, grant transport authority, enable Gmail, change verification requirements or allocate AI credits. Regenerate old drafts through the normal job flow rather than editing their bodies.
7. Review the exact subject, body, recipient and follow-ups. Approval requires the current database hash plus boolean `acknowledge_customer_content: true` and `acknowledge_customer_content_hash` equal to that same database hash. Customer claims remain unverified. Content approval still returns `execution_authorized: false`.
8. Sender binding, recipient eligibility, mailbox limits, transport release and schedule activation still use the existing separately reviewed email release process. Never directly edit a plan to bypass a failed gate. The included sender and mailbox entry gates remain closed until that process is completed. An owned-mailbox delivery test needs explicit sending approval and must use an eligible recipient under current rules; do not fabricate verification to run it.

## Post-apply checks

Read-only SQL checks (run on the verified target):

```sql
SELECT pg_get_functiondef('strategy_approval(jsonb)'::regprocedure);
SELECT has_function_privilege('n8n_user','strategy_approval(jsonb)','EXECUTE');
SELECT id, org_id, body->>'validation_profile' AS profile,
       body->>'execution_authorized' AS transport_release,
       body->'blocking_reasons' AS blockers,
       content_hash = md5(body::text) AS hash_matches
FROM strategy_plans
WHERE body->>'validation_profile'='customer_email_v1'
ORDER BY id DESC LIMIT 10;
```

Verify missing/wrong customer acknowledgement fails, revised content requires a new hash, and an unreleased plan cannot begin an attempt. Use the existing scratch harness for mutation tests; never substitute synthetic verification on live. Check no AI reservation is created by template generation. These workflows contain existing environment/credential references but no API secrets in the bundle.

## Rollback

Pause the three workflows and turn the customer flag off. Preserve all attempts, receipts, approvals and uncertainty records. Restore exact pre-import workflow exports and their reviewed activation states. Keep the stricter 032 approval function while any customer plans exist; restoring the previous weaker approval function requires first blocking customer processing and an explicit compatibility review. Do not roll back the whole database over subsequent outreach activity. Existing sender gates and prior plan releases are independent of the new draft-generation flag: turning that flag off alone is not an emergency stop for already approved/released plans.

## Evidence and limitations

Offline tests cover campaign input preservation, native node bundles, re-rendering after JSONB storage, tenant and recipient binding, approval hashes, release flags and unchanged email gates. Scratch dispatch rejected the actual unverified mailbox. A clearly synthetic verified context exercised reservation, one begin, mock receipt, delay and reply stop. No real delivery or provider verification was performed by these tests. Live import, runtime permission checks and owned-mailbox delivery remain UNVERIFIED.
