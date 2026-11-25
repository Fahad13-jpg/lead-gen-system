# Dashboard decisions

## Temporary policy hosting published — 2026-11-06

The user later authorized hosting Lead-Gen-system's policy pages on the existing StudyHub Django/Vercel site until the React dashboard is public. This supersedes the earlier deferral only for these public pages; React remains the planned dashboard and Flutter remains discontinued.

- Privacy: https://studyhub-fahad.vercel.app/lead-gen/privacy/
- Deletion instructions: https://studyhub-fahad.vercel.app/lead-gen/data-deletion/
- Repository: `Fahad13-jpg/studyhub`, production branch `main`, deployed commit `a392cbd` (following policy commit `cf9d198` and build fix `e70f960`).
- Vercel production deployment: `dpl_WAiMMTimL48hhhJUPWqBGXfykSBC`, Ready.
- Anonymous HTTPS verification: both returned 200 and expected text/contact, without authentication or protection bypass. The `studyhub-vq8j.vercel.app` alias redirects to the canonical `studyhub-fahad.vercel.app` hostname.
- Existing build failures fixed: externally managed Python installation (isolated temporary build venv) and UTF-16 requirements (converted to UTF-8, pins unchanged). Python pinned to 3.12; automatic build-time schema migration commands removed. No schema migration was added or run for these pages.
- These pages explicitly describe Lead-Gen-system, not StudyHub, and document manual deletion/retention limitations. Meta publishing itself was not performed. Move these URLs to the React dashboard's permanent HTTPS host when ready and update the Meta configuration.

Subsequent user screenshot confirms the Meta app was successfully published by the user. The unpublished-app limitation is therefore no longer the recorded blocker. This does not establish advanced/customer-account approval, backend sending readiness, or successful delivery/reply processing. Sending stays disabled pending the controlled owned-recipient test and its required configuration.

User decision recorded 2026-11-06:

- Continue with the existing React dashboard in this repository/Docker setup.
- Flutter dashboard integration is no longer planned.
- When dashboard work begins, add public, unauthenticated `/privacy` and `/data-deletion` pages describing actual Lead-Gen-system behavior. Consider `/terms` when needed.
- Defer implementation and public hosting of these pages until the dashboard phase; do not treat this decision as authorization to deploy a website or publish the Meta app.
- Localhost Docker hosting does not supply the stable public HTTPS policy URL needed for Meta publishing.

WhatsApp dependency: Meta's current dashboard warns that the unpublished app receives dashboard test webhooks only. Public privacy-page hosting, publishing requirements and real inbound delivery/reply tests remain pending. Backend development can continue; do not claim these live tests passed or bypass sending/approval gates to compensate.
