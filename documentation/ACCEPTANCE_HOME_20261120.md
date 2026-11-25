# Home page acceptance: 20 November 2026

Status: home-page review and corrections completed locally. Next phase: sign-up, sign-in, email verification and workspace onboarding. Authentication actions were not performed in this phase.

## Scope and evidence

- Signed-out visitor in a separate browser session; no customer account changed.
- Source, installed build, metadata, brand assets, first impressions, font, language, links, preview interactions, keyboard operation, theme behavior and responsive layouts.
- Browser widths: 320, 390, 768 and 1366 CSS pixels, in both light and dark modes. All three preview stages exercised: 24 combinations. Header target sizes reconfirmed in 8 width/theme combinations after the CSS fixes.
- 18 automated checks passed across Home.test.jsx and PublicAppearance.test.jsx. Coverage includes guest links, five authenticated/pending-access states, public availability while access is loading/unavailable, keyboard arrows/Home/End, roving tab focus, sample-business focus, theme persistence and blocked storage.
- All 8 distinct public page destinations respond HTTP 200; the logo and sharing image respond successfully. Actual browser navigation verified signup mode, sign-in, preview, FAQ, privacy, terms and contact, including back navigation. Both section anchors land at the intended section with a 24px margin.
- Sampled normal-text contrast: 7.21:1 to 10.41:1 in light mode and 8.82:1 to 14.35:1 in dark mode; yellow CTA text 8.98:1 in both. These are sampled measurements, not a full WCAG certification.
- Manrope loaded successfully, English document language, descriptive metadata, one H1 and working skip-to-main focus. Local indexing remains off deliberately until public domain/launch configuration is ready.
- No browser console errors observed in the navigation pass. No live authentication, paid provider call, lead request, AI generation, approval or outreach occurred.

## Corrections installed

| Finding | Correction |
|---|---|
| Mobile header hid sign-in | Visible Sign in and Create account actions; theme control remains accessible above them |
| Some links and theme controls were too small | At least 44px touch targets for the reviewed header, footer, preview and closing actions |
| Preview behaved like exclusive tabs but lacked tab keyboard semantics | Tablist/tab/tabpanel relationships, ArrowLeft/ArrowRight/Home/End controls, one active tab stop and visible panel focus |
| Main skip target was not explicitly focusable | Main target supports programmatic focus |
| Returning users had inconsistent signup/sign-in destinations | Workspace-ready users consistently open their workspace; verification/setup/access states consistently continue through /access |
| Generic wording hid the actual process | Plain steps: Find businesses, Prepare messages, Send and track; shared email wording and CSV imports explained |
| Channel access/setup was unclear | Free email/manual social versus Plus calling/SMS, provider charges and live setup requirements described |
| Sources omitted Yelp and US limitations | Yelp (US) and Yellow Pages (US) included in the illustrative source list |
| CSS cascade reintroduced compact-header links and a 40px theme control | Narrow-header link visibility and 44px theme sizing now override shared rules correctly |

## Assets and result files

.local/home-acceptance-20261120/ contains desktop-light.jpg, desktop-dark.jpg, mobile-light.jpg, responsive.json, header-final.json, contrast.json and navigation.json. Test output: .local/home-acceptance-ui-tests.log. The mechanical detector returned no findings for the home source/CSS pass.

## Practical limits

This is a finite acceptance pass in the desktop Chromium browser with responsive viewport simulation, not every physical device/browser combination. Reduced-motion behavior and font fallback were also checked in source; actual OS screen-reader use, browser zoom, cold-load offline behavior, throttled mobile-network performance and Safari/Firefox were not exercised. The home page is not an offline app. Linked pages were checked as destinations; their full user flows are subsequent phases.

## Next acceptance phases

1. Sign-up, Google/email sign-in, validation, verification, password recovery and repeated access loading.
2. New workspace setup, organization switching and Free/Plus access.
3. Provider connections and failure/reconciliation paths.
4. Searches, preprocessing, scoped leads, CSV import/export and lead details.
5. Campaign setup, shared/individual drafts, review and approvals.
6. Controlled channel execution, follow-ups, replies, opt-outs, failures and activity reporting.

Each subsequent page should retain a bounded test matrix and only make fixes supported by observed behavior. Live paid/sending acceptance uses explicit test scope and owned recipients.
