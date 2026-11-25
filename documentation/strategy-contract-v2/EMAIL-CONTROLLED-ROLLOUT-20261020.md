# Controlled email rollout

## Implemented locally

`scripts/lead-strategy/v2/email-rollout.cjs` builds two inactive workflow artifacts from the current 07A and 09 definitions. It preserves their connections, sticky notes, SQL eligibility/lease/approval checks and configured schedule intervals.

The release requires an explicit verified mailbox binding, a nonempty list of plan IDs with exact approved content hashes and recipient addresses, at most two steps per plan, and an expiry no more than 24 hours away. It limits candidate selection before pagination and checks scope again before reservation and immediately before the Gmail POST. An expired or mismatched release blocks transport. There are no send retries.

Campaign policy still must be enabled through the existing campaign-version process. The release accepts no policy exceeding 10/day or 10 per rolling 24 hours, and requires spacing of at least 300 seconds. SQL remains responsible for atomic quota accounting. The builder never changes an approved plan, enables campaign policy, fabricates email verification, imports a workflow, activates a schedule or sends a message.

The reply workflow is bound to the same mailbox and restricted to the listed plan IDs. It continues checking their replies after the send-release expiry so late replies are not ignored. Mailbox identity is still checked through Gmail.

## Usage after a real plan is available

Supply a JSON file with:

- `binding`: `org_id`, canonical `email`, existing verified `credential_ref`.
- `expires_at`: ISO timestamp within the next 24 hours.
- `plans`: entries containing `plan_id`, `content_hash`, canonical `recipient`, `max_step` (1 or 2).

Build a new review directory:

```powershell
node scripts/lead-strategy/v2/email-rollout.cjs .local/reviewed-release.json .local/email-canary-release
```

The builder refuses an existing output directory and accepts only a directory under `.local`. The output includes full workflow JSON files plus a manifest with SHA-256 hashes. No new tables or webhooks are involved.

Before importing, confirm the live plan hash, approval, freshness, recipient verification, policy limits and unchanged Gmail credential owner. Review the exact messages and recipients. Import the coordinated pair inactive, compare definitions, then activate only within the approved sending scope. Pause 07A first if delivery becomes uncertain; keep 09 reading replies when its bound scope remains valid. Never reset an ambiguous attempt to retry it.

## Verification and actual blocker

21 local rollout/executor/sender tests passed. The rollout tests were then extended and rerun to verify the generated transport expression rejects an unauthorized begin or expired release. These tests also check recipient/org/hash/step restrictions, quota ceilings and preservation of workflow topology and notes.

`test-email-real-schedules.cjs` passed all 12 cases through real n8n Schedule Triggers: eight dispatch lifecycle cases and four reply-scan cases. External provider and application database calls were mocked inside a no-network, credential-free SQLite container. Execution IDs 1 and 2 and each case result are recorded in `email-real-schedules-20261020.json`. The final container, `email-real-schedules-1792478972987`, exited successfully with code 0; its server log confirms both cron registrations were removed during shutdown. It uses ten-second intervals only in disposable test artifacts; production intervals are unchanged. Earlier attempts encountered a diagnostic collector bug and a startup timeout; the final result supersedes those attempts without establishing live provider or production SQL behavior.

A read-only production query on 20 October found **zero strategy plans for org 1**. The prior live send/reply tests used scratch plans. There is consequently no production plan to approve or scope for a live release yet. The existing dispatcher also requires `provider_verified` recipient evidence. These gates must not be bypassed by importing scratch fixtures or changing a historical approval.

The production email workflows remain inactive. This local rollout builder is not a production deployment or authorization to send to prospects. Forced OAuth token refresh passed in an isolated credential copy on 20 October; the live credential remained unchanged. A real scheduled production campaign remains UNVERIFIED.

## Release packaging correction

The general `email-release.cjs` exporter previously stopped at migration 030. It now includes 031 (the uncertain-contact guard) and requires every migration number from 021 through 031 exactly once. Missing or duplicate migrations fail packaging. The release, rollout and sender-policy suites passed all 16 tests after this correction. A new inactive review bundle at `.local/email-release-review-20261020-complete` contains 11 migrations and two workflows; its byte verification passed. This bundle is for review, not an instruction to reapply already installed migrations. Its baseline and live-readiness fields are conservative review requirements, not live database observations.
