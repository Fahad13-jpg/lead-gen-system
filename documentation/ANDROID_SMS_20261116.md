# Customer-owned Android SMS

The selected first device route is SMSGate with one existing Android phone and
one selected SIM per organization. SMSGate, the mobile carrier and Android impose
their own requirements; application quotas do not grant carrier permission or
guarantee delivery. Gateway software is separate from SIM balance/package costs.

## SMS copy and strategy

SMS uses the existing native strategy agent, factual claim checks and content
approval. It receives channel-specific instructions: short plain text, early
sender identification, one concise approved benefit, one low-friction question,
and opt-out wording. It does not use an email subject, quoted website passage,
paragraphs or formal email sign-off. Approved factual parts cannot be invented or
silently rewritten. Long campaign copy must be revised and regenerated.

Illustrative format, not a message sent during implementation:

> Hi, Fahad at Studio. We build clear business websites. Open to a quick chat? Reply STOP to opt out.

Single-step, AI-mode SMS campaigns are supported for this first device rollout.
Drafts require a Pakistani mobile number in international format. At most two
segments are permitted: GSM-7 extension characters count twice and Unicode uses
UCS-2/UTF-16 length accounting. A 306-character string is not necessarily two
segments. The exact rendered text, recipient, encoding and segment count are
saved in the hash-bound SMS artifact. Existing email/other-channel plans are not
converted into SMS approvals. No live AI request is required to save a campaign.

## Connection, limits and execution

Settings contains a phone connection form for the SMSGate Cloud username/password,
device ID, selected SIM number, sender phone and webhook signing key. Credentials
are authenticated with the provider's device listing, encrypted with AES-256-GCM
bound to organization/device, and never returned by the dashboard API. Device IDs
and sender phone numbers cannot be shared across organization connections. The
operator must preserve `.local/sms-gate/encryption.key` with encrypted database
backups and use an appropriate deployment secret store later.

Default organization allowance is 20 submissions and 40 SMS segments per rolling
24 hours, at least 60 seconds apart. These are our application defaults, not a
verified Zong/Ufone entitlement. Admin-configurable ceilings are 100 submissions
and 200 segments. Attempts, including uncertain/failed attempts, consume the
rolling allowance conservatively. One device's allowance is shared by its team.
The initial UI slot is weekdays 10:00–11:00 Asia/Karachi; hours/timezone can be
changed. Changing limits or pausing versions the connection and cancels queued
releases. It cannot recall provider/device submissions already in flight.

After approving content, the owner/admin queues the exact plan, acknowledges a
real SMS submission and records a recipient permission reference valid for up to
seven days in the current UI. Preparation does not establish permission. The
queue rechecks actual current plan integrity/hash, current campaign version,
latest approval, context fingerprint, expiry, recipient, known stops and recorded
permission before submitting. A unique org/plan release and live recipient binding
prevent duplicates. Revoked, changed or stopped queued plans are cancelled.

The server worker runs while the dashboard is closed. It checks selected-device
activity, a recent signed health heartbeat, the sending slot, limits and spacing.
Offline phones wait. Submitted messages use a stable client ID and an absolute
provider expiry of at most one minute or the current slot boundary. Later carrier
delivery remains possible after sending; this is not a guaranteed delivery time.
One unresolved submission per organization blocks another submission. Exceptions,
timeouts and uncertain acknowledgements are not automatically retried. Read-only
provider status reconciliation backs off and is bounded at 20 automatic checks;
unresolved records remain visible and require review, rather than becoming retries.

## Replies, privacy and setup boundary

The receipt server listens on port 3012 at `/sms-gate/events/<callback-id>`. The
operator configures a reachable HTTPS base in `.local/sms-gate/config.json` as
`callback_base`, reverse-proxying this fixed route to port 3012. It must not expose
the localhost dashboard's HTTP credential form publicly. Configure the public
HTTPS dashboard independently during deployment.

Check phone and register reply events registers only the selected device's SMS
received/sent/delivered/failed/cancelled and system:ping callbacks. The phone app
must have Ping enabled (for example, every 60 seconds) and the matching webhook
signing key. Signed healthy pings establish callback reachability; stale or missing
heartbeats block sending. A configured cloud account alone does not establish a
live phone, working SIM permissions or synchronized incoming-message delivery.

Callbacks verify HMAC-SHA256 over the raw body plus timestamp, reject stale/invalid
requests, check device and selected SIM, and deduplicate event IDs. The app can
forward incoming texts from a personal phone: users must explicitly acknowledge
this. Unmatched personal messages are discarded without retaining their bodies
or sender metadata in our database. Matched recipient replies are retained and
stop subsequent contact. STOP/opt-out language is persisted independently. The
linked outreach activity gets a reply/stop record so existing channel gates can
observe it. In-flight messages cannot be recalled after a late reply.

Provider acceptance means queued, not sent or delivered. Multipart delivery
callbacks are per part and do not alone establish complete delivery; aggregate
status reconciliation establishes that result. Normal replies also pause the lead.

## Verification and remaining acceptance

Focused checks cover SMS-specific copy, segment boundaries, slots/expiry, credential
binding, HMAC, uncertain-send behavior, HTTP authorization and UI acknowledgement.
Rollback-only real database checks cover duplicate releases, current plan checks,
rolling quota, organization isolation, personal-text discard and signed STOP
persistence. Provider/model responses were mocked; no real SMS or AI request was
used for these checks. The old unscoped Twilio SMS workflow remains inactive.

Real-phone acceptance remains required: connect the selected SIM, configure the
reachable signed callback endpoint, verify the heartbeat, and explicitly authorize
one owned-recipient SMS followed by reply/STOP verification. No real recipient is
queued by installation. Automatic multi-step SMS follow-ups, multiple devices,
dual-SIM routing and managed-provider onboarding are not implemented in this first
rollout and remain separate work; SMS must not be called fully accepted yet.

Provider references: [SMS API](https://docs.sms-gate.app/integration/api/),
[signed webhooks](https://docs.sms-gate.app/features/webhooks/),
[queue expiry](https://docs.sms-gate.app/features/sending-messages/),
[device Ping](https://docs.sms-gate.app/features/ping/).

Connection diagnostics refinement: failed device lookups occur before any account
write and now return a definitive login-rejected/device-lookup error. Unknown
database commits keep the existing uncertain-result lock. Provider logs contain
only fixed operation/status codes. The form enforces a 32-character signing-key
minimum and explains that it is separate from the Cloud password. Device metadata
must contain the selected SIM; webhook registration uses the documented device_id
field to avoid all-device subscriptions. Focused provider, routing and UI checks
passed. Build main.136d9b2d.js is served; no SMS was sent by verification.

17 November device selection: the repeated verification failure was specifically
device_id_not_found after a successful authenticated device-list response. Settings
now offers Load my SMSGate phones, a read-only authenticated device discovery
action. It returns only device ID, bounded name and supported SIM slot numbers;
passwords, signing keys, phone numbers, ICCIDs and encryption keys are excluded.
A single registered phone is selected automatically; multiple phones require a
selection. Credential edits invalidate the device list and ownership review.
Connect still re-verifies the exact device and selected SIM before saving, and
discovery creates no connection or SMS. Focused provider/route/UI checks passed.

### Temporary SMS ingress — 2026-11-17

After explicit user approval of Cloudflare carrying SMS event contents/metadata, a temporary quick tunnel was started for the SMS callback listener on port 3012 only. It does not expose the dashboard or n8n. The local callback base is configured in ignored `.local/sms-gate/config.json`; process/evidence files are under `.local/sms-ingress-20261117/`. Encryption and signing keys were not copied into tunnel configuration or logs.

The public endpoint rejected an unsigned callback with HTTP 403. All six device-specific callbacks were registered with SMSGate. Organization 1 remains paused on SIM 1, with zero dispatches. A genuine signed phone heartbeat is still pending; no synthetic heartbeat or SMS was submitted. On the phone, enable Settings → Ping with a 60-second interval, keep Cloud service running, then refresh dashboard SMS settings. Verify callback and fresh heartbeat before any separately approved send test.

This is temporary local acceptance infrastructure. If the quick tunnel stops or changes address, callback configuration/registrations need reconciliation before further use; a stable HTTPS endpoint remains deployment work.

### Callback binding correction — 2026-11-17

Live readback showed that the prose guide's `device_id` registration field was ignored: six callbacks had the intended URL but no device binding. The current official OpenAPI `smsgateway.Webhook` schema specifies `deviceId`. Corrected the provider to use that field and verify each creation response matches the selected device, URL and event; a successful HTTP status alone is insufficient. Removed only the six unbound registrations for this exact local callback URL and recreated them for the selected phone. Live GET confirmed all six exact device bindings. This supersedes the earlier assumption that registration success proved device scope. Fourteen focused SMS tests passed, including rejection of an unbound creation response without retries. Phone remained paused and no SMS was sent. Genuine signed heartbeat acceptance is still required.
