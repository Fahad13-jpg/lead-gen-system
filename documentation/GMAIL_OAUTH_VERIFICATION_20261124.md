# Gmail OAuth production verification draft

Status: preparation only. Do not publish or submit until the operator has reviewed the statements below.

## What the application requests

The Gmail connection asks for these scopes:

- `openid` for the Google account identity used to attach the connection
- `email` for the account email address
- `https://www.googleapis.com/auth/gmail.send` so an approved campaign can send email from the connected account
- `https://www.googleapis.com/auth/gmail.readonly` so the application can check replies and delivery information for approved campaigns

The application does not request `userinfo.profile`, full Gmail access, Gmail modify, delete, or mailbox settings scopes.

Google classifies `gmail.send` as sensitive and `gmail.readonly` as restricted. A public production release therefore needs OAuth app verification. Because restricted Gmail data is handled by the server, Google may require a CASA security assessment. There is no reliable or compliant self-verification bypass for this design.

## Current OAuth configuration

- Google Cloud project: `spry-cat-467906-t6`
- Public origin: `https://leadmorrow.tech`
- OAuth callback: `https://leadmorrow.tech/oauth/gmail/callback`
- App name shown to users: `Leadmorrow`
- Support email: `mohmmadfahad53408@gmail.com`
- App status: Testing until the operator publishes it after review

The VPS is currently marked `DEPLOYMENT_STAGE=staging`. Do not treat this staging client as the final production client without first removing test-only clients and configuration. Google recommends separate Cloud projects for development, staging, and production.

## Scope justification for Google's form

Leadmorrow helps a workspace find business prospects and run an approved email campaign. A workspace owner connects a Gmail account and explicitly chooses it as a campaign sender. The service sends only messages that the owner has reviewed and approved, subject to recipient eligibility, opt-out, rate, and campaign controls.

The send scope is used only to deliver those approved messages from the connected sender. The read-only scope is used only to check replies and delivery-related mailbox information for those approved campaigns. The service does not sell Gmail data, use it for advertising, build a separate credit profile, or allow one workspace to access another workspace's mailbox. Users can disconnect the account and request data access or deletion through the public support address.

## Verification evidence to prepare

1. A short screen recording showing sign-in, Gmail connection, the consent screen, sender selection, campaign approval, and the reply/status view. Use a test mailbox and redact personal data.
2. A test account and step-by-step reviewer instructions.
3. The public home page, privacy notice, terms, and contact page on `leadmorrow.tech`.
4. A precise list of where Gmail tokens and message metadata are stored, who can access them, retention/deletion controls, and encryption/access controls.
5. A current architecture and data-flow diagram showing browser, gateway, database, credential adapter, and Gmail API.
6. A CASA assessment package if Google requests it for the restricted scope.

## Local checks completed

- Production dashboard build: passed.
- Gmail connection UI tests: passed.
- Gmail reconnect UI tests: passed.
- Firebase authentication tests: passed.
- The public origin and callback are configured for HTTPS.

## Remaining blockers before publication

- Confirm the final governing-law and operator details in the legal pages.
- Replace the pre-release wording in the terms and privacy notice with the operator-approved production text.
- Decide whether reply checking is required for launch. Removing `gmail.readonly` would reduce the verification burden, but would remove automated reply checking; it is a product decision and is not changed automatically.
- Review the Google declaration and submit it from the Cloud Console. The final declaration must be made by the operator, not generated or attested by automation.

## Safe release sequence

1. Keep the app in Testing while the final legal text and evidence are reviewed.
2. Run the local build and Gmail/auth tests.
3. Publish the OAuth app only after the public pages and callback are final.
4. Submit the scope justifications and evidence in Verification Center.
5. Complete any Google-requested CASA assessment before allowing general users to connect Gmail.
6. Re-test connection, campaign approval, send, reply check, disconnect, and deletion after approval.

## Reference pages

- Google OAuth App Verification Help Center: https://support.google.com/cloud/answer/13463073
- Google restricted-scope verification: https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
- Gmail API scope classifications: https://developers.google.com/workspace/gmail/api/auth/scopes

