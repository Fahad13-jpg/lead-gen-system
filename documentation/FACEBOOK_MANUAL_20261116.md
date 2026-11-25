# Manual Facebook / Messenger outreach

Installed on 16 November 2026. Open a Facebook-sourced lead from Leads. The
Manual Messenger message section provides an editable message, selection among
saved business Pages, a review acknowledgement and Copy message & open Facebook.
Clipboard failure leaves selectable text and a Continue to Facebook link; popup
blocking also leaves that link. An observed Messenger URL is preferred, otherwise
the saved Page opens and the user chooses Message when available. The user checks
the sending account, pastes and sends in Facebook. Chat availability is not assured.

The later strategy integration now prefills current approved Messenger messages;
see `MESSENGER_STRATEGY_20261116.md`. Separate manual composition remains available
when no approved draft exists. Email, LinkedIn and WhatsApp approvals are not reused
as Messenger approvals. No Facebook credentials, private APIs or provider calls
are used to copy/open. Copy/open does not create a sent activity or imply
delivery/reply tracking.

The fixed authenticated GET `/dashboard-api/api/facebook-manual` and POST
`/dashboard-api/facebook/manual/prepare` require verified active organization
membership. Preparation rechecks same-organization source-linked Page evidence,
lead availability, existing unsubscribe and reply/stop/review records. It rejects
caller-supplied destinations absent from saved evidence. Only checked Facebook
and Messenger URLs are returned. Text is bounded at 2,000 characters. Service SQL
is parameterized and read-only; no migrations, schedules or account connections
are needed. This is a preparation-time check, not control of subsequent external
Facebook activity or a claim of recipient permission.

Validation: 30 focused gateway/service checks, eight component/lead-detail checks,
production build and static UI detector passed. A read-only local preparation for
saved lead 493 verified actual source linkage and response flags without sending,
copying or opening an external chat. Served bundle and unauthenticated-route denial
were checked after installation. Real authenticated browser copy/open remains a
user walkthrough; no live Facebook message was sent during implementation.

Local evidence: `.local/facebook-manual-20261116/` and
`.local/facebook-manual-ui-20261116/`. The gateway was reloaded with existing email
switches preserved; previous hashed assets and index backup were retained.
