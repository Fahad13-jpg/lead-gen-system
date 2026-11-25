# Manual WhatsApp messages

The user deferred live Meta onboarding until the product has its public domain
and business details. Organization-owned API connections remain in scope; a domain
alone does not establish Meta business verification or permission approval.

Manual click-to-chat is available in Lead details for saved phone-bearing leads.
The user writes a message, confirms recipient/permission/content review, prepares
it, then opens WhatsApp and presses Send there. A copy action is also available.
This uses the user's own WhatsApp client session, not a connected Meta API sender.
It does not queue a campaign, consume messaging-provider credentials, create an
outreach activity or record a claim of delivery, reply detection or consent.

The backend authenticates the active Firebase organization member, reads the
organization-owned lead, and accepts only a saved international phone number.
Spaces, parentheses, dots and hyphens may be removed from an already international
number; local country codes are never guessed. No browser-supplied phone can
replace the saved target. An available contact does not establish WhatsApp account
existence or number ownership; the user checks it in WhatsApp.

Recorded email suppression and same-lead/same-phone reply, bounce, opt-out,
wrong-person, meeting and inbound-review holds block preparation. Checks run again
when preparing the link, and a changed saved target invalidates preparation. This
is a manual composition utility, not a bypass of campaign approval or API admission.
The user can edit/send outside this system after opening WhatsApp; this utility
does not control the external app or know whether Send was pressed.

Fixed authenticated routes:

- GET `/dashboard-api/api/whatsapp-manual?org_id=...&lead_id=...`.
- POST `/dashboard-api/whatsapp/manual/prepare`, with `org_id`, `lead_id`,
  `recipient`, `message`, `acknowledge_manual_contact:true`.

The POST performs SELECTs only and returns a safely encoded `https://wa.me/` link
for one recipient. It does not call WhatsApp. Message/acknowledgement changes and
organization changes clear the prepared link. The UI independently checks the
returned URL/recipient/message and never opens an unexpected destination.

Validation: thirty backend/HTTP checks and seven focused UI checks passed; the
actual local read query passed for a phone-bearing saved lead. No external chat
was opened or test message sent by the assistant. Manual send/reply outcomes
remain external human actions and are not automatically reflected in activity.

Installed locally as dashboard build `main.3fdbc3c2.js` with
`main.904047a8.css`. The production build compiled successfully; prior static
assets were retained and the gateway reloaded with existing email flags preserved.
Runtime HTTP verified the new build and rejected unauthenticated preparation with
401. Installation evidence: `.local/whatsapp-manual-20261115/installed.json`.

## Saved strategy prefill and single-click chat opening

The composer now loads the latest current approved WhatsApp first-message draft
for this organization/lead when available. Its campaign version, expiry, content
hash/integrity, evidence fingerprint, latest approval and empty validation/block
arrays must match. Rendered WhatsApp content is preferred; a draft tied to another
phone is rejected. Other-channel messages are not silently reused as WhatsApp copy.
The UI labels the campaign/plan source and permits manual edits after review.

On Open WhatsApp, the server rechecks the recorded stops, saved target and source
plan/hash. Revoked, stale or replaced source content requires refresh. This read
does not call AI, edit the approved plan, create consent or authorize API sending.
Leads without a suitable approved WhatsApp plan retain the editable empty composer.

After the user clicks Open WhatsApp, a blank tab is opened within that user gesture
and its opener detached. It navigates only after validation of the returned exact
recipient/text/wa.me URL. Errors or unmount close the pending tab. If popups are
blocked, Continue in WhatsApp provides the same prepared link. The final Send
action always happens in WhatsApp; no sent/delivered receipt is fabricated.

Thirty-two backend/HTTP and eight focused UI checks passed. The actual local
strategy-prefill query passed without a suitable WhatsApp plan for the sampled
lead; the populated-draft and tab-navigation paths were exercised with labelled
fixtures, not a live WhatsApp message. No AI/provider calls or DB writes occurred.

The prefill update is installed as `main.363e8bac.js`; the gateway serves that build
and rejects unauthenticated context requests. Prior assets remain available.
Evidence: `.local/whatsapp-manual-prefill-20261115/installed.json`.
