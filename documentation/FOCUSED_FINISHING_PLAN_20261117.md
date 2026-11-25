# Focused finishing priorities

17 November 2026. Monthly billing is the user's preference; no host or purchase is
selected. This review used current source and the acceptance records. It did not
run paid providers, repeat accepted live tests or change runtime configuration.

## Preserve completed work

Discovery sources and combined search, guarded strategy generation, versioned
approval, spending/suppression checks and uncertain-write recovery already exist.
Connected-Gmail initial/follow-up/reply-stop acceptance is recorded. The shared
design, home page, themes, lead row interaction and responsive review are implemented.
Do not replace these systems or add another channel to finish the launch.

## Ranked work

Effort is a planning range for focused work, not a delivery guarantee. Scores use
(impact + risk) × (6 − effort), with effort 1–5. Launch requirements take precedence
over a higher convenience score.

| Priority | Work | Why it matters | Estimated effort | Score inputs / score |
| --- | --- | --- | --- | --- |
| Implemented locally, 17 November | Restart-safe Gmail onboarding | Migration 070 and the production gateway now use encrypted database-backed OAuth state, atomic single-use claims, persistent credential ownership and completion reconciliation. Unknown exchanges remain locked; no automatic exchange replay. See GMAIL_DURABLE_ONBOARDING_20261117.md. | Complete locally; include state key in deployment secret/recovery setup | Verified with focused checks and isolated PostgreSQL restart/race checks |
| Before public launch | Portable deployment and recovery | Package the gateway and channel services alongside the existing containers; pin tested images, inject secrets, configure exact public hosts/HTTPS callbacks, keep DB/n8n internal, and add off-server encrypted backups, restore instructions and health monitoring. Current Docker Compose alone is not the deployed runtime. | About 1 day, with host/domain setup separate | 5, 5, 3 / 30 |
| Implemented locally, 17 November | Guided campaign review | PlanReview currently mounts email automation, calling setup, Calendar, sender/policy and batch panels together. Present a short sequence: configure → prepare → review → approve/start. Surface only relevant channel controls and put technical diagnostics/history under details. Retain all existing backend authority and acknowledgements. | 0.5–1 day | 5, 3, 2 / 32 |
| Implemented locally, 17 November | New-workspace setup checklist | Guide a new organization from connected provider/sender to first search and first campaign, using existing readiness reads. Links should navigate, never silently start paid work. Existing business lookup already avoids entering raw lead IDs and should be reused. | About 0.5 day | 4, 2, 2 / 24 |
| Next frontend/backend polish | Clear, actionable statuses | Outreach currently exposes several technical states side by side. Show one accurate user-facing summary with receipt/dispatch details expandable. Keep provider acceptance separate from delivery. Distinguish historical marked-active searches from current leased work before offering recovery; never blindly restart paid work or delete history. | 0.5–1 day; start with existing read models | 4, 3, 2 / 28 |
| Required only for channels launched | Finish bounded channel acceptance | SMS requires SIM balance/package and delivery/reply/STOP acceptance. Calling requires number/route/funding, organization-specific tool/Calendar provisioning and verified live final-cost coverage. SMTP/Yelp/Messenger walkthroughs remain conditional on launch scope. Existing fixtures are not proof of live delivery. | Resource dependent; calling billing adapter is separate implementation work | 5, 5, 3 / 30; externally gated |

## Commercial/provider prerequisites

- Finalize operator/support details and publish the privacy notice and complete
  commercial terms before public customer onboarding. The user agreed these details
  can be filled later; they are currently explicit pre-release placeholders.
- Resolve n8n commercial-license fit for the intended customer-account model.
- Configure production Google OAuth/domain settings. Automated customer WhatsApp
  onboarding still depends on Meta verification/review; manual WhatsApp remains a
  separate usable path. Hosting does not remove these requirements.
- Managed calling payments remain outside the currently available service; do not
  add a payment/wallet project merely to launch customer-owned resources.

## Suggested sequence

1. Frontend: guided campaign review, followed by new-workspace checklist and status
   wording, using the present APIs rather than inventing another workflow engine.
2. Backend: durable onboarding and deployment/recovery preparation, before exposing
   real customer connections publicly.
3. Run only acceptance checks needed for changed behavior or the specific channel
   being launched. Use the already accepted email path for an initial controlled
   pilot if other channels are still waiting for resources/approvals.

Save richer lead filters, CSV export, advanced reports and team-management UI for
later unless an actual first-customer requirement makes one necessary. Avoid a
framework rewrite, Kubernetes, additional queues or database tuning without a
measured need. Existing pagination, visibility-aware polling and tenant/approval
checks should not be reimplemented.

## Source evidence

- dashboard/src/pages/PlanReview.jsx: multiple channel/control sections are rendered
  together; status/metadata remain technical despite the new visual theme.
- dashboard/src/pages/LiveOutreach.jsx: status, dispatch, delivery and stored event
  times are separate raw-facing fields.
- scripts/dashboard/start-local-auth.cjs: production injects gmail-durable-store.cjs and durable bridge; process-local adapters remain for offline/injected callers.
- scripts/dashboard/http.cjs: current host/origin allowlist is local-only.
- docker-compose.yml and dashboard/Dockerfile: existing container setup requires a
  production configuration; separate Node processes are not represented by it.
- scripts/dashboard/data.cjs: overview active counts use recorded statuses, without
  claiming current worker liveness.
- documentation/BACKEND_HANDOFF_20261117.md and REMAINING_ACCEPTANCE_20261117.md:
  live channel/provisioning/settlement prerequisites remain explicit.

## Guided workspace update, 17 November

Campaign review now has Set up, Prepare a draft, Review content and Approve and start steps. Hidden sections remain mounted to preserve pending form state. Channel controls follow the current campaign version metadata; missing metadata retains the prior controls with a warning. Existing content approval, campaign scope, acknowledgements and backend gates remain mandatory. Technical draft details and manual email tools use disclosures.

Overview now includes a navigation-only setup checklist using existing scoped settings and campaign reads. Saved business/campaign milestones are distinguished from provider readiness. Failed reads show an unknown state. The public preview uses sample components only and cannot connect accounts or send.

Validation: 13 targeted frontend checks, 13 dashboard read-model checks, current-version channel shape checked read-only in PostgreSQL, optimized production build, and 40 browser layout checks across four widths in both themes (no page overflow or data/identity requests). Durable Gmail onboarding, deployment preparation and resource-dependent live channel acceptance remain outstanding.

## Gmail durability completed locally

Migration 070 was installed after a fresh database backup. The gateway was restarted with its existing email flags. Thirty focused Gmail checks and isolated PostgreSQL integration checks passed; the dashboard still serves HTTP 200. No real Google authorization or email was used. Unknown in-progress exchanges remain an operator reconciliation case and cannot silently retry. Deployment packaging, secure key/backup provisioning, public hosts and resource-dependent channel acceptance remain outstanding.

## Deployment foundations, 17 November

Added deployment/runtime.env.example, tested image digests, exact HTTPS host/origin configuration, secret-file database settings and minimal gateway health endpoints. Local fallback and read-only data pool behavior are preserved. Added authenticated-encryption backups covering the database, full n8n volume and runtime keys, with a separate backup key, encrypted manifest verification and a scratch-only restore drill. Forty-two focused checks passed. The local live/ready endpoints return 200.

Packaging remains incomplete: credential encryption/rotation and workflow provisioning still use Docker subprocesses, and several internal n8n addresses remain local-only. Replace those with a narrow internal adapter before building the full service release. No server was purchased, public release started, outgoing message sent or workflow executed by this work. See deployment/README.md for the remaining release sequence and recovery limits.

## Credential transport packaged, 17 November

Built and enabled a private credential adapter on the pinned n8n image. Gmail/SMTP encryption and rotation and fixed runtime-hash checks now delegate to it; configured failures never fall back to Docker. The service has read-only runtime access, no Docker socket/database/provider client, and no decrypt or command endpoint. Configurable internal n8n destinations now cover workflow APIs, gathering and Calendar checks. Forty-four focused checks, four synthetic n8n-format interoperability checks, zero-Docker gateway-wrapper checks, the release image build and private Compose validation passed.

Next: full gateway/service packaging and target state/secret mounts, production DB roles and HTTPS/callback settings. Optional automated WhatsApp sender inspection still needs transport work before enabling that feature in containers; manual WhatsApp is separate. Local convenience DB discovery still uses Docker only if explicit database settings are absent. No host purchase or public deployment has occurred.

## Core service bundle built, 17 November

Built gateway, guarded n8n and credential-adapter images; recorded their local image IDs. Added a combined Compose bundle with private database/n8n/credential services, loopback gateway access, persistent gateway journals and secret mounts, plus an optional SMS/calling overlay. No Docker socket is mounted. Staging rejects enabled gateway send workers and restored active workflows before n8n startup. Existing desktop launcher behavior is preserved.

Nine focused guard/configuration checks passed, as did isolated image import/frontend checks, unconfigured-start rejection and structural Compose checks. Images were tested without networks or secrets, not booted as a full restored stack. No working service was restarted or deployment performed. See deployment/RUNBOOK.md.

Next requires target decisions/configuration: monthly host/domain, protected configuration and database grants, restored separate volumes/journals, reviewed HTTPS/OAuth/callback settings, then a controlled staging boot. Production and remaining resource-dependent SMS/calling acceptance remain outstanding.

## Pre-hosting improvements and staging attempt, 17 November

Fixed Gmail client loading to validate the configured exact HTTPS callback instead of always requiring localhost. Foreign, insecure and modified callbacks remain rejected. The gateway image was rebuilt and its local image ID updated. Added bounded collection of sender/campaign operation journals to encrypted recovery backups, preserving uncertain records and locks. Focused callback/crypto/journal/capacity checks passed.

An isolated local staging launch was attempted with private networks, synthetic cloud credentials and new labeled volumes. Docker's WSL engine became unavailable while starting the new PostgreSQL container. The attempt ended before database restoration or application startup. Docker Desktop recovery completed; the working PostgreSQL, n8n, adapter and gateway returned healthy (gateway readiness HTTP 200). No full staging pass is claimed. The host has 4 GB RAM and measured free memory was below the new 1.5 GB parallel-staging requirement. Do not repeat the full parallel stack on this host without capacity. The next full staging boot remains on the selected VPS or a machine with sufficient free memory. Never-started staging resources were separately identified for removal; source data volumes were not targeted.

## Account setup usability completed locally

Fixed confirmed Gmail recovery remaining stuck in the pending view, guarded fresh consent behind server status checks, and preserved uncertain reconnect responses. Added browser-storage and organization-switch handling, shorter setup guidance and responsive action rows using the existing design. Seventeen focused checks, the optimized build and three actual view layout checks passed. The new frontend is installed locally; the final gateway image must be rebuilt after frontend freeze. No real provider actions were tested.

## Search contrast and offline target checks

Corrected the search-stage help panel: its fixed pale background now uses the shared themed surface and border. Body text contrast is 6.61:1 in dark mode and 7.39:1 in light mode. The optimized build is installed locally (main.c31dbfe9.css). A temporary screenshot write exposed a full C drive; only disposable test-browser profiles and obsolete duplicate build folders were removed. Application state, real profiles, backups and partner-preview files were retained. Larger staging/build work now checks disk headroom as well as memory.

Added target-preflight.cjs for offline secret-file, callback, volume, automation-flag and role-choice validation. Five focused checks passed, with no network requests or external actions. Full staging and public deployment remain unverified. Rebuild the final gateway image after frontend freeze on a machine with sufficient disk space.
