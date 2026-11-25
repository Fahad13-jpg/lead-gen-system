# Search and campaign status guidance

19 November 2026

Installed local build: main.c65a8b24.js. The gateway status-summary module is mounted read-only and the local dashboard was recreated alone.

Backend summaries now include fixed, public descriptions derived from existing lifecycle reasons. They explain missing strategies/approvals, changed scope, paused automation, worker waits, unconfirmed provider starts, incomplete run references and unsettled costs. Raw provider errors and secrets are not interpolated. Existing authorization, retry and execution flags are unchanged.

Search cards show the explanation and existing next-step label. Campaign cards show the explanation and use the action label provided by the backend. Progress/uncertainty/cost actions open existing outreach activity; other actions open the campaign review. These navigation links do not authorize provider writes.

Verification: 7 backend status tests and 13 data-service tests passed. Search UI tests passed (7), campaign UI tests passed (3), including uncertainty guidance and navigation. Optimized build and Compose validation passed. Local readiness returned 200, campaign document served the current build, anonymous campaign API returned 401. No messages, calls, paid searches or database migrations were initiated. Full authenticated acceptance remains separate.
