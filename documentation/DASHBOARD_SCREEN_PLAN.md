# React dashboard screen plan

Planning pass: 2026-11-07. No runtime, workflow, database or deployment changes.

## Direction

An operational workspace for organization owners and small teams. The user delegated the homepage hierarchy: put actionable work first, followed by processing progress and results. Palette and typography remain undecided. This is a proposed information architecture, not a claim that the screens or APIs already exist.

## Current source audit

- App.js defines login, dashboard, scraping and leads routes. Layout.jsx exposes three navigation items.
- index.css supplies an incumbent dark palette. Do not treat it as the approved future theme.
- Login.jsx permits a local demo login after an authentication request fails; AuthContext.jsx trusts localStorage. Neither establishes authenticated organization membership.
- api/client.js sends legacy user_id and defaults identity to 1. Replace this integration when implementing real authentication; do not carry it into customer connections.
- Scraping.jsx displays a hard-coded cost/time estimate. Future previews must use backend estimates and clearly state uncertainty.
- Leads.jsx labels the entire fetched collection as enriched and suppresses fetch errors into the console. Future states must distinguish loading, empty, failure and actual assessment status.
- Live visual behavior, endpoint compatibility and current Docker rendering were not verified in this planning pass.

## Navigation and screens

Six primary navigation items; nested screens and tabs keep the sidebar compact.

| Section | Screens and purpose |
| --- | --- |
| Overview | Needs attention; active searches; scheduled outreach; recent outcomes; connection/budget notices |
| Find leads | New search form and preview; search history; individual job progress |
| Leads | Filterable lead table; individual lead details with evidence, contact readiness and activity |
| Campaigns | Campaign list; campaign setup; strategy review; campaign progress/results |
| Outreach | Replies and conversations; scheduled activity; manual LinkedIn tasks; call sessions and outcomes |
| Settings | Organization/team; connected senders/providers; preferences and working hours; plan/usage; account |

Outside navigation: login/register/recovery, organization setup, and public privacy/data-deletion pages. Tabs are not separate sidebar entries. Organization switching belongs in the app shell.

## Customer journey

1. Sign in, select an authorized organization and resolve required setup.
2. Request businesses by category, location and number of new businesses. Show existing matches separately. Review source/account/allowance information before starting.
3. Open job progress: gathering, cleaning and enrichment, with stage counts, timestamps and reasons for waiting. Do not invent a percentage or guaranteed completion time.
4. Inspect leads. Missing contact information stays missing; a discovered address is not automatically provider-verified. Show evidence and channel eligibility separately from fit.
5. Configure the product/offer, benefits, CTA, preferred channels and sender. Reuse an offer for later campaigns.
6. Review generated or customer-supplied strategy. Surface fallback and evidence warnings, actual permitted channels, timing and approval requirements.
7. Monitor execution and respond to replies or manual tasks. Explain stopped/blocked/uncertain activity; never offer a blind retry for an uncertain send.

## Homepage wireframe

```text
+------------------+---------------------------------------------------+
| Organization     | Overview                           Find leads     |
|                  |                                                   |
| Overview         | Needs attention                                   |
| Find leads       | Type / business or campaign / reason / next action |
| Leads            |                                                   |
| Campaigns        | Searches in progress                              |
| Outreach         | Request / current stage / counts / last update     |
|                  |                                                   |
| Settings         | Outreach today                                    |
|                  | Scheduled / awaiting review / replies / outcomes   |
| Account          |                                                   |
|                  | Recent results and usage summary                  |
+------------------+---------------------------------------------------+
```

When nothing needs attention, show a compact all-clear message and bring active work upward. On a new account, show setup and a clear first-search action rather than rows of zero statistics.

## Interaction requirements

- One obvious primary action per screen. Keep financial/provider details beside decisions they affect.
- Table rows open details; explicit action buttons do not trigger row navigation. Filters and pagination preserve context on return.
- Search details and lead details are addressable screens, so refresh/back/bookmarks work.
- Status uses text and icon as well as color. Show last update and a stale/offline notice when refresh fails; retain previously loaded data with its timestamp.
- Desktop supports dense work tables; small screens show priority fields and reveal secondary details on demand. Sidebar becomes an accessible menu.
- Cover loading, empty, partial, stale, forbidden, error, exhausted allowance, disconnected provider and uncertain execution states.
- Keyboard navigation, visible focus, labelled forms, readable contrast and reduced motion are acceptance criteria.
- Backend owns readiness, entitlements, approvals and limits; hiding a button is not authorization.

## Implementation sequence

1. Confirm screen scope, then build a representative Overview and Leads design preview with clearly labelled fixture data and no provider actions.
2. Choose visual tokens from that preview; build reusable shell, tables, forms, status labels and feedback states.
3. Implement real authentication, organization membership and API contracts. Customer credential connections wait for this boundary.
4. Connect search, job progress and leads; then campaign review and outreach workspaces using existing backend controls.
5. Exercise an end-to-end customer journey with appropriate mocks and bounded authorized live checks. Finish desktop/mobile visual and accessibility checks.

## Open decisions and verification

- Visual theme and typography: undecided; next design step.
- Authentication provider: undecided; both requested sign-in methods must be supported.
- Exact API response contracts, permissions, per-plan entitlements and supported actions: verify before wiring screens.
- SMS, real calling, WhatsApp delivery/customer onboarding and other provider readiness must be labelled from verified backend state, not inferred from a workflow filename.
