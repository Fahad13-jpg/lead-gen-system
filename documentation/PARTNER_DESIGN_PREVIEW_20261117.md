# Partner design preview

17 November 2026.

Shareable home page: https://true-hockey-qualified-revenues.trycloudflare.com/

Direct sample dashboard: https://true-hockey-qualified-revenues.trycloudflare.com/design-preview

This is a temporary, read-only design review. It shows the home page, sign-in/signup
appearance, pre-release Terms, sample Overview and sample Leads. Other sample
navigation items explain that the full workspace requires sign-in. Sign-in and
account creation are disabled; forms use read-only example values. No organization
records, working API endpoints or live Firebase configuration are exposed.

The build is separate from dashboard/build:
`.local/dashboard-partner-build-20261117`. It uses REACT_APP_DESIGN_REVIEW=true and
dummy Firebase configuration. The live build uses the normal identity provider;
the preview provider configures no API access. The static review server binds to
127.0.0.1:3025 and serves no APIs or POST actions. Its response policy blocks all
connect requests. Cloudflare forwards only this review server, not port 3002.

Keep this computer connected and the preview server/tunnel running. This is not a
permanent deployment; restarting the tunnel normally produces a different URL.
The server and tunnel PID records and logs are in
`.local/dashboard-responsive-20261117`. If stopping them, verify the current process
command lines still match this preview before using recorded PIDs; do not stop the
separate SMS/calling tunnels or working dashboard gateway.

Responsive verification used browser-emulated viewports, not physical hardware:
320, 390, 430, 768, 1024, 1366 and 1920 pixels, light and dark, on Home, Login, Terms,
Overview and Leads (70 final cases). No page-level overflow or offscreen controls
were found. Wide data tables scroll inside their own containers. Fixed narrow-phone
header button wrapping and stacked the tablet account form. Phone drawer fit and
background isolation were also checked. Public-browser verification confirmed the
actual font loaded, sign-in remains disabled, tablet layout is one column, and no
identity or data requests were made. External HTTPS checks returned 200 for public
pages and 404 for /dashboard-api/settings.

Live local build: main.a09347de.js. Partner build: main.7ed8f64b.js.
Evidence: .local/dashboard-responsive-20261117, including partner-final.json,
preview-isolation.json, public-check.json and public-browser-check.json.

## Campaign flow preview update

The sample dashboard now includes Campaigns with four navigation steps and an expandable sample workspace checklist on Overview. These components use fixtures only. No account connection, strategy request, approval or send can run here. Checked 320, 390, 768 and 1366 pixel widths in both themes: 40 checklist/step checks, no page overflow or data/identity requests. The same temporary preview URL remains in use.
