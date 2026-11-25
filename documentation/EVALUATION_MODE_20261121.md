# Evaluation channel scope

Enabled on 21 November 2026 at the user's request. No tables, customer rows, credentials, campaign plans or channel source files were deleted.

## Available in evaluation

Email, manual WhatsApp, manual LinkedIn and manual Messenger. Manual messages are reviewed and sent by the user in the destination service. Messenger still uses its own campaign.

## Deferred to Version 2

Calling, SMS and automated WhatsApp. Their source files remain in their original folders so imports, migrations and history are preserved. Settings hides Retell and SMS setup. Campaign channel choices omit calling/SMS. Campaign review omits their setup/release components. Package summary and sidebar do not invite Plus activation. A help icon explains Version 2.

`dashboard/src/release.json` is the shared switch. `evaluationMode: true` masks deferred permissions in gateway package snapshots, blocks direct deferred-channel dashboard routes, and prevents the local SMS sending worker from starting. The local Compose file mounts the switch and package service. No database package downgrade was used.

Current workflow readback: outbound SMS and WhatsApp executor exports installed in n8n were inactive, and no SMS connection was ready. Retell tool and Meta callback workflows were active; those are retained for receiving/reconciling existing events and are not a new outbound campaign authority. This switch does not rewrite external provider accounts or turn off inbound callbacks.

## Files changed for this scope

- `dashboard/src/release.json`
- `dashboard/src/components/EvaluationChannels.jsx`
- `dashboard/src/components/PackageAccess.jsx`
- `dashboard/src/components/ConnectionOverview.jsx`
- `dashboard/src/components/WorkspaceFrame.jsx`
- `dashboard/src/pages/LiveSettings.jsx`
- `dashboard/src/pages/PlanReview.jsx`
- `dashboard/src/pages/Home.jsx`
- `dashboard/src/pages/Faq.jsx`
- `scripts/dashboard/package-access.cjs`
- `scripts/dashboard/http.cjs`
- `scripts/dashboard/start-local-auth.cjs`
- `docker-compose.yml`
- `tests/dashboard/package-access.cjs`

## Restore after evaluation

1. Review real SMS/calling/Meta acceptance prerequisites before offering those channels.
2. Set `evaluationMode` to false in `dashboard/src/release.json`.
3. Rebuild the dashboard with Node 24.12 or later: run `node scripts/build.cjs` from `dashboard`.
4. Recreate only the dashboard service: `docker compose up -d --no-deps --force-recreate dashboard`.
5. Review Home/FAQ copy and restore the Plus sidebar link through the switch. Home/FAQ currently explain the evaluation scope; update them when the actual Version 2 release is ready.
6. Recheck saved provider credentials, phone heartbeat, campaign versions, package access, approval and funding. Do not activate or replay old jobs simply because the interface is visible again.

Restoring visibility does not grant credits, approve a recipient or activate an n8n workflow. Existing channel code and saved data are available to continue development.

## Verification

## Source review handoff

Eight dedicated channel workflow source exports have now been moved out of `workflows/` into `releases/version2-archive-2026-11-21/files/workflows/`. The archive contains checksums, original paths and a guarded restore script. Run `node releases/version2-archive-2026-11-21/restore.cjs` to copy them back. This move does not remove or alter installed n8n workflows. Shared workflow exports and backend runtime modules remain to preserve the available channels.

`releases/evaluation-source-2026-11-21.zip` is a filtered source-review snapshot. It omits dedicated calling/SMS components and worker folders plus selected automated WhatsApp workflows. `EXCLUDED_VERSION_2_FILES.txt` records the omissions. Shared backend contracts remain because strategy, email, manual WhatsApp and historical event handling import them. This ZIP is not a standalone runnable backend release.

The active `LiveSettings.jsx` and `PlanReview.jsx` no longer import the calling/SMS setup/release components. Restore copies of those two pages are in `releases/version2-frontend-restore-2026-11-21/`. Restore them before setting evaluationMode false when Version 2 is ready. No source module or customer data was deleted from the full repository.

Production frontend build passed. Five focused package/access tests passed. Local dashboard was recreated to load the shared switch. No paid request, AI generation, SMS or call was started.
