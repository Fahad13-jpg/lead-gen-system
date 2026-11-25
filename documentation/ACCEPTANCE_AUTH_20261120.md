# Email account acceptance, 20 November 2026

## Implemented

Sign-up has masked password and confirmation fields, independent show/hide controls, Caps Lock feedback, password-manager support and an unchecked Terms/Privacy agreement. Account creation checks the current Terms version and Firebase password policy. Fields clear when switching modes. A synchronous submit lock prevents duplicate requests. Failed verification delivery preserves the created account and offers recovery through the verification screen.

Sign-in retains support for existing passwords. Incorrect credentials use a generic error; reset responses do not disclose account existence. Routine same-user token refresh keeps the current workspace visible while membership is checked. Revoked membership or an unavailable access check removes access. Internal campaign links use router navigation.

## Email identity

Firebase's internal project display name changed from Lead Gen System to Leadmorrow. This did not change the public-facing name: the user's delivered verification email still shows project-60… in its subject and team signature. Firebase has a separate Public-facing name under Project settings > General > Public settings. That name must be changed to Leadmorrow by the project owner. The available browser account mohmmadfahad53408@gmail.com cannot access this Firebase project, so the correction is pending owner access. The brand remains configurable in dashboard/src/site.json; update the public-facing name too when the brand changes.

Firebase rejected custom template updates with EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED. Standard Firebase delivery, links and sender domain remain in use. No custom sender domain was invented. Actual delivered subject, sender and verification link still require the live inbox test.

Firebase password policy now enforces at least eight characters for new passwords, without forcing existing users to upgrade at sign-in. Email enumeration protection is enabled.

## Validation

37 checks passed across Login, Firebase adapter, PublicAppearance, AuthContext, Access and LiveCampaigns. Provider calls are mocked in unit tests; no test signup, email or outreach is performed by these tests. Production frontend build and auth bundle validation passed.

Browser checks cover desktop 1366, tablet 768 and phones 390/320, light and dark appearances, password visibility, switching modes, empty-field errors and reset navigation. Tablet column placement and touch-control sizes were corrected during review.

## Remaining live acceptance

Use rosemilk5676@gmail.com. The user enters and confirms their own new password, reviews the legal pages, accepts the checkbox and submits. Confirm inbox subject/sender, follow verification, continue workspace onboarding, sign out and sign in with the same password. A live password-reset round trip remains a separate user-controlled check. Do not log passwords, action tokens or verification URLs.

Agreement is checked in the signup flow but is not yet a durable backend consent receipt. Google first-use consent across all entry routes and final operator/legal details require completion before public release. This report does not claim those are implemented.
