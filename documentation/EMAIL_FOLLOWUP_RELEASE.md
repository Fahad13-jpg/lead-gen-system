# Fresh release for a second email — 10 November 2026

This increment supports an explicitly reviewed second-email release after an earlier
first-message release has expired. The old release and plan expiry are never edited.
The new release still expires within 24 hours and before the original plan expires.
The existing two-step rollout cap, approval hashes, sender limits, leases and
operator-issued authority remain unchanged. Renewal is not automatic.

For an eligible second-email row in Strategy review, owners/admins can choose
Check second email for release. The fixed existing preflight endpoint accepts only
step 1 or 2. Step 2 returns an email_followup_batch_review_v1 packet after reloading
the original plan, current approval, current campaign and sender, the target step's
activity, and the existing SQL step eligibility result. A confirmed first send must
have a matching plan hash, provider acceptance, nonempty external message ID and
nonfuture send time. Its sender, credential and recipient must match the current
configuration. A prior step-2 activity, uncertain parent, delay, reply/opt-out stop,
stale plan or changed approval blocks the packet.

The same operator prepare/install/delegate/start/pause path accepts this packet.
It rebuilds and revalidates it before activation. Gmail's generated query is scoped
explicitly to step 2. SMTP retains its existing worker and queue: confirmed first
steps are excluded by its recorded-step/duplicate guards, while the second step
uses the existing parent/thread and follow-up checks. The unchanged rollout object
uses max_step=2; no third step or longer expiry is authorized. Original working
source workflow graphs and sticky notes are preserved; only newly prepared copies
receive the step-2 scope/note. First-message packets remain readable and retain
their original generated content.

The released-batch dashboard labels a second-email packet correctly and still
requires exact recipient acknowledgement. Dashboard starting remains disabled by
default. Preparing/checking a packet does not install, delegate or activate it.
Fresh operator review is needed for every renewal; no periodic job renews authority.

Validation: 21 focused backend/preflight/controller tests pass. They include Gmail
and SMTP renewal bundles, unchanged first-message behavior, explicit Gmail step
scope, parent identity/history requirements, delay/reply stops, prior attempts,
revoked approval and unsupported step 3. Provider and n8n operations were mocked.
Six focused UI tests pass, covering explicit second-email review, restricted roles
and later steps, display and released-batch uncertainty controls. The new step-2 SQL
also executed through the read-only local connection; the inspected historical plan
correctly remained blocked by stale bindings and missing matching parent evidence.
No provider calls, migrations, data changes, delegation or activation occurred.
Evidence: `.local/email-followup-renewal-20261110/result.json`.

UNVERIFIED: real second-email installation/send, continued Gmail/SMTP thread behavior
for a fresh customer release, overlapping old/new reply pollers in live operation,
and authenticated browser acceptance. No real send is claimed by mock tests.
Multi-email sequences beyond two steps require a separate release-scope decision.

Local installation completed: build main.d95c0d9e.js is served by the reloaded
dashboard gateway with starting explicitly disabled. Campaign navigation returned
200 with the current bundle; anonymous step-2 preflight returned 401. The existing
live outreach_email_can_resume function also confirmed provider-accepted first
steps cannot resume, supporting SMTP's unchanged duplicate exclusion. No new batch
was installed, delegated or activated. Smoke evidence:
`.local/email-followup-renewal-20261110/smoke.json`.
