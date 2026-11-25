# Retell tool backend connection — 2026-10-28

Current checkpoint, 15 November: the improved tested version 1 is now published
and the backend is pinned to it. See `CALLING_PRODUCTION_RELEASE.md`.
The temporary public ingress was restored and five custom tool URLs were updated
with exact readback. Public authentication rejection and Calendar access passed.
Browser mutations require the isolated expiring acceptance fixture; its opt-out
and Calendar booking tests passed. Telephone dialing remains disabled.
See `RETELL_AGENT_READINESS.md` for current release requirements.
The historical settings/results below describe the October installation.

This status supersedes earlier local-only statements in CALLING_EXECUTOR.md,
CALLING_FEATURES_LOCAL.md and RETELL_ACCOUNT_SETUP.md.

## Applied and verified

- User explicitly approved one authenticated tool webhook, calling functions and
  a temporary HTTPS tunnel. No new tables were added.
- Full live `lead_db` backup was saved and its archive list verified before applying
  migrations 037–044 in one transaction. Twenty `outreach_call_*` functions exist.
  These migrations are now applied to live, despite their original draft headers.
- Workflow `retellCallToolsV1`, **Retell - Authenticated Call Tools**, is active.
  Its source is `workflows/09e_retell_call_tools.json`; the export intentionally
  retains `active:false` so importing elsewhere cannot enable it accidentally.
- Custom node `CUSTOM.managedCallTools` runs inside n8n, using its existing
  PostgreSQL and Google Calendar credentials. No separate dialing service runs.
- The proxy forwards exactly POST `/tools` to the new webhook. Other routes,
  including the n8n UI and other existing webhooks, are not exposed by this tunnel.
- A random private header token is required both at the proxy and inside the node.
  Before a lead write, the node also retrieves the call from Retell, pins agent
  and version, requires an ongoing call, and resolves one existing org-bound
  activity by its stored provider call ID and configured connection reference.
  Model-supplied organization, calendar and activity IDs are never trusted.
- Retell agent `agent_8ad1ab3a505d9b818a8035558e`, unpublished version 0,
  has the updated prompt and five custom tools: get_available_slots,
  book_meeting, record_outcome, request_callback, opt_out; end_call is preserved.
  Readback verified the tool settings, secret header, URL and prompt, model/voice
  preservation, and unchanged unpublished response engine.
- Tools use the documented `{name,args,call}` envelope, POST, 45-second timeout
  and zero automatic retries. Retell strips `format: date-time` from schema;
  strict timestamp, timezone and recipient-confirmation checks remain in JS/SQL.
- Calendar list access passed using the existing OAuth credential (five calendars).
  No event was created, email sent or phone call placed.
- Hashes of all other workflow definitions/activation states, activities and plans,
  plus the AI-request count, matched the pre-deployment snapshot after setup.

## Tests and limits

110 offline Node tests passed, including four new gateway tests. Scratch SQL
feature tests passed and rolled back (identity, outcomes, callbacks, approved
follow-up dispatch, DNC and stop persistence). Both local and public endpoint
checks passed for authentication rejection, Calendar access and invalid identity.

Browser calls intentionally have **no live lead binding**. A dashboard browser
call can test conversation, but its tools currently return an explicit refusal
to write real lead outcomes or book events. This is not a completed browser
end-to-end tool test. Controlled browser-test binding and owner-selected calendar
slots must be set up before testing those effects. No simulated booking is
reported as a real booking.

Still UNVERIFIED: provider-origin tool execution during actual audio, end-to-end
booking and opt-out on a real bound call, final provider billing mapping, telephone
route and eligibility. Outbound dialer and poller workflows were not imported or
activated; no calling release, number or budget authorization was created.

The endpoint uses a private header plus provider call lookup; it does not verify
Retell's HMAC signature. The signing-key badge is UNVERIFIED. No raw request body,
auth headers or execution output is retained in n8n execution logs by this workflow.
Metadata execution records still exist. Never enable payload saving for it.

## Operational notes and rollback

Ignored `.local/calling-tools-20261028/` contains the backup, before snapshot,
applied SQL, function rollback SQL, progress, private configuration, remote before
backup, Calendar check and sanitized verification reports. Protect this folder;
it includes secrets and the database backup. Do not publish or commit it.
The container private config is node-owned mode 0600. No credentials are in the
workflow JSON or tracked source. The temporary URL is recorded in `tunnel.json`.
The proxy/tunnel are hidden local processes; their PIDs are recorded there.
They depend on this computer staying awake and are not cloud deployment.

To disconnect, stop only those recorded proxy/tunnel processes after confirming
their executable identities. Deactivate only `retellCallToolsV1`. Restore the
previous LLM prompt/tools from the private remote backup using PATCH, preserving
agent/model/voice and unpublished status. Do not blindly rerun configuration:
the setup script refuses replay if its before-backup already exists. A temporary
tunnel URL changing requires an explicit tool URL update and readback.

Function removal is optional and must first confirm no live calling activity or
dependency exists. Review `rollback-functions.sql` and apply it transactionally;
do not drop shared tables or restore the entire backup over newer lead work.
The full backup is disaster recovery, not the routine rollback path.

Read-only rechecks:

```
node scripts/calling/deploy-tools.cjs verify
node scripts/calling/connect-retell-tools.cjs verify
node scripts/calling/check-tools.cjs
```

The first compares the original snapshot and will flag legitimate later changes;
inspect differences instead of trying to restore old state. The endpoint checker
performs Calendar reads, never event insertion. Do not print private.json or
remote raw backups.

Provider references:
- https://docs.retellai.com/build/single-multi-prompt/custom-function
- https://github.com/RetellAI/retell-typescript-sdk/blob/main/src/resources/llm.ts
- https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query
- https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
