# Deployment preparation

Status: the VPS at `leadmorrow.tech` is running the evaluation release in staging.
Production cutover and end-to-end provider checks are not complete. The VPS check
found all n8n workflows paused, so Apify setup, searches and campaign management
remain unavailable until reviewed workflow IDs are added to the staging allowlist.
See RUNBOOK.md for the controlled setup. Monthly billing is the chosen preference.
The existing root Compose file is a development setup and must not be used as the
production release.

## Ready now

- `images.lock.json` records immutable digests of the tested PostgreSQL and n8n
  images. No runtime image was changed.
- The gateway accepts a complete database connection through secret-file settings,
  without Docker inspection. Its read pool still enforces read-only transactions.
- `DASHBOARD_PUBLIC_ORIGIN` adds one exact HTTPS host/origin. No wildcard hosts,
  sibling domains or forwarded-host trust is introduced. The default local behavior
  is preserved. `runtime.env.example` contains no credentials.
- `/health/live` reports process availability. `/health/ready` checks the gateway's
  database connection. These return only an availability result, not provider
  readiness, secrets, counts or sending authorization.
- Encrypted backup creation and an isolated database restore drill are implemented
  in `scripts/operations`. See recovery instructions below.

## Runtime services to package

| Component | Present entry point | Exposure at release |
| --- | --- | --- |
| HTTPS reverse proxy | To configure after domain selection | Public 443; redirect 80 |
| Dashboard gateway + compiled React | `scripts/dashboard/start-local-auth.cjs`, port 3002 | Private; proxy serves this app |
| Credential adapter | `scripts/credential-adapter/server.cjs`, port 3013 | Private only; never proxy publicly |
| Database | PostgreSQL, current `postgres_db` | Private; no public database port |
| Workflow runtime | n8n, current port 5678 | Private; editor via authenticated administrative access |
| SMS, calling, automated WhatsApp | Deferred in the evaluation release; retained for a later version | No live routes or workers enabled |

Package these as a single versioned release. A static React host alone cannot run
the backend. The public design-preview tunnel is unrelated to production hosting.

## Remaining portability work

1. Credential encryption/rotation and SMTP/campaign runtime checks now use the
   tested internal adapter; its image and private Compose fragment are built and
   validated. Do not mount the Docker socket into the gateway. The optional automated
   WhatsApp sender inspector still uses the old container transport and must remain
   unavailable in the initial container release unless that adapter is completed.
   Manual WhatsApp copy/open does not use that inspector.
2. Internal workflow API, gathering and Calendar destinations now support the fixed
   private n8n origin. Configure external callbacks after domain selection, preserving
   exact destination allowlists and per-organization binding.
3. Gateway, guarded n8n and credential-adapter images are now built. The application
   Compose bundle and optional SMS/calling overlay are included. Restore the custom
   n8n volume and gateway journals, map protected keys/configuration and replace
   Windows/Downloads paths. The full stack has not yet been booted on a target.
4. Create target database roles/grants for the existing scoped registry functions.
   The example runtime user is a placeholder, not a role already provisioned.
5. Select the host/domain, configure HTTPS, Firebase/Google OAuth origins and
   callbacks, signed SMS/calling callbacks, and provider production requirements.

These are release blockers. This directory deliberately contains no command that
claims to deploy the incomplete runtime.

## Encrypted backup and recovery

Create a separate random 32-byte backup key and restrict its permissions. Keep a
secure copy separate from backup storage. Never commit it or include it in the
secret-file list. The local operator key is `.local/operations-backup.key`.

From the repository root:

```text
node scripts/operations/backup.cjs create KEY_FILE NEW_BACKUP_DIRECTORY
node scripts/operations/backup.cjs verify KEY_FILE BACKUP_DIRECTORY
node scripts/operations/restore-drill.cjs KEY_FILE BACKUP_DIRECTORY
```

The directory must be new; existing backups are never overwritten. Database dumps,
the full n8n persistent directory and the runtime secret bundle are streamed into
AES-256-GCM encryption. An encrypted manifest authenticates artifact contents and
the saved/missing file inventory. Required configured Gmail/SMS keys and the
Firebase credential must be present. Optional missing files are recorded; inspect
the encrypted inventory before declaring a release recovery set complete.

The directory contains a completion marker only after all artifacts pass integrity
checks. An INCOMPLETE directory must not be used for recovery. Backups currently
run on demand; off-server storage, retention and a host scheduler remain to be
configured when the deployment destination is selected.

The restore drill verifies all artifacts before decrypting the dump into a new
random `lead_restore_check_...` database. It checks core tables and then drops that
scratch database. n8n never connects to it, and the working database is never a
restore target. This checks database recovery; it does not boot restored services,
extract host secrets, or prove provider connectivity.

For a real recovery, start with a separate private destination and outbound traffic
blocked. Verify artifacts; restore the database and n8n archive; explicitly map
secret bundle entries to target secret mounts; restore the reviewed application
release. Replace source-machine paths. Keep workers/workflows and send permissions
paused until reconciled. Do not blindly retry uncertain OAuth exchanges, paid
scrapers, messages or calls from restored state. The n8n directory is copied online;
take a coordinated stopped/quiescent snapshot for the final cutover and archive
source/dependency versions alongside it.

Do not run the old interactive restore script against the working system to test a
backup. The new drill is intentionally limited to a separate database. No full
production-overwrite restore command is provided here.

## Release checks

- [ ] Internal adapter and service packaging complete; no public database/n8n port.
- [ ] Exact HTTPS hosts/callbacks configured; production account reviews resolved.
- [ ] Secret inventory mapped, backed up separately and absent from built assets.
- [ ] Restore drill succeeds from an off-server copy with the separate recovery key.
- [ ] Staging health and a controlled existing Gmail path verified with sending gates.
- [ ] Resource-dependent SMS/calling acceptance completed for channels being launched.
- [ ] Operator/support/privacy details and commercial requirements finalized.

Roll back the application release if authentication, org isolation or callback
binding fails. Pause new work first. Preserve durable OAuth claims, uncertainty
records and credential keys; restoring an older database over an active scheduler
can cause duplicate external actions and is not a routine rollback mechanism.

Adapter progress is recorded in documentation/CREDENTIAL_ADAPTER_20261117.md. The backup allowlist now includes its local token/config; take the final coordinated recovery snapshot after the full release configuration is frozen.

## Frontend build update (19 November 2026)

The dashboard uses Vite 8.3.8 and Node >=24.12.0. Run npm ci and npm run build from dashboard before assembling the gateway image. Docker continues to serve the compiled output. Follow documentation/VITE_MIGRATION_20261119.md for manifest compatibility, tests, runtime prerequisites and unresolved dependency findings. The legacy react-scripts dependency is retained only for tests and is not considered remediated.
