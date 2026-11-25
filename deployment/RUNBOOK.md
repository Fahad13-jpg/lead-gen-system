# Core release bundle

Built locally on 17 November 2026. No hosting purchase or public deployment has
occurred. The bundle is ready for target configuration and a controlled staging
boot; it is not evidence that a production cutover has passed.

## Included

| Component | Image or configuration |
| --- | --- |
| Dashboard gateway and tested React build | `leadgen-gateway:20261117` |
| n8n with staging startup guard | `leadgen-n8n:20261117` |
| Internal credential service | `leadgen-credential-adapter:20261117` |
| PostgreSQL | Tested immutable digest in `images.lock.json` |
| Service wiring | `compose.application.yml` |
| Optional SMS/calling account mounts | `compose.channels.yml` |

The database, workflow runtime and credential service have no published ports. Only
the gateway is bound to host loopback on port 3002. The SMS overlay adds a loopback
callback listener on 3012. A target HTTPS proxy and its reviewed public paths must
be configured before public use. Never expose n8n's editor or database publicly.

All application services require the explicit `application` profile. The default
Compose selection includes only PostgreSQL, allowing database restoration before
any workflow runtime is started. Required secret paths are still validated during
configuration processing; this does not create the files or volumes.

## Prepare the target

1. Choose the monthly VPS and domain. Keep production and staging distinct.
2. Save the reviewed application source, built images and `images.lock.json` as one
   release. The images reuse the already tested n8n base, not an untested upgrade.
3. Restore into **new target** PostgreSQL/n8n volumes. Do not point the bundle at
   volumes currently used by the development system. The encrypted recovery set
   includes the n8n key and custom runtime; preserve their original values.
4. Provision the reviewed gateway database role and password. `lead_dashboard` in
   the template is a placeholder, not a role this bundle silently creates. Verify
   its required table/function privileges against the current migrations. Refresh
   restored n8n Postgres credentials if the target host, role or password changes.
5. Copy `application.compose.env.example` to a protected target environment file.
   Replace domains and host-side secret paths. Keep all automation switches false
   for staging. `providers.env.example` lists supported optional provider settings;
   actual values belong only in the protected target file.
6. Use `gmail-config.example.json` as the target Gmail path template. Its OAuth
   client file points to `/run/secrets/gmail-oauth-client`, not a Windows Downloads
   path. Set the exact application origin/callback in Firebase and Google Cloud.
7. The encrypted backup tool now also includes these journal directories and preserves uncertainty locks. Migrate the gateway's protected operation journals from
   `.local/smtp-provisioning` and `.local/campaign-slices` into the gateway state
   volume. Preserve uncertain operation records and locks for reconciliation;
   never delete them merely to force a retry. Mount account keys separately as
   secrets. Do not copy temporary browser-test authorizations as active resources.

No actual secret belongs in an image, build argument, repository environment
template, frontend asset or public document. Retain the separate backup recovery
key off-server and validate an encrypted recovery copy before cutover.

## Offline configuration check

Before creating services, run:

```text
node scripts/operations/target-preflight.cjs TARGET_ENV
```

This checks required files, key formats, exact Gmail callback/container-path
agreement, example domains, separate target volumes, staging automation switches
and the production gateway role choice. Output contains field names and issue
codes, not secret values. It makes no network requests and creates no resources.
A pass validates offline configuration only: database grants, DNS, Google/Meta
settings, key usability and actual provider readiness still need target checks.

## Staging sequence

For a parallel local stack, first run `node scripts/operations/staging-capacity.cjs`. It requires at least 1.5 GB free memory beyond the working desktop/services and 2 GB free disk space. Do not launch a second stack when this check fails; use the separate VPS staging destination instead.

Run from the repository root on the **target**, using a completed protected target
environment file. These are operator instructions, not commands already run against
your current system:

```text
docker compose --env-file TARGET_ENV -f deployment/compose.application.yml config --quiet
docker compose --env-file TARGET_ENV -f deployment/compose.application.yml build
docker compose --env-file TARGET_ENV -f deployment/compose.application.yml up -d postgres
```

Restore the reviewed database and n8n archive into the separate target volumes.
The restore step pauses workflows in the cloned database. Staging starts with every
workflow blocked unless its exact n8n ID is listed in
`STAGING_APPROVED_WORKFLOW_IDS`. Keep this list empty by default. Add only IDs that
have been reviewed for the evaluation tasks; do not include email sending, SMS,
calling or automated WhatsApp workflows. The startup guard refuses any active
workflow that is not on the list. An empty/unprepared database also fails closed.

Before adding an ID, inspect its name and activation state with a read-only query:

```text
SELECT id,name,active FROM workflow_entity
WHERE name IN (
  '1 - Connect Apify',
  '2 - Main Orchestrator',
  '3 - Google Maps Scraper',
  '3B - Facebook Pages Scraper',
  '4 - Data Cleaning',
  '6A - Evidence Based Business Enrichment',
  '6C - Campaign Outreach Strategy Planner'
)
ORDER BY name;
```

Keep `ENABLE_APPROVED_AUTOMATION=false` in staging. The allowlist does not activate
workflows; activate only the reviewed IDs through the n8n operator interface or
CLI after checking the `scraping_jobs` and `strategy_jobs` queues. `2 - Main
Orchestrator` can resume queued provider work, and `6C` can process pending draft
requests. The allowlist is checked on n8n startup, so unapproved active workflows
will prevent a restart. Add Yellow Pages or Yelp scraper IDs only if those sources
are part of the current test.

After target restoration, roles, secrets and staging workflow review:

```text
docker compose --env-file TARGET_ENV -f deployment/compose.application.yml --profile application up -d
```

Verify `/health/live` and `/health/ready` through loopback and the intended HTTPS
proxy. Inspect startup diagnostics without printing secret files. Check sign-in,
organization isolation and read-only data first. Health reports process/database
availability; it does not claim that every provider or channel is ready.

Gateway container startup rejects staging with email renewal, batch starting or
SMS workers enabled. SMS workers are disabled by default in containers. The local
desktop launcher retains its existing behavior. Existing approval, scope, lease,
quota, suppression and channel checks still apply after explicit production enablement.

## Channel coverage

Core packaging covers discovery, strategy/campaign controls, Gmail/SMTP backend
code and manual channel actions. Their real provider configuration and acceptance
remain necessary. The optional overlay supplies existing SMS/calling keys and
configuration; it does not buy a number, add SIM balance or authorize outreach.
Review public signed callback routes before exposing them.

Automated customer WhatsApp onboarding/inspection remains held for Meta setup and
its remaining inspection transport. The container rejects that Docker-dependent
inspection path; manual copy/open WhatsApp remains separate. No Docker CLI or
Docker socket is needed by the configured gateway.

## Release and rollback

Production requires a completed staging boot, final HTTPS/callback settings,
reviewed database grants, provider prerequisites, current acceptance for launched
channels and operator/support/privacy details. `DEPLOYMENT_STAGE=production` alone
does not bypass n8n's active-workflow guard: active workflows also require explicit
`ENABLE_APPROVED_AUTOMATION=true`. Enable only reviewed workflows and preserve all
existing consent/content/scope checks. Do not treat the environment switch as
recipient or campaign authorization.

Before cutover, take a coordinated recovery snapshot with workers quiescent,
including the gateway journal volume. Rehearse recovery on a separate destination.
Do not use the scratch-only restore drill as a production-overwrite tool.

If sign-in, organization scoping, callback binding or credential access fails,
pause new work and revert application images while retaining state/keys. Do not
restore an old database over running workers or replay uncertain provider writes.
