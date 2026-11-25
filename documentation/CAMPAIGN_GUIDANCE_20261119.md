# Campaign workflow guidance

19 November 2026

Campaign review retains its four existing steps and adds a suggested next-step panel. Navigation opens the relevant existing section and does not approve content, request AI or send outreach. Form state remains mounted when changing sections.

Recommendations distinguish missing channel/sender setup, usable current drafts, matching recorded content approvals and older/failed/expired/blocked records. Drafts with unconfirmed evidence checks point to review before replacement. Recommendations are scoped to plans on the loaded page; when more pages exist, users are directed to inspect saved plans rather than treating the current page as the whole campaign. Approval recommendations still require recipient/sender/schedule/channel review and do not claim sending readiness.

Ten focused workflow, guidance and campaign-review tests passed. The optimized build and local installation are recorded in the build log and installation receipt when complete. No backend authorization, provider budgets or execution logic changed.

Installation completed: main.4260f009.js at localhost:3000. Production build passed. Live readiness and campaign page returned 200 with the current build; anonymous plans API returned 401. Previous hashed assets were retained for existing tabs.
