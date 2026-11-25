# Dependency security review

19 November 2026

Fresh npm lockfile audit reports are saved in .local/backend-dependency-audit-20261119.json and .local/frontend-dependency-audit-20261119.json. These are registry advisory results, not proof of exploitability or a complete image scan.

Backend: 6 moderate findings, 0 high, 0 critical. The affected chain includes nested Google SDK dependencies through gaxios/google-gax, rimraf, glob and minimatch. npm audit fix with package-lock-only and no force changed zero package records and left the findings unresolved. Direct pins remain firebase-admin 14.5.0, google-auth-library 11.3.3 and pg 8.23.1. The running container has not been rebuilt or altered.

Frontend: 35 findings: 9 low, 6 moderate, 20 high, 0 critical. These counts include inherited dependency findings, not 35 distinct vulnerabilities. react-scripts is currently listed as a production dependency, so omit-dev still includes the build toolchain. Notable chains include webpack dev server/middleware, SVGO, PostCSS, serialize-javascript, Firebase's grpc dependencies and React Router. Production serves compiled static assets, not the CRA development server; browser/runtime reachability still needs explicit review. The report's suggested firebase 9.14.0 downgrade and react-scripts 0.0.0 replacement were not applied.

## Release check

Run the new offline helper with both fresh reports:

node scripts/operations/check-dependency-reports.cjs .local/backend-dependency-audit-20261119.json .local/frontend-dependency-audit-20261119.json

Exit 1 means high/critical findings require review; exit 2 means a report is missing, invalid or older than 24 hours. The current reports correctly produce review_required. This is an operator-run check; it is not wired into an automated deployment pipeline and a zero exit does not establish complete release readiness.

## Remaining remediation

1. Replace or upgrade the legacy frontend build toolchain in an isolated change; preserve route splitting, environment handling, local fonts, theme initialization, tests and Firebase behavior. Keep dependency categories accurate without treating reclassification as a vulnerability fix.
2. Review Firebase grpc findings against the actual browser imports and production bundles, and choose a supported patched dependency resolution. Do not apply the audit's proposed major downgrade blindly.
3. Review React Router fixes with the app's browser routing and controlled Link destinations. SSR findings require separate reachability analysis; do not assume every advisory applies equally.
4. Resolve backend transitive constraints through supported Google SDK updates or a narrowly tested compatible dependency change; no major glob/rimraf override was forced.
5. Review the pinned n8n 1.111.1 base and scan the actual release images before deployment. Official advisory web retrieval failed in this session, so no current n8n safety conclusion is claimed. The npm audits do not scan that image.

No package versions, frontend assets, workflows, paid actions or sending settings were changed in this review. Only the offline review helper and documentation were added. Public launch remains pending dependency triage and the existing hosting/domain/acceptance requirements.

## Compatible remediation update

19 November 2026: added a narrow jsonpath -> underscore 1.13.8 override and updated the frontend lockfile. Direct dependency pins were preserved. npm also corrected the TypeScript peer resolution from 7.0.2 to CRA-compatible 4.9.5 and removed the related native TypeScript platform packages from the lock. A fresh audit now reports 32 findings (9 low, 6 moderate, 17 high, 0 critical), compared with 35 before. Underscore no longer appears as a finding. Counts include transitive chains and must not be interpreted as distinct exploitable vulnerabilities.

Declared Node >=24.12.0 in dashboard package/lock metadata to match the existing Firebase package engine requirement. The local CLI is Node 22.19.0. Installed node_modules and the serving build were intentionally not replaced: a clean install and build on supported Node remain required. The local disk had approximately 250 MB free during review. The installed dashboard is still main.4260f009.js; lockfile remediation is prepared for the next verified release, not claimed deployed.

Official npm metadata identifies Firebase 13.4.0 as a supported-package update candidate (Firestore 4.20.0). It was not installed or claimed to resolve the grpc advisory. Do not replace supported firebase imports with internal @firebase packages; their README explicitly discourages direct use.

The offline release report check correctly remains review_required with the refreshed frontend report. Remaining work: build-toolchain replacement/upgrade, Firebase dependency reachability/update review, React Router remediation, six backend moderate findings and n8n image scanning.

Vite migration completed locally: see documentation/VITE_MIGRATION_20261119.md. Fresh audit files separate runtime dependencies (6 findings, 4 high) and all dependencies (32 findings, 17 high). Production build no longer uses CRA; legacy test dependencies and remaining SDK/routing findings still need remediation. This scope split is not a vulnerability fix.
