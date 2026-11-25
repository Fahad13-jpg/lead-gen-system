# Calling executor connection checklist

Local artifacts: `07g_retell_call_executor.json` and `09d_retell_result_poller.json`.
Both are inactive. The earlier 07f/09c workflows remain read-only previews.
No migrations have been applied live, workflows imported, or calls made.

## Actual flow

Every minute, the executor selects the oldest eligible approved step-1 call for its
explicit organization and credential. PostgreSQL checks current content hash,
approval, fingerprint, expiry, suppression, campaign state, recipient permission,
verified US country and timezone, both calling windows, spacing, daily quota and
funding. It uses the existing global lock to reserve the budget and record attempt 1
in one transaction. Only a confirmed committed result reaches the HTTP node.

Retell receives the approved brief, pinned agent/version and a 60-second duration
limit. A matching receipt is stored. Timeout, error or mismatched receipt cannot
trigger another POST. Crashes before/after the request retain the attempt and budget;
an operator reconciles unknown call IDs. The result poller only looks up known IDs
with the same credential. Ending a call does not release its cost reservation.

Migration 040 settles only verified final all-provider receipts. Provider billing
units, cost coverage and finalization timing remain UNVERIFIED, so automatic billing
conversion is not enabled. Until connected, that gate deliberately stops another
call after an unresolved bill.

## Account setup next

1. Select the Retell workspace/account. Store its API key as an n8n Header Auth
   credential (`Authorization: Bearer ...`); never put the key in workflow JSON,
   campaign JSON or chat. Confirm the existing US number belongs to that workspace.
2. Create and test the English agent using `scripts/calling/AGENT_PROMPT.md`, choose
   a voice, then pin its published ID/version. Dynamic approved brief data must be
   interpolated into the agent prompt as untrusted DATA. Verify the duration setting.
3. Bind the PostgreSQL credential and that exact Header Auth credential on both
   workflows. Set `org_id` and `connection_ref` in Operator binding. The reference
   must equal the actual HTTP credential ID and campaign connection reference. This
   is trusted operator configuration; n8n's generic HTTP node does not inspect
   database tenant ownership of a selected credential automatically.
4. Complete the disabled `scripts/calling/campaign-example.json` in an existing
   campaign config: daily cap, spacing, fresh worst-case quote/buffer, customer and
   plan calling windows, release expiry and reviewed recipient permissions. The
   platform ceiling stays $10/month across all organizations. BYOK uses the existing
   organization-funded ceiling. No free-plan cap or window was invented.
5. For each permitted lead, `recipient_permissions[lead_id]` contains `phone`,
   `country: US`, `country_verified: true`, `calling_eligible: true`,
   `permission_source_ref`, `reviewed_by`, `expires_at`, `timezone` and
   `timezone_verified: true`. These are trusted reviewed eligibility records, not
   values an AI or a scraped phone number can grant. Their legal sufficiency is
   UNVERIFIED until the actual campaign is reviewed.
6. At approved deployment, opt into the generation-time handoff with
   `CALLING_INTEGRATION_ENABLED=true` on n8n. It defaults off and has not been set.
   With reviewed connection/recipient permissions in campaign data, it supplies call
   readiness to v2 generation. For a successful validated call draft only, it clears
   the offline integration marker before storage/hashing. Other blockers and failed
   plans remain unchanged. Generate/review that strategy and obtain its current
   hash-bound approval.
   The plan itself must retain `execution_authorized: false`, as required by
   `strategy_finish`. Runtime authority comes from the dispatcher. Plans with
   `v2_offline_only`, other blockers, stale fingerprints or unreviewed changes remain
   blocked. The default offline strategy generator still emits that blocker. The
   opt-in handoff never mutates an existing approved plan or grants transport
   authority. Old plans require regeneration and approval rather than promotion.
7. Review and apply migrations 037–042 and import workflows only after deployment
   authorization. Keep inactive until the connection check and explicit owned-number
   test are approved. No calls or sending are authorized by this checklist.

Campaign configuration is part of the existing strategy fingerprint. Configure it
before generation/approval; changing it can require regenerated/reapproved plans.
The initial executor handles approved step 1 only. Follow-up intents do not create
automatic calls.

## Booking and opt-out tools

Migration 042 stores one booking claim per call in existing dispatch_metadata. It
serializes claims across organizations sharing a calendar, verifies an owner-offered
slot and recipient confirmation, and blocks overlapping claimed/booked/uncertain
intervals. Tool storage connects the existing mock booking orchestrator to those
functions. Google free/busy is checked before insertion; a confirmed matching event
receipt is required before reporting booked. Uncertain insertions retain the claim
and deterministic event ID, allowing lookup rather than a second insertion. External
Calendar clients can still race with free/busy checks.

`outreach_call_stop` writes a durable existing stop event with tenant/call/connection
binding. Opt-out prevents future calls to the same lead or stored phone within its
organization; it does not silently create a global cross-channel unsubscribe.

An authenticated Retell tool gateway and Google Calendar credential remain required.
The adapter and Google transport are mock-only until connected. No new table or
webhook was added. A public tool endpoint cannot be invented under the existing
no-new-webhooks constraint: select an authorized existing ingress, provider-native
integration, or explicitly approve an ingress change after account setup. Live tool
signature/authentication, agent tool schemas and round trips remain UNVERIFIED.

## Verification

- Final local regression: 88 test entries passed, 0 failed (calling plus native
  strategy, contract and preview tests). No model/provider requests occurred.
- Offline calling tests use only fixtures/mocks.
- calling-reservation-scratch.cjs checks migrations 037–040 and rolls back.
- calling-dispatch-scratch.cjs checks 037–042, dispatcher gates, booking and stops,
  then rolls back.
- calling-concurrency-scratch.cjs creates a temporary clone of the isolated scratch
  database, races two independent dispatch sessions and two booking sessions, and
  removes that clone. It never accesses the live database.

All scratch scripts require `lead_diag_pg_20261011` with network mode `none`.
Provider mappings use the official Create Phone Call and Get Call references:
https://docs.retellai.com/api-references/create-phone-call
https://docs.retellai.com/api-references/get-call
Actual provider receipt shape and n8n execution remain UNVERIFIED until the approved
connected test; local execution of embedded Code and expression syntax has passed.
