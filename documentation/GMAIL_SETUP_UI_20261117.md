# Gmail setup and recovery screen

Installed locally on 17 November 2026.

The screen now accepts a server-confirmed, organization-bound completion receipt
and clears its pending marker. It previously kept confirmed enrollments in the
uncertain view. Ready and pending-check outcomes remain distinct; neither claims
email delivery or campaign sending authority.

Starting again first checks the previous request on the server. It never discards
an unfinished authorization merely to open a new one. Reconnect now retains its
marker for server-reported uncertain outcomes, including HTTP 409, instead of
mistaking every conflict response for a definitive rejection.

Browser-storage failures prevent starting Google authorization. An organization
switch unmounts its setup controller and ignores late results from the old context.
Only the one-use state reference is stored in the browser, never Google tokens.

Copy now gives one clear next action, removes localhost-only advice and the obsolete
server-restart explanation, distinguishes connected from verified delivery, and
puts permission details behind a disclosure. The existing graphite/silver/yellow
palette, Manrope and Lucide icons are retained. Mobile actions wrap to full width.

Verification: 17 focused component checks, optimized build with a 384 MB V8 heap
limit, and actual view fixtures at 320, 768 and 1280 pixels across light/dark themes.
No overflow or clipped controls; Manrope loaded. The static fixtures had no scripts
or API access. The temporary browser and fixture server were closed after checks.
No real OAuth authorization, paid provider request or test outreach was used.

Served build: main.0fcce8ea.js / main.b90fa5ea.css. Old assets were retained. The
isolated partner preview bundle and deployment image were not rebuilt in this
step; rebuild the final release image after frontend changes are frozen.
