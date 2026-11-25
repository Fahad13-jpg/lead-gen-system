# WhatsApp local installation proposal — 2026-11-06

Dashboard/publishing decision: continue with React, not Flutter. The user deferred public policy-page work until the React dashboard phase. See `DASHBOARD_DECISIONS.md`. Meta publishing and real inbound-event testing therefore remain pending; continue backend work without treating the dashboard-only sample as a verified lead reply.

This document is a proposal, not evidence of deployment. No campaign release, message or callback activation is authorized by installation alone.

## Installation result — 2026-11-06

User subsequently approved installation. Migration 046 applied; all six functions are owned by `n8n_user` and EXECUTE grants verified. New workflows `managedWhatsappCheck046`, `managedWhatsappSend046` and `managedWhatsappCallback046` were imported inactive. New custom files were installed additively; n8n restarted once. Existing workflow nodes/connections/activation states, campaign-version data, outreach activities, plan counts and AI-request counts matched the pre-install snapshot. No messages or callbacks were executed. Full backup and progress/verification records are in `.local/whatsapp-deployment-046-20261106`.

n8n `/healthz` returned 200 after restart. `/types/nodes.json` requires authentication (401), so HTTP node-registration verification remains UNVERIFIED; this response is not evidence that the custom nodes failed to load. The sender remains disabled/unbound. Public callback setup, network remediation and the owned-recipient send/reply test remain pending.

## Callback-only activation result

Subsequent installed hardening: the WhatsApp worker, executor and new `network.cjs` were backed up and installed, with one n8n restart. The resolver is request-scoped to Meta, IPv4-only, normal TLS verification retained, with bounded fallback to public DNS resolvers; no Docker-wide DNS setting was changed. n8n health returned 200 and the installed Meta resolver succeeded. Pre/post workflow and activity hashes matched, and the sender stayed inactive with `dispatchEnabled=false`. The acceptance-persistence fix is now installed. Local callback-configuration idempotence fix needs no runtime install. Offline suite: 68 passing tests. Provider message delivery is still not verified.

The user subsequently approved private environment loading, n8n recreation and callback-only activation for controlled testing. The callback workflow is active; sender/check schedules remain inactive and dispatch remains false. Pre/post snapshots confirmed unrelated workflow state and outreach data were preserved. Both custom-node modules were loaded directly inside the installed container successfully; UI node registration remains a separate check.

The existing container image and unrelated configured environment values were checked before recreation. Callback secrets remain under git-ignored `.local/whatsapp-callback`; no secrets were printed. Loopback-only proxy port 5690 exposes only `/whatsapp-meta` and forwards to the approved n8n path. Local live HTTP tests passed GET verification, hidden editor (404), rejected unsigned POST (401), and a signed empty event batch (200); no outreach record/message was created. Installed webhook source confirms raw body is provided as the expected binary base64 field.

Public HTTPS is **not working**: Cloudflare quick-tunnel provisioning timed out twice, including an IPv4/HTTP2 retry. No generated callback URL exists, no Meta registration occurred, and no real Meta events or outbound messages were tested. Never use `api.trycloudflare.com` (the control endpoint) as a callback URL. The local proxy remains available; the failed tunnel processes issued no usable public endpoint. A working HTTPS transport is the next blocker.

Subsequent update: the already installed ngrok client established an HTTPS endpoint with request inspection disabled, pointing only to loopback proxy 5690. The public verification challenge returned 200 with the exact challenge, editor root returned 404, unsigned POST returned 401, and a signed empty batch returned 200. All passed without message sending. The current temporary URL and sanitized checks are saved in `.local/whatsapp-callback/callback-test.json`; process IDs are local files. No Meta callback registration or real Meta events are verified yet. The URL is temporary and requires the computer, Docker, proxy and tunnel to remain running. Cloudflare failure is superseded as the immediate testing blocker; production DNS and stable production HTTPS are still separate unresolved items.

## Concrete installation scope

Source package: `.local/whatsapp-executor-package-20261106`. It contains the read-only sender-check node, managed dispatch node and their dependencies. Existing `ManagedSender.node.js` must remain intact. Copy only the two new node entry files and `lead-system/scripts/whatsapp/`; the WhatsApp package also contains `lead-system/scripts/lead-strategy/runtime.cjs`, so compare that shared file against the installed version before copying. If it differs, stop rather than overwrite email dependencies without review.

Migration: `database/migrations/046_whatsapp_foundation.sql`. Creates six WhatsApp functions, grants execution to `n8n_user`, and adds no tables. Existing function definitions and owners must be backed up if any names already exist. Take a fresh complete database backup before applying.

Workflow imports: generated `workflow.json` (manual account check), `dispatch-workflow.json` (one-minute schedule, inactive, dispatch false, org binding 0), and `workflows/09f_whatsapp_meta_callback.json` (inactive). Import as new workflows with new IDs, not replacements for existing working email/calling/strategy workflows. Do not import the modified 06C strategy source during this installation; strategy integration is a separate reviewed release.

One local n8n restart is needed to discover new custom nodes. Record the active workflow IDs before restart and compare afterward. Do not enable the WhatsApp scheduler or POST callback. Verify the UI loads and the custom node types are recognized. Retain the existing org-bound credential; no token export is required by the executor.

## Preconditions for sending — not fulfilled by installation

- Production container DNS remains unresolved. The successful diagnostic used a freshly resolved Windows address for one request while preserving TLS hostname checks. That workaround is not part of the sender. Diagnose/approve a separate network fix; do not hardcode Meta IPs.
- Explicit token expiry or a conservative operator rotation deadline is required in the worker binding; an identity check's freshness timestamp is not token expiry.
- Supply documented recipient opt-in, current account-bound approved marketing template content/variable mapping, a reviewed provider quote, organization limits and an expiring campaign release. Existing approved Jasper sample templates do not demonstrate the customer's actual offer.
- Create a fresh strategy artifact and approve its exact hash. Never mutate an approved plan to add WhatsApp sending.
- Current release supports Pakistan marketing-template recipients only; US marketing recipients and later sequence steps are blocked.
- Verify signed callback raw-body handling against the installed n8n version before a public endpoint is enabled.

## Callback preparation and unresolved storage decision

Approved path: `/webhook/whatsapp-meta`, GET verification and POST signed events. No second path is proposed. Configure the app secret privately and generate a separate random verify token (at least 32 characters). The source expects `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, and `WHATSAPP_CALLBACK_ENABLED`; nothing here writes those variables or opens a tunnel. The GET challenge alone must not be mistaken for a successful inbound persistence test.

Correlated campaign replies and statuses fit existing `outreach_activities.dispatch_metadata`. Standalone unmatched inbound messages cannot satisfy its existing plan/step constraints. The current adapter returns 503 for review. Do not publicly activate this callback until the operator chooses a reviewed storage/handling policy; do not relax constraints or manufacture a dummy plan. A general inbox needs separately authorized scope.

## Rollback / stop conditions

Stop if a custom node fails to load, any previous workflow changes activation state, shared runtime content differs unexpectedly, or SQL ownership/grants differ from the tested setup. Keep all WhatsApp schedules and release flags off. Restore any overwritten file from its pre-install copy; remove only the newly added WhatsApp node entry files, then restart n8n. Restore previous definitions of the six functions, or drop only the six newly created functions if there were none before. Preserve all unrelated migrations, data and custom nodes. Do not restore the whole database over subsequent legitimate work without separate approval.

After a real submission, rollback is not a resend mechanism: preserve activity IDs, provider receipts and uncertain reservations for reconciliation. Installation smoke tests must not call `/messages`.
# Current release checkpoint

See `WHATSAPP_RELEASE_STATUS.md` and the local release manifest before using the historical instructions below. Migrations 047–050 and the latest runtime are local/unapplied. Do not blindly reapply 046 or replace the already authorized callback activation state. Package creation does not deploy or authorize sending.

