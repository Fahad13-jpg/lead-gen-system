# Internal credential adapter

Implemented and enabled locally on 17 November 2026. The gateway now delegates
credential encryption, Gmail/SMTP password rotation and fixed installed-runtime
hash checks to an authenticated internal service. Existing credentials, account
ownership, Google identity pins, TLS policy, version checks, journals and execution
gates are preserved. There is no decrypt API, command API, workflow activation,
database access, provider client, arbitrary file lookup or Docker socket.

## Components

- `scripts/credential-adapter/server.cjs`: four fixed POST routes, token comparison,
  bounded bodies, bounded concurrency, safe errors and no request-body logging.
- `operations.cjs`: the same n8n Cipher format and credential rotation rules. Only
  ciphertext and fixed-profile hashes leave the service. The Google identity pin
  is retained outside refreshed OAuth token data.
- `scripts/dashboard/credential-adapter-client.cjs`: allows only loopback or the
  fixed private service name on port 3013; rejects redirects and arbitrary hosts.
  Configured adapter failure never falls back to a Docker command.
- `n8n-runtime-check.cjs`: compares approved installed-file hashes against release
  source. A mismatch prevents workflow setup; it does not reinstall files.

The adapter reuses the tested n8n image and reads its existing key/config and custom
runtime through a read-only volume. It does not start n8n itself. The gateway does
not receive the n8n encryption key or decrypted credentials. Preserve the original
n8n key on the deployment destination; a different key cannot decrypt old records.

## Local operation

Container: `lead_credential_adapter`, port bound only to `127.0.0.1:3013`.
The host token is `.local/credential-adapter/token`; it is excluded from source
control and restricted to the operator and SYSTEM. Local configuration is
`.local/credential-adapter/gateway.json`. The container restarts unless stopped,
uses a read-only root filesystem, has all capabilities dropped, no new privileges,
and bounded CPU, memory and process count. It does not restart the n8n container.

Without adapter configuration, explicit local/offline adapters retain the previous
Docker implementation for compatibility. With configuration, unavailable or bad
adapter setup fails closed. The production deployment must configure this adapter
and complete database settings; the local database discovery fallback still uses
Docker inspection only when explicit database settings are absent.

For a deliberate rollback of this local change, pause enrollment and campaign
setup, retain the token/config, and remove adapter configuration only as part of a
reviewed switch to the prior local transport. Never silently fall back after an
unknown operation result. Existing credential IDs and ciphertext need no migration.

## Deployment artifacts

`deployment/credential-adapter.Dockerfile` pins the tested n8n digest. Its dedicated
ignore file limits build context to adapter source, excluding local secrets and
backups. Image `leadgen-credential-adapter:20261117` built locally with only a
7.41 kB context. Record the resulting image in the eventual full release registry.

`deployment/compose.credential-adapter.yml` is an internal-only service fragment
with no published ports. The eventual gateway must join `credentials_private` and
mount the same token as a secret. The adapter must never be added to public proxy
routes. Host-side Compose variables are shown separately in
`adapter.compose.env.example`; container settings are in `runtime.env.example`.

Internal n8n calls now use `N8N_INTERNAL_ORIGIN`, accepting only fixed loopback or
`http://n8n:5678`. Workflow API calls, gathering calls and Calendar checks retain
their fixed paths, private headers, timeouts, no-redirect rules and existing gates.

## Verification

Focused checks covered authentication, unavailable/decrypt/exec routes, malformed
or oversized bodies, safe errors, destination restrictions, Gmail identity and
SMTP TLS invariants, and existing onboarding/reconnect behavior. The installed
n8n runtime successfully decrypted four synthetic adapter outputs. Actual gateway
wrappers completed with Docker spawning blocked, and both installed runtime
profiles matched the current source. No real credential or sender row was changed,
and no provider action or outreach was triggered by these checks.

Remaining deployment work: full gateway/service images and state/config mounts,
production database roles, HTTPS/callback configuration, target host/domain and
off-server recovery setup. The private service fragment alone is not the complete
application deployment.
