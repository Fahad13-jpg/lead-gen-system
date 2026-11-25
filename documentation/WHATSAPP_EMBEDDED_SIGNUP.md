# Embedded Signup checkpoint — 6 November 2026

Meta UI screenshots confirm configuration `1321599346730988` under app `2132619344002820`, JavaScript SDK login enabled, and the temporary HTTPS domain `https://studyhub-fahad.vercel.app/` allowlisted. This is UI evidence, not a successful OAuth exchange. Business Verification and App Review & Access Verification remain incomplete in the supplied screenshots.

## Hosted page

Published https://studyhub-fahad.vercel.app/lead-gen/whatsapp/connect/ on the existing StudyHub project (commit `ee9629a`). HTTP 200, explicit disabled button, workspace-sign-in notice, no SDK script, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and restrictive CSP were verified publicly. The page accepts no POST and performs no credential exchange or messaging. Existing privacy/deletion pages remain intact. Django's two isolated public-page tests passed without a database. Build still contains no automatic migrations.

This is a setup-status page, **not a working customer connection form or an App Review demonstration**. It does not use StudyHub student sessions as Lead-Gen organization authentication. It is intentionally disabled until the secure integration exists.

## Local private handoff

`scripts/whatsapp/onboarding.cjs` is a port-based private orchestrator, not a mounted endpoint or an installed production connector. It requires real organization authentication, a single-use session store, code exchange, token inspection, account/phone verification, protected credential provisioning/catalog registration and credential quarantine ports. None of these can be supplied by browser JSON as successful check results.

Sessions bind organization, verified principal, origin and server configuration, expire after five minutes, and are consumed before provider I/O. Ambiguous exchange is not retried with the same session. Returned tokens stay inside server calls; public results contain only pending connection identity. The provider app/scopes, known expiry and selected account/phone must match before provisioning. A server-approved rotation deadline is required even when provider expiry is zero; unknown token-expiry fields fail closed. Registration uses the existing pending sender service and never enables sending. A known newly provisioned credential is quarantined if registration cannot be confirmed; the future provisioning adapter must itself handle ambiguous persistence safely.

The supplied bounded in-memory session store is for a single local process and tests. It loses pending sessions on restart and is unsuitable for replicated/serverless instances without a shared atomic store. No new database table, public webhook, production environment value or n8n workflow was added for this module.

107 offline WhatsApp tests pass, including six mocked onboarding tests for readiness, identity/origin/session binding, expiry, replay, account/scope checks, ambiguous exchange and credential quarantine. Real provider exchange, inspection schemas, credential provisioning, session-store deployment and browser SDK integration remain **UNVERIFIED / not wired**. The previously installed executor/registry remains unchanged; no model, Apify or message call was made in this checkpoint.

## Required next work

Connect the real React dashboard organization login and membership bootstrap, then implement the trusted credential provisioning/catalog and Meta exchange adapters behind authenticated APIs. Do not expose them through the current demo-login fallback. Only afterward wire the public SDK/button, run an app-role-user signup, and assess Meta's business/app review requirements. The configured domain and saved config ID alone cannot replace these dependencies.
