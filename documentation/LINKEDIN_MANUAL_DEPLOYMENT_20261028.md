# Inactive LinkedIn deployment — 2026-10-28

User authorized migration application and n8n import, explicitly keeping the
feature inactive. Deployment completed and readback verified on 2026-10-28.

| Component | Verified state |
|---|---|
| PostgreSQL migration 045 | Applied transactionally to `postgres_db` / `lead_db` |
| Four outreach_linkedin_* functions | Exact bodies verified, PUBLIC access revoked, n8n_user access verified |
| 7B - LinkedIn Outreach Helper | Updated in place, ID SYZYgAbCrJSbVCwa, **inactive** |
| 6C - Campaign Outreach Strategy Planner | Updated in place, ID 27W04lgTGdgFMWUx, **inactive** |
| LINKEDIN_MANUAL_ENABLED | Off; environment unchanged |
| Helper organization binding | 0; intentionally disabled |
| Existing graphs and notes | Preserved; corrective helper note retained |
| n8n restart / new tables / new webhooks | None |
| Model calls / Apify runs / messages sent | Zero |

A fresh full custom-format database backup was taken before migration and checked
with pg_restore --list. It is stored in ignored
`.local/linkedin-manual-deployment-20261028/before.dump`. That directory also holds
the original workflow snapshots, imported files, applied SQL, rollback functions,
backup checksum, progress and sanitized verification report. Treat the backup and
original workflows as private; do not publish them.

Verification compared snapshots of plans, campaigns, approvals, activities,
AI controls/requests, strategy controls and every other workflow definition and
activation state. All matched. Both imported workflows' nodes, connections,
settings and inactive states matched the reviewed release. Read-only SQL smoke
checks passed for the LinkedIn gate and queue. No task was prepared on live data.

The isolated scratch SQL lifecycle test passed immediately before deployment and
rolled back. The development regression run passed 130 Node test entries. This
does not claim a live UI, authenticated Flutter integration, clipboard operation,
or a LinkedIn-side action was tested.

Earlier workflow notes describing migration 045 as local/unapplied are retained
as development history. This deployment record and the database readback supersede
that status wording; their bug explanations and operating restrictions remain.

Next release prerequisites: choose the organization and valid member mapping,
integrate verified dashboard authentication, review campaign configuration and
templates, then explicitly approve activation. Do not activate the shared strategy
generator simply to view this inactive helper. Existing AI budgets and approval
gates remain mandatory.

Rollback, if requested: keep both workflows inactive, import the saved original
workflows into the same project and IDs, and verify other workflows remain
unchanged. Function removal is optional; first check dependencies and absence of
new LinkedIn activities, then review and apply rollback-functions.sql. Do not
restore the entire backup over newer business data for routine rollback.

Read-only deployment verification:

```
node scripts/linkedin-manual/deploy.cjs verify
```

The snapshot comparison intentionally flags legitimate later business changes;
inspect differences rather than restoring old data to make the check pass.
