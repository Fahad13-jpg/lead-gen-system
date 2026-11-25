# Dashboard authentication foundation

Local development, 2026-11-07. The initial foundation made no database changes. The explicitly approved owner membership added later is recorded below; no schema migration, workflow import or sender activation accompanied it.

## Choice

The user approved Firebase if it has a free option. Use Firebase Authentication on Spark for Google sign-in and email/password, within Firebase's no-cost usage limits. No phone auth, billing upgrade, Firestore or hosted Cloud Function is required by this design. Official pricing: https://firebase.google.com/pricing . Limits: https://firebase.google.com/docs/auth/limits . Never promise unlimited usage.

## Implemented locally

- Firebase Web SDK adapter: Google sign-in, password sign-in/signup, email verification, password reset and sign-out. Session persistence uses Firebase's browser-session storage; the app does not store its own bearer token or password.
- Google sign-in identifies the dashboard customer only. It does not grant Gmail/Calendar sending or reading access and does not replace the separate sender/provider connection and approval flows.
- Firebase SDK 13.2.0 is pinned. Its dependencies require Node >=24.12; the dashboard's isolated build stage uses Node 24. The n8n/worker runtime and Windows Node installation are unchanged. Use the Docker build for this dependency set rather than the older host Node runtime.
- Removed the legacy `lg_user` login bypass and default organization/user fallback. A failed request cannot create an authenticated session.
- Identity confirmation is separate from organization membership. The browser requests `/dashboard-api/session` using a Firebase ID token; only a validated response can unlock a listed organization. Multiple organizations require selection.
- API client uses the trusted gateway path, fresh SDK tokens and org_id. Organization switches/sign-out invalidate pending requests/responses; server-side membership validation is mandatory on every endpoint.
- Shared production shell follows the selected TailAdmin-inspired design. All six authenticated data sections show explicit integration-pending screens until their API contracts are audited; legacy source files are retained for subsequent integration.
- Private backend identity service contract expects Firebase Admin `verifyIdToken(token, true)` and an authoritative membership loader. It preserves the SHA-256 issuer + NUL + subject convention used by sender connections.
- The pure identity service remains independent of HTTP/database implementation. A local-only wrapper now serves static dashboard files and `GET /dashboard-api/session` on loopback port 3002. It uses Firebase Admin revocation checking and a read-only membership SELECT. Its `principal` port can be supplied to existing WhatsApp onboarding after that connection's wiring is implemented and tested. No memberships are auto-created.

## Not yet connected / UNVERIFIED

- The user created project `lead-gen-system-fad55`, reports enabling Google/Email-Password and authorizing localhost, and supplied the web-app configuration. It is saved in ignored `dashboard/.env.local`; the source control ignore rules now explicitly cover `.env.*` while preserving `.env.example`. The configured static preview boots the Firebase SDK and enables sign-in controls. Real Google login, provider settings, verification/reset email delivery and password-policy behavior are UNVERIFIED.
- The local same-origin auth gateway is implemented and listening only at `http://localhost:3002`. It is not a new n8n webhook or a cloud deployment. It allows authenticated session reads only; data/action/internal-webhook routes are unavailable. Sender connector integration, production HTTP deployment and production credential/role provisioning remain pending. Session JSON validation in the browser is not authentication.
- Membership loading joins existing `org_sender_memberships` to active `organizations` and returns `org_id, subject, name, role, active, organization_active`. Read-only schema inspection confirmed `organizations.org_name`. The actual SELECT and effective read permissions were tested with an unregistered diagnostic subject and returned no memberships. No email/domain-based or default-org enrollment is allowed.
- The local wrapper reads the existing Docker database connection metadata in memory and forces `default_transaction_read_only=on`. It does not copy the database password into React or the repository. A dedicated production database role remains to be provisioned before cloud release; this operator-only local adapter is not the production connection design.
- Existing workflow 10 has historical user_id documentation and legacy query contracts. Do not expose it directly to customers or treat it as the trusted gateway. Audit each endpoint's org scope and semantics before forwarding data.
- Existing legacy Overview still contains inferred pipeline percentages and attempt-based metrics; it must be replaced with accurate backend counts before real organization access is enabled. Search cost/time previews and other legacy data screens also require contract review. The current foundation does not certify these screens production-ready.
- The Docker dashboard at port 3000 is unchanged until separately rebuilt/released. Local source changes and the isolated preview are not deployment of secure authentication.

## Firebase setup (operator)

1. Open https://console.firebase.google.com/ . Create a project (or use an existing project in your Google Cloud account). Keep Spark; Analytics is optional and unnecessary here.
2. Authentication → Get started → Sign-in method. Enable Email/Password and Google. Supply your support email when Google asks.
3. Authentication → Settings → Authorized domains. Add `localhost` if absent. Later add the actual production hostname; do not authorize temporary untrusted domains.
4. Project settings → General → Your apps → Web (`</>`). Register the dashboard web app; Firebase Hosting is unnecessary.
5. Copy the **web app config** fields `apiKey, authDomain, projectId, appId` into a local `dashboard/.env.local` following `.env.example`. Do not put Firebase Admin JSON/private keys in React or the chat.
6. For Docker builds, pass those four public `REACT_APP_FIREBASE_*` values as build arguments. `.env*` files are excluded from Docker context. No configured value means login remains disabled.
7. Backend integration requires a pinned project ID and server-only Firebase Admin credentials or approved workload credentials. Authenticate first, then explicitly map the resulting subject to an existing organization through the established membership process. No default org 1.

## HTTP contract and access requirements

`GET /dashboard-api/session`: Bearer ID token; verified/revocation-checked Firebase identity; verified email; authoritative active memberships. Response has `identity_verified: true, email_verified: true, subject: <64 hex>, organizations: [{org_id,name,role,active:true}]`. No password, provider key or raw token is returned. Use no-store responses and redact credentials from logs.

Every subsequent endpoint must verify the token and requested org_id against current membership and org status again. Apply owner/admin restrictions to account management. Never forward arbitrary paths, SQL, credential references or caller-supplied roles into internal n8n APIs. No dashboard integration secret belongs in the browser. Add request/body limits, same-origin CORS and abuse controls before exposing the gateway. Do not enable mutation routes or sender actions as part of a login smoke test.

Local wrapper safeguards: loopback binding, fixed Host/Origin checks, no mutation methods, aggregate request rate and concurrency limits, header/request timeouts, redacted errors, no-store JSON responses and a fixed static-file root. Timed-out identity checks retain their concurrency slot until the provider operation settles. No raw request or token logging is implemented.

## Local integrated preview

`node scripts/dashboard/start-local-auth.cjs` starts the operator preview at `http://localhost:3002/login`. Its default credential path is the user-approved `Downloads/firebase-admin.json`, outside the React source/build context. `DASHBOARD_FIREBASE_CREDENTIAL` can supply an operator-approved alternative path. No private credential contents are printed.

`node scripts/dashboard/start-local-auth.cjs --check-credential` makes one read-only Firebase user-list request, suppresses the returned records and reports only credential-check status. This check passed for the supplied project. It does not create an account or send an email.

The local listener currently runs in the tool-managed development process; restart it with the command above after ending that process or rebooting. No scheduled task, cloud deployment, production container replacement or firewall change was made. Existing port-3001 static preview remains separate; use port 3002 for integrated auth testing.

## Validation

Offline identity tests use injected, explicitly trusted verification and membership mocks. They test revoked/expired/wrong-project/unverified identities, membership revocation, inactive organizations, cross-organization access, duplicate records and rejection of legacy browser session data. They do not prove Firebase Admin integration or cryptographic verification in a deployed gateway.

Validation completed locally:
- 21 offline tests passed, including token-refresh/logout races and discarding responses from an earlier organization.
- Optimized production compilation passed using the bundled Windows Node 24.22.1 runtime. The disposable Docker build was stopped because dependency reads across the Windows bind mount were slow; it did not change production services.
- Auth UI browser checks passed at desktop and 390px: forged legacy storage rejected, protected routes redirected, disabled unconfigured auth methods, signup/reset navigation, no page overflow and no auth/backend/provider requests.
- The existing design preview's interaction/regression checks passed after these changes.
- The tested static build was copied only into `lead_dashboard_preview` at port 3001 for review, including `/login`. The reusable preview image still contains the earlier build until it is rebuilt; the original port-3000 dashboard was not replaced.
- At that earlier checkpoint, real sign-in, email delivery and gateway/database integration had not been verified; the subsequent checks below record the newer state.
- After public web configuration was supplied, `check-firebase-config-ui.cjs` passed: configured SDK boot, enabled sign-in controls, rejected legacy browser session, zero sign-in attempts, account creations, sent emails and backend requests. The updated configured build is served only in the isolated port-3001 preview. The earlier unconfigured UI test remains applicable to builds without Firebase configuration.

Subsequent integrated checks supersede the earlier unmounted status:
- 30 offline identity, HTTP denial, cross-tenant request and query tests passed.
- The supplied service account was accepted by Firebase in a read-only credential check; user records were not displayed.
- The actual local PostgreSQL membership query passed under a read-only session. No organization/membership records or schema were changed.
- Local HTTP probes returned 401 for missing/invalid tokens and 503 for unconnected data/internal-webhook routes, with no-store responses.
- Configured login browser boot checks passed at port 3002 without a sign-in, account creation, email send or organization request.
- The frontend compilation passed after retaining integration-pending screens in place of the legacy inferred data views.
- A real customer Google/password sign-in, actual-user membership resolution, email verification/reset delivery, sender onboarding integration and cloud operation remain UNVERIFIED. The next step is a user-controlled Google sign-in at port 3002, followed by explicit enrollment only if needed and authorized.

## Access-screen bundling correction

The first real sign-in attempt displayed `Unable to confirm access`. A confirmed frontend defect was found: react-scripts emitted the imported `session.cjs` helper as a `static/media/session.*.cjs` asset. Its default import was therefore a URL rather than the session-validator object. Earlier boot tests did not exercise the signed-in response path and missed this defect.

Renamed the browser helper to `session.js` and corrected its import and Node test path. The optimized build now contains executable validation code and no `.cjs` assets. `check-auth-bundle.cjs` guards that build output. Four AuthProvider regression tests pass for a valid unassigned identity, valid single membership, malformed response and sign-out during a pending lookup; the 30 existing offline tests also pass. The running port-3002 gateway was checked to serve the new hashed bundle. No membership or permission changes were made. Actual-user retry is still needed to confirm the complete live sign-in path.

## Approved initial owner enrollment

The user's subsequent screenshot showed `Organization access needed`, confirming that the real signed-in identity reached a successful verified session with no active membership. Read-only inspection found the verified Firebase account `mohmmadfahad53408@gmail.com` and active organization 1, `Demo Company`. The user explicitly approved linking that exact account as organization owner.

`enroll-approved-owner.cjs` verified the Firebase account again, pinned project/organization/name, captured the prior row in an ignored `.local/dashboard-auth/approved-owner-*.json` audit file and committed the single owner membership in a transaction. The prior membership for this subject was absent. Post-commit readback through the actual membership loader confirmed active owner access. No other memberships, organization policies, budgets, sender records, workflows or outreach activation were changed. The running authentication service remains read-only; the grant was performed by a separate, narrowly scoped operator script, never a customer HTTP endpoint.

The user must refresh the access page to load the newly approved membership. The authenticated data screens still show integration-pending messages until their backend contracts are connected and checked.
