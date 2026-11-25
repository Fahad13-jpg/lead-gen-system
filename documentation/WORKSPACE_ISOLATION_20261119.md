# Workspace access boundary verification

19 November 2026

A focused regression test now connects the real identity service to data-service and package-access denial paths with fixture token verification and fixture memberships. No real Firebase token, database write or provider request is used.

Covered: forged organization/owner claims do not grant access; settings, outreach, lead details, search request progress, campaign lists, plans, strategy progress, overview, leads and jobs reject another workspace before querying; calling/SMS package checks reject another workspace before package/provider access; removing membership blocks the next request using the same token.

Existing identity, membership, data, package and HTTP suites also passed. Total: 80 tests across six suites. No production behavior needed modification in the checked paths, so the installed dashboard remains main.4260f009.js. No rebuild or service restart was needed.

Limits: this is focused code-level verification with controlled fixtures, not a claim of a complete penetration test or production two-account acceptance. Final staging acceptance should sign in as two actual users with distinct workspaces and verify both read and action denial on the final domain. Existing migration/DB permission tests and provider-specific authorization remain separate.

Regression command: node tests/dashboard/workspace-isolation.cjs
