# Campaign renewal and send-time enforcement — 10 November 2026

Current checkpoint, 15 November: local campaign controls/renewal are enabled with
zero approved campaigns, real inert n8n lifecycle acceptance passed, and migration
058 fixes routine sender freshness without invalidating unchanged approvals.
Gmail is fresh and its version was preserved. No new email was sent. See
`EMAIL_COMPLETION_20261115.md`; historical disabled/unfinished statements below
describe the earlier installation. Real customer multi-day acceptance remains
unverified, rather than being implied by inert workflow tests.

Implemented locally and tested against mocks and isolated scratch PostgreSQL.
Migrations 056/057, dashboard controls and a disabled renewal supervisor are now
installed locally. No campaign approval/activation, email, model/Apify/provider
call, inbox read, budget change or trial-ledger write was performed by this work.

## Backend flow

The default-off runner scans up to five approved/enabled campaigns per tick. It
claims a five-minute campaign renewal lease stored under the existing operational
JSON key. Only one lease can be current. It reloads original-approver membership,
current scope, sender, plan hashes, history and SQL eligibility before deciding the
next unsent approved step. Each selected plan is considered separately; ambiguous
history is held for reconciliation rather than retried.

Publication is revision/lease fenced in PostgreSQL. A release names one exact plan,
recipient and step (1–10), and expires within 24 hours, before campaign end and plan
expiry. Repeated publication reuses an unexpired current slice. A lost publication
response is not retried inline. The worker rechecks scope again before installation.
The installer preserves topology/notes and uses the existing inactive-install,
reply-first activation, pause and uncertain-API reconciliation logic. It validates
credential/project ownership and journals under `.local/campaign-slices` with an
exclusive lock. A changed bundle or unknown outcome cannot silently overwrite it.

Gmail copies scope their queue to the exact plan and step, check authority before
mailbox access, and pass slice authority to atomic send admission. SMTP uses a NEW ManagedCampaignSender and campaign-system
namespace, leaving the installed manual worker and its fingerprints unchanged.
The new SMTP adapter also checks authority before opening SMTP/IMAP, forwards it
to begin, and sends nothing after a denied or uncertain begin. Manual first/second-email rollout limits are unchanged.

Migration **057_email_campaign_renewal.sql is installed locally**, together with
056 on 10 November. It adds no tables, columns or webhooks. Leases and slices use existing config
JSON excluded from strategy fingerprints by 056. It adds explicit automation
start/pause control and narrowly inserts the new guard at the beginning of all
three existing Gmail/SMTP send-admission functions. No-automation campaigns retain
their legacy path. Automation campaigns require the exact stored slice, current
revision/hash, active original approver, enabled state and current eligibility.
Revocation/pause fences previously issued slices too. Once a send has passed its
committed admission boundary, it is in flight and may complete; it is not recalled.

## Artifacts and verification

- Renewal decision/runner: campaign-renewal-worker.cjs, run-campaign-renewal.cjs.
- Exact protocol: campaign-slice.cjs and email-release-policy.cjs.
- Gmail/SMTP packaging: campaign-slice-workflows.cjs and campaign-slice-installer.cjs.
- Schedule SQL ports: scripts/dashboard/campaign-renewal-ports.cjs.
- Separate SMTP node/worker: ManagedCampaignSender.node.js, campaign-worker.cjs,
  campaign-smtp-executor.cjs.
- Offline runtime package: `.local/campaign-runtime-20261110-v3` (18 source files,
  manifest). Reproducible with campaign-runtime-package.cjs; v3 supersedes v2.

Thirty-one focused tests passed across renewal, existing batch controls and legacy SMTP.
The new cases cover exact-step matching, default-off behavior, one next-step issue,
scope change/revocation before activation, ambiguous publication/installation,
Gmail authority propagation, SMTP admission denial and reply-first lifecycle.
The v3 package includes the current reviewed source; use v3 for installation.
The disabled CLI returned zero campaigns/issues/provider requests before opening a
database connection. The original SMTP worker hash remains
015b7febfd874b7a90490c395796c2c5363c900d158bfb01138408ab336c5832.

Scratch `scratch_contact_refresh_20261108` passed renewal lease, repeated publication,
24-hour cap, authority-omission rejection, stale finish rejection and revocation at
all three send-admission functions, in addition to the 056 checks. Everything rolled
back. Its eligibility port was explicitly mocked to isolate the new guards from a
synthetic plan. This is not evidence of a real lead being send-eligible. Evidence:
`.local/campaign-authority-20261110/renewal-scratch.json`.

## Dashboard and supervision, 10 November

Campaign review now includes exact-scope review and approval, start/pause/revoke,
explicit acknowledgement, and persisted reconciliation after uncertain writes.
The authenticated fixed gateway routes preserve tenant/origin checks. Thirty-one
focused backend checks and seven relevant UI checks passed; production build:
`main.32a08b48.js`. Migrations 056/057 were installed with a fresh backup and
rollback script: `.local/campaign-automation-install-1794320330041/result.json`.
No campaign/plan/approval/activity data changed during installation.

The gateway includes a one-minute renewal supervisor. It starts no timer or I/O
unless EMAIL_CAMPAIGN_RENEWAL_ENABLED is explicitly true, prevents overlapping
passes, and suspends after uncertain publication/installation/lease results.
Three focused supervisor checks passed. The start route also requires a ready
supervisor. Both campaign renewal and manual batch start switches remain false.

## Still unfinished / UNVERIFIED

The separate v3 SMTP runtime is installed and its custom node is present in n8n's
generated type cache. The legacy runtime hash and workflow activation set were
preserved. Backup and verification: `.local/campaign-runtime-install-1794320770791`.
The reload waited for running work to drain; no execution was force-edited or
cancelled. Two transient queued records were absent afterward, so preservation of
that queue snapshot is explicitly not verified. No campaign workflow was created
or activated by this installation. The HTTP type metadata route requires auth;
local generated metadata and readiness were used for the load check instead.

Still UNVERIFIED: actual n8n API installation/activation through the concrete new installer; real
customer end-to-end multi-day execution and thread/reply behavior. No such live
acceptance was claimed. Ready/fresh sender/version gates remain unchanged: changed
or stale connections can stop renewal and require recheck/rebinding/new approval.
An active campaign approval does not bypass those gates or guarantee completion.

Do not enable EMAIL_CAMPAIGN_RENEWAL_ENABLED or run the enabled `--run-local` path
before these integrations and the exact approved customer scope are ready. A normal
disabled invocation is inert. No enabled periodic renewal schedule was created.
