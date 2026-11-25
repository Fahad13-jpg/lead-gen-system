# Dashboard design direction

17 November 2026. Approved direction and implementation notes.

Method: [unslop by Damir Sokolovsky](https://heydamir.design/unslop),
[@heydamir](https://x.com/heydamir), CC BY 4.0. This brief applies that method to
the existing product; it does not replace its features or execution rules.

## The direction in five lines

**Product:** A workspace for finding businesses, preparing outreach and managing replies.

**Character:** Calm, clear, assured.

**World:** A sales workbench: graphite structure, silver surfaces and a yellow highlighter.

**Moments:** One carefully drawn search activity chart, with a focused list of the next actions that need the user's attention.

**Signature:** A short yellow notch marks the next action; the same shape appears in a flat path logo.

## Proposed name and logo

Working name: **Leadmorrow**. It connects finding leads with the next business
opportunity, without an AI prefix or technical suffix. It is a proposal, not a
claim of confirmed domain or trademark availability. An initial exact-name web
search did not produce a clear matching product; formal availability is still
unverified. The user can approve the visual direction while keeping the name open.

Logo concept: a custom flat L-shaped path with a small forward notch, paired with
the wordmark in the interface family. The mark must work in one color, at favicon
size, in the sidebar and on the sign-in page. Deliver SVG assets and light/dark
variants after the direction is confirmed. No stock sparkle, gradient tile, globe,
glowing network or glossy object. This is a logo concept, not a finished asset.

The user explicitly requested naming, so it is included despite the skill's
default rule to retain an existing name. Rename visible product branding only;
internal project IDs, database identifiers, OAuth bindings and URLs stay stable.

## Palette and typography

| Role | Choice | Use |
| --- | --- | --- |
| Graphite | #2B2D31 | Sidebar, main text, dark text on yellow |
| Silver | #D9DADC | Dividers, quiet surfaces, secondary text on graphite |
| Yellow | #FFC93C | Primary action, next-action notch, lead chart series |
| Workspace | #F5F5F6 | Derived neutral page surface |
| Panel | #FFFFFF | Forms, tables and content panels |
| Secondary text | #5C6067 | Supporting copy on light surfaces |

Recommendation: a graphite sidebar with a light workspace, rather than making
every data table and setup form dark. The user's three colors remain the brand
anchors. Semantic warning/error/success colors remain restrained and meaningful.

Measured contrast: graphite text on yellow is 8.98:1; silver on graphite 9.86:1;
secondary text on the workspace 5.80:1. White on yellow is only 1.54:1, so yellow
buttons use graphite text. Silver is not used as body text on white.

Recommended interface family: [Figtree](https://fonts.google.com/specimen/Figtree).
Use a locally served font and a system fallback. One family is enough; use tabular
numerals for costs/counts. Remove the competing Inter/Outfit/font imports.

| Text | Size / line height | Weight |
| --- | --- | --- |
| Primary page title | 28–32 / 36–40 px | 500 |
| Section title | 20 / 28 px | 500 |
| Body, important instructions, inputs | 16 / 24 px | 400 |
| Navigation, compact table cells | 15 / 22 px | 400–500 |
| Supporting text | 14 / 20 px | 400 |
| Timestamps and low-priority metadata | 12–13 / 18 px | 400 |
| Key figures | 30–36 px, tabular | 500 |

Avoid negative tracking on small text. Use 600 only for rare emphasis. Critical
cost/approval instructions never become tiny captions or low-contrast footnotes.

## Audit: what is actually present

The current foundation is usable. This is a substantial brand/readability/flow
refinement requested by the user, not a claim that every screen is covered in
gradients or emoji. The active shell already uses Lucide icons. No emoji icon
characters were found in the JSX/JS scan. Keep that foundation and standardize it.

Visual evidence: `.local/dashboard-unslop-20261117/current-preview.png`, captured
at 1440 × 1000 from the public `/design-preview` route. That route contains
explicitly labelled sample data. It is not evidence of real campaign metrics or
the current signed-in workspace. Production-screen findings below also come from
the actual routed components and their styles, plus the user's earlier screenshots.

| Finding | Where it lives | Required change |
| --- | --- | --- |
| Competing typography and themes | index.css, public/index.html, DesignPreview.css, Workspace.css | One font, one set of semantic tokens, no repeated theme overrides |
| Important supporting copy too small | LiveData.css, Overview.css; mobile rules reach 10–11 px | Readable body/help scale and proper contrast |
| Technical vocabulary in the main flow | NewSearch, LiveJobs, PlanReview, provider setup components | Plain labels, with evidence/debug detail available on demand |
| Raw stored identifiers appear as labels | LiveOverview source/status cells and some channel/status displays | Explicit human-readable presentation maps; preserve underlying values |
| Obsolete development copy remains | LiveCampaigns footer, LiveSettings account explanation, LiveOverview footer | Describe actual current behavior and next action, not implementation history |
| Long connection forms read as one continuous task | LiveSettings with Gmail, SMTP, Retell and SMS subforms | Clear account groups, summaries and expanded setup only where needed |
| Several approvals and controls have similar visual weight | PlanReview and channel release components | A guided review sequence with one main action per step |
| Campaign cards repeat large explanations | LiveCampaigns | Show lifecycle and next action; move repeated explanation into concise contextual help |
| Decorative icon containers add noise | Overview metrics and campaign cards | Figures and labels carry the metrics; icons explain actions only |
| Icon sizes vary | Layout and live pages use approximately 17–32 px | Lucide at a consistent 18 px / 1.5 stroke for controls; larger sizes only for a deliberate empty state |
| Generic headings are longer than needed | Overview and NewSearch | Use context names: Overview, Find leads, Campaigns |
| Spacing and control rules vary by feature | LiveData.css plus individual page/component CSS | Shared controls and 4 px spacing scale; consistent labels, fields and buttons |
| Dense mobile tables depend on wide layouts | LiveLeads and LiveData table rules | Deliberate mobile reading order and clear horizontal overflow; preserve contact data and row actions |
| Long profile/email text wraps awkwardly | Layout sidebar | A single-line account summary with accessible full details |
| Status is not consistently actionable | LiveJobs, campaign list, Settings | Consume the new backend reason/next-action summaries without treating them as permission to execute |

The preview's three equal metric cards and repeated colored icon boxes are quiet
but generic. Retain the real metrics; make the values the focus and give the
activity chart a clear lead. Do not add decorative mini charts to every number.

No verified marketing claims, revenue figures or user counts are added. No
unobserved gradient/glow/animation problem is asserted by this audit.

## Navigation and screen purpose

Keep the six existing destinations and their order. Preserve bookmarks and route
paths. A clear active item, page title and optional back link establish location.

| Screen | User's question | Main next step |
| --- | --- | --- |
| Overview | What needs me now? | Open the most relevant saved action; Find leads when starting |
| Find leads | Which businesses and area should I search? | Review search, then confirm the displayed budget |
| Search progress | Is my search moving, complete or blocked? | Read the reason and follow its safe next action |
| Leads | Which businesses should I review? | Search/filter, then open a business |
| Lead detail | What do we actually know about this business? | Review evidence and available contacts |
| Campaigns | What is the current state of my outreach? | Open a campaign or create one |
| Campaign editor | What am I offering, to whom, and through which channels? | Complete the existing configuration in logical groups |
| Message review | What will be sent and what am I approving? | Review exact content/evidence, then the existing scoped approval/release steps |
| Outreach | What was sent, what replied and what needs review? | Inspect the recorded result or reply |
| Settings | What is connected and what needs setup? | Expand one account's setup or recovery task |
| Sign-in / workspace access | How do I enter the right workspace? | Sign in or choose an authorized workspace |

Separate New search and Search history within the existing Find leads area so its
destination is understandable. Preserve all source choices and existing limits.
Do not introduce new backend features merely to fill a navigation group.

## Writing rules

Use short sentence-case labels. One helpful sentence near a control is better than
a repeated paragraph under every card. Use details sections for technical support
information. A blocked action needs a reason and a next step, not just a grey button.

| Current wording | Proposed visible wording |
| --- | --- |
| Your workspace, at a glance. | Overview |
| Find your next customers. | Find leads |
| BYOK | Your account |
| Candidate allowance | Records to check |
| Enrichment | Research |
| Approval records | Use the current approval/lifecycle summary, not a historical count as readiness |
| google_maps | Google Maps |
| needs_review | Needs attention |
| ai_completed | Draft ready |
| Request ID / model / prompt version | Optional Details, with readable labels |

Do not blindly replace underscores in user data, URLs, account identifiers or code.
Do not rewrite approved outreach messages as part of a visual cleanup. Actual
message bodies, evidence quotations, AI-calling disclosure, recipient identity,
cost authorization, consent, opt-out and suppression behavior are preserved.

## Layout, details and motion

- Sidebar: 256 px. Main content stays fluid, with 24–32 px page padding and a
  content cap around 1560 px. No tiny dashboard floating in an oversized backdrop.
- Shared 4 px spacing scale. Navigation rows 36 px on desktop, larger touch
  targets on mobile. Controls generally 44 px; panels 24 px padding.
- Buttons/inputs 8 px radius, main panels 12–16 px. Quiet neutral borders.
- One main action per context. Secondary actions look secondary. Keep refresh and
  technical details quiet while preserving keyboard access and visible focus.
- One primary search-activity chart based on actual API data, yellow series,
  muted axes, readable values. Supporting contact breakdown stays smaller/quieter.
- Do not turn independent gathering, cleaning and assessment counts into a funnel
  or percentage that falsely implies a single denominator.
- Handle loading, empty, error, paused, unavailable and partial-data states with
  real copy. Never show sample metrics in the authenticated dashboard.
- Motion only explains interactions, approximately 120–180 ms for feedback and
  180–220 ms for menus. Respect reduced motion. No decorative pulsing or floating.
- Use native SVG for the logo and existing chart/icon libraries. Product screens
  do not need generated stock imagery to look designed.

## Implementation order after direction confirmation

Apply the skill's nine passes in order: spacing, color, icons, copy, type, layout,
details, visuals, motion. Establish shared tokens/controls first, then carry them
through every existing screen. Start the visual implementation with the shell and
Overview so the design has one reference, then cover search/leads, campaigns and
outreach, connection forms, authentication and responsive states.

Check a screen at most three renders per pass sequence. Use the first capture as
the baseline; inspect the implemented screen and one correction render if needed.
Reuse existing functional tests and add checks only for changed interactions and
data-sensitive behavior. Do not run paid searches, AI generation or outreach for
a design screenshot. No backend gate is weakened for a cleaner visual flow.

The selected skill requires this direction checkpoint before product editing.
The direction was approved. Implementation progress is recorded below.

## Implemented foundation and first screen pass

The name Leadmorrow remains a placeholder. `dashboard/src/brand.js` owns the name,
tagline and logo path; `Brand` renders the same identity in navigation and sign-in.
The browser title and icon also read this configuration. No availability claim is made.

Shared styles now use the graphite, silver and yellow anchors, a locally bundled
Figtree variable font (SIL OFL), readable controls and restrained Lucide icons.
Page styles use the shared neutral tokens rather than separate blue palettes.
The navigation has a compact desktop rhythm, a yellow selection notch and a mobile
drawer with Escape dismissal, focus containment and an inert background.

Overview uses a shared presentation component for live and sample data. It has
clear next steps, quiet totals, a graphite/yellow activity chart and an email
availability bar. Sample data remains restricted to the labelled public preview.
Search source labels are human readable, detailed processing counts can be expanded,
and campaign cards link clearly to their review page. Settings groups email,
calling and SMS; forms stay mounted so unfinished connection state is preserved.
Stored message content, API payloads and backend sending authority are unchanged.

This is the shared foundation and primary-screen pass. Campaign review and outreach
still contain dense operational copy that needs a dedicated follow-up pass before
claiming the full dashboard redesign is complete.

Checks: existing Overview, search progress, settings and campaign tests passed
(14 tests), plus 2 new navigation checks. Production build and desktop/mobile inspection are recorded with the
local installation artifacts. No paid provider requests or outreach were used.

Final local verification: production build `main.dee801ca.js` is installed on the
existing gateway at port 3002. Desktop preview inspected at 1440px. At an emulated
390px phone viewport, document width is exactly 390px; the recent-search table
scrolls inside its own container. Figtree loaded locally and yellow primary buttons
use graphite text. Browser checks confirmed the navigation makes the background
inert and Escape closes it. All 16 targeted tests passed. Earlier build assets were
retained for rollback; no backend restart or provider action was needed.

## Visibility and interaction refinement

Kept the approved layout and Figtree family. Supporting ink is now #484D55
(7.81:1 against #F5F5F6), body weight 450, headings 550 and important labels 500–600.
Overview captions are 14px. Panel borders are slightly clearer. Primary and submit
buttons use yellow with graphite text (8.98:1), a deeper yellow hover and a pressed
state. Secondary actions gain a pale yellow hover. Disabled actions stay muted.

Motion is limited to brief 180–240ms content/drawer entrances, a 400ms availability
bar reveal and 150ms hover feedback. Motion-specific rules are gated by the user's
reduced-motion preference. No repeating decoration or chart-value animation was added.

Production build main.c2bd5695.js is installed locally. The browser verified font
weight, supporting-text color, caption size, primary yellow and its hover color;
reduced motion disables entrance animation. At 390px the page width remains 390px.
Desktop rendering inspected. Existing interaction logic and sending gates unchanged.

## Home page, font and appearance modes

Added a public home page at `/` with real sign-in/account links and a three-step
interactive workflow illustration. All illustrated businesses and drafts are marked
as examples; changing the illustration makes no API request. The page follows the
approved graphite/silver/yellow identity and keeps the brand replaceable.
Frontend design guidance was also used for this page's composition and copy.

Manrope is bundled locally under SIL OFL (Google Fonts repository). The static
server now supports TTF/WOFF/WOFF2 MIME types; previously TTF URLs were rejected,
so checking only computed font-family had not established successful font loading.
A focused server check confirms byte-for-byte font delivery with `font/ttf`.

A shared theme provider follows the operating system initially, remembers a manual
light/dark choice and synchronizes browser tabs. A small bootstrap applies the
preference before paint. Themes cover surfaces, forms, status colors, charts,
buttons, navigation, the home page and sign-in. Yellow action text stays graphite
in either theme. Click focus and keyboard focus are both visibly marked.

Google's provided HTML branding example supplies the full-color G and neutral
button treatment, while Firebase remains the sign-in implementation. The password
field supports reveal/hide. Signup links open the existing account form directly.
No membership, sending or authorization rules were changed.

Sources: https://fonts.google.com/specimen/Manrope and
https://developers.google.com/identity/branding-guidelines (HTML example code is
Apache 2.0). Additional focused UI checks passed for theme persistence, workflow
switching, signup navigation, password reveal, Google action and drawer handling
(6 checks). Rendering and final build details follow the installation artifacts.

Final installation: main.d8aad0f5.js / main.b23b68ed.css on localhost:3002.
Browser inspection confirmed Manrope's FontFace status is loaded, a manual theme
survives home-to-signup-to-dashboard navigation, Google artwork loads, and yellow
buttons retain graphite text in dark mode. Phone layout is 390px wide with no page
overflow. A real pointer click was checked for visible button focus; reduced-motion
behavior and the corrected headline were checked after the final installation.
Screenshots and compact browser results are in .local/dashboard-home-20261117.
Only the dashboard gateway was restarted for font MIME support; n8n was not restarted.
No sign-in, account creation, calls, messages or paid searches were initiated.

## Screenshot corrections and pre-release terms

Added `/terms` and links from the home footer, account form and workspace sidebar.
The text covers accounts, provider connections, acceptable use, approvals and
in-flight requests, research/AI limitations, charges, data, availability and ending
access. It is explicitly a pre-release draft. Legal operator, support contact and
commercial legal details remain unset in `dashboard/src/legal.js` rather than
invented. It does not add an unrecorded acceptance claim or a new signup gate.
Provider references were checked against Apify's current official terms and AUP:
https://docs.apify.com/legal/general-terms-and-conditions and
https://docs.apify.com/legal/acceptable-use-policy.

Lead table rows open details from any noninteractive cell. Business names remain
real links for keyboard use. Selected text is not treated as a navigation action;
modified background clicks open a separate tab. The sample table behaves the same.
Home-page example businesses now open their own example draft rather than displaying
nonfunctional chevrons. The selected stage receives focus when the example changes.

Fixed the source of the Settings white blocks: shared section backgrounds now use
the surface token. Search icon wrappers own a single border/focus outline; nested
input borders and rings were removed. Pointer focus on sidebar links is quieter,
while keyboard focus remains visible. Removed the redundant donut tooltip that
covered its center total; exact values remain visible in the filter legend. The
activity chart's date caption is shorter, and historical progress counts are labelled
as recorded states.

Targeted checks: 15 passed (lead row navigation/selection, public appearance,
pre-release terms contents and search processing). No provider action was initiated.

Installed build main.e3ad8c69.js / main.6043e75d.css. Browser checks confirmed the
Terms document is served directly at /terms, has 12 sections and remains labelled
pre-release. The user confirmed operator/contact details can be updated later.
The search input has no inner border/outline and the wrapper has one 2px focus
outline at a compact 48px height. Settings surface/ink checks passed for email,
calling and SMS groups in dark mode. Clicking a sample contact cell opens the lead;
clicking a home example opens the selected business's draft and focuses its stage.
Terms fits a 390px viewport without page overflow. Desktop captures inspected.
Verification artifacts are in .local/dashboard-terms-20261117. Only the gateway was
restarted to expose the public Terms route; provider/sending rules were unchanged.

## Additional yellow emphasis

The email availability fill and its Email found key use #FFC93C in both themes;
the unrecorded key matches the neutral track. The large percentage is yellow in
dark mode and graphite in light mode for legibility. Selected list/search filters
use yellow with graphite labels. Key Gmail connection and campaign review,
approval and start actions have an explicit primary-action style. Disabled actions,
refresh controls and destructive/stop actions retain their existing distinction.
Only styling classes changed; all action handlers and approval gates are preserved.
Build main.4acb1cf3.js / main.8172efd2.css installed locally. Browser checks passed
for both meter themes, matching legend colors, selected-control contrast, primary
buttons and neutral disabled states. Verification: .local/dashboard-yellow-20261117.
