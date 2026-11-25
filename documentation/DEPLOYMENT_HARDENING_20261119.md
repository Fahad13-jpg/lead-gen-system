# Deployment hardening progress

19 November 2026

## Completed in this pass

- Gateway sends CSP `frame-ancestors 'none'; object-src 'none'; base-uri 'self'`, legacy frame denial, and disables unused camera/geolocation permissions. Existing Firebase popup-compatible opener policy is preserved. This is a limited CSP baseline, not a complete script-source/XSS policy; final provider origins must be checked before introducing a strict source allowlist.
- Only content-hashed JS/CSS under `/static/` gets one-year immutable caching. Unversioned assets keep short caching, JSON manifests require revalidation, and HTML/API responses remain no-store. Static responses include byte length and HEAD omits content. Retain previous hashed assets when installing releases so existing tabs can load their chunks.
- Unsupported methods return 405 with the allowed method list.
- Local dashboard logs use Docker local driver, 10 MB per file, three rotated files. The prepared production application and web services have the same bounded logging configuration. Logs may contain provider metadata; disk caps do not replace redaction or access controls.
- Prepared gateway/n8n stop grace is 60 seconds; n8n has a 45-second graceful shutdown timeout. Existing leases, pending-operation receipts and uncertainty handling are retained; forced termination must never trigger blind retries of paid requests or sends.
- Local dashboard was recreated alone. Live readiness 200, authenticated API without token 401, header/cache/method checks passed. 42 gateway tests and 7 metadata/HTTP tests passed. Both Compose configurations validate. No provider sends, calls, migrations or public deployment were performed.

## Existing controls retained

Workspace authorization and package checks, exact-origin/host checks, bounded request bodies and request timeouts, health endpoints, non-root application images, read-only filesystems, restricted capabilities, private production database/credential networks, encrypted backup creation and a scratch database restore drill already exist. See deployment/README.md and deployment/RUNBOOK.md for recovery limitations. A database-only drill does not prove full-service recovery.

## Required on the final hosting server

1. Configure HTTPS and exact OAuth callback/domain registrations; expose 80/443 only for the application and restrict administrative SSH. Keep database, n8n editor and credential-adapter ports private. Use SSH keys and provider/account MFA; install security updates.
2. Freeze reviewed release/image versions and run a current dependency/image vulnerability assessment. Resolve exploitable runtime findings; do not blindly upgrade packages or apply forced dependency fixes.
3. Take a coordinated encrypted backup of database, workflow state, journals and secrets. Store an off-host copy and protect the recovery key separately. Schedule recurring backups on the host, define retention, and test an isolated full-service restore with all outreach disabled before calling recovery complete.
4. Configure external uptime/readiness monitoring plus alerts for low disk, database failures, repeated job failures, backup failures and provider uncertainty. Do not put API keys, recipient content or sensitive query strings in alerts/logs. Set thresholds from the purchased server's actual resources.
5. Test the real-domain sign-in/connect-account flow, cross-workspace access denial and one controlled channel acceptance case before enabling live automation. Review runtime resource limits against the purchased RAM/CPU.
6. Record the previous image/configuration and compatible database state for rollback. Pause new admissions on repeated 5xx, failed sign-in, incorrect tenant access or uncertain provider actions; reconcile in-flight work before restarting. Do not overwrite a live database with an older snapshot as an automatic rollback.
7. Complete legal/operator details and privacy retention decisions. Keep indexing and analytics off until final domain and account configuration are reviewed.

## References

- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/base-uri
- https://docs.docker.com/engine/logging/drivers/local/

Dependency review update (19 November 2026): run scripts/operations/check-dependency-reports.cjs with fresh backend and frontend reports before a release. Current frontend high findings require remediation or documented reachability review; see documentation/DEPENDENCY_SECURITY_20261119.md. This is an operator check, not an automated deployment lock.
