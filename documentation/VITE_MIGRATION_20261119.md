# Vite frontend build migration

19 November 2026

## Installed result

The dashboard now builds with pinned Vite 8.3.8. Docker remains the runtime. Existing database, n8n and credential services were preserved; only the dashboard gateway was restarted for the hashed-asset cache update. Installed bundle: main.78df914a.js with static/assets/index.eab47e14.css. Old hashed assets remain available for existing tabs.

A supported Node 24.22.1 executable already existed in the Codex runtime and was used for verification. The unnecessary project-local Node download was cancelled. No global Node installation was replaced. Builds require Node >=24.12.0; npm run build now stops clearly on older Node versions.

## Changes

- Production build and local development use Vite. react-scripts 5.0.1 is retained as a development-only legacy test runner; its vulnerability findings remain open.
- Entry files are src/index.jsx and src/App.jsx. Root index.html is the Vite entry; public/index.html remains a legacy/static fallback.
- Only four existing public Firebase values and the design-preview flag are replaced in browser code. No blanket environment-object injection was added. Verified all four public Firebase values are present in the generated JavaScript without printing them.
- Shared CommonJS session/route contracts still run in Node. A narrowly scoped Vite transform exports those same contracts to the browser, preserving their source of truth.
- Lazy routes, local fonts, public theme initialization and existing gateway route handling are preserved. Hashed JS/CSS/font assets receive immutable caching; HTML/API responses retain no-store.
- The manifest includes main.js/main.css aliases, every generated bundle path, entrypoints and a versioned release descriptor. The production container entry check recognizes this format and verifies executable workspace membership guards instead of expecting text from lazy-loaded pages in the entry bundle. These build checks do not replace request authorization or artifact provenance checks.
- Dockerfile copies the project .npmrc before npm ci. legacy-peer-deps is recorded consistently to avoid automatic optional testing-peer expansion; pinned lockfile versions remain the source of reproducibility.
- Corrected a non-UTF-8 text byte in SmsSettings.jsx that the legacy loader tolerated.

## Build and verification

Use supported Node, then run npm ci and npm run build from dashboard. Default output is dashboard/build. BUILD_PATH can select an isolated output directory relative to dashboard. Keep deployment credentials outside public build values. The optional development server binds loopback on port 3001; the installed application and final OAuth acceptance use gateway port 3000.

Vite build passed in 10.17 seconds initially and 7.02 seconds on the final check. Entry JavaScript is 78.07 kB gzip compared with approximately 133.92 kB in the previous CRA build; other lazy chunks still load as needed. These are local build observations, not a production performance score.

Verification passed: 26 focused React tests, 42 gateway tests, 7 metadata/HTTP tests, 4 container release tests and the installed auth-bundle check. Manifest/HTML references agree. Native headless browser checks covered desktop/mobile FAQ, privacy, contact, 404 and homepage; no overflow was found. In-app browser startup failed, so the existing isolated headless check was used. Live readiness and public routes returned expected statuses; protected activity/plan APIs reject anonymous requests with 401. Real Google popup consent and provider execution were not initiated.

## Dependency status remains open

Fresh runtime report: .local/vite-runtime-audit-20261119.json reports 6 findings (2 moderate, 4 high). Full report: .local/vite-all-audit-20261119.json reports 32 findings (9 low, 6 moderate, 17 high). Moving legacy tools to devDependencies changes audit scope; it does not fix those vulnerabilities. Do not call this migration a clean security audit.

Remaining: review/update Firebase and routing dependencies, replace the legacy test toolchain, resolve six backend moderate findings, scan/review the n8n release image and perform final-domain authentication/channel acceptance. Domain, HTTPS, legal details and optional analytics activation remain pending.
