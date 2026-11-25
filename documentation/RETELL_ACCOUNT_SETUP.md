> Current connection status: see [2026-10-28 tool deployment](CALLING_TOOLS_DEPLOYMENT_20261028.md). Earlier local-only statements below are historical.

# Selected Retell workspace

## Verified draft configuration — 2026-10-28

API access succeeded using the user-supplied Desktop key, read in memory without
printing or copying it. Agent `agent_8ad1ab3a505d9b818a8035558e`, version 0, and its
Retell LLM `llm_eae00729378ef3a41dbaf5f113a9`, version 0, are both unpublished.
The prepared dynamic-brief prompt was installed and verified by GET read-back.
English (US), a 60,000 ms maximum, 10,000 ms silence termination, built-in DNC
detection, voicemail hangup and IVR hangup are saved. End Call is configured.
The existing retell-Cimo voice and gpt-5.6-terra model configuration were preserved.
No model inference, telephone calls, publishing, number assignment, n8n imports or
live database changes occurred. Local before/after journal and verification evidence
are under ignored `.local/calling-retell/`; the key is not included.

Calendar and backend opt-out tools, internal org/number binding and billing checks
still require integration before live release. Provider DNC detection is configured;
its end-to-end behavior and synchronization to our database remain UNVERIFIED.

The documented List Agents channel-filter example failed live validation because
the service required an additional `type` property. Its shape was not guessed.
An unfiltered documented POST /v2/list-agents succeeded and allowed checking that
this LLM was not shared with another voice agent before changing it. Optional
begin_message=null is omitted on read-back; the intended dynamic opening is intact.

The manual setup and browser error below are retained as earlier context; API setup
above supersedes the statement that the agent could not be configured.

- Workspace: lead-calling-agent
- Account: anjumfah675@gmail.com
- Retell workspace ID: org_Xbake1BZqTeDM7t8
- URL: https://dashboard.retellai.com/org_Xbake1BZqTeDM7t8/home

The Retell workspace ID is a provider identifier, not our PostgreSQL org_id. Internal
organization mapping is not assumed. No API key is stored in these files.

## Current access blocker

Both browser control and Windows computer-use initialization failed with
`failed to write kernel assets: The system cannot find the path specified. (os error 3)`.
At that point the dashboard was not inspected and no remote agent was created. This is a local
automation-tool failure, not evidence of a Retell login/account problem.

## Short manual setup while browser control is unavailable

1. Open the selected workspace and its Agents area. Create a new single-prompt voice
   agent from a blank configuration; the exact current UI labels are UNVERIFIED.
2. Name it `lead-calling-agent-US-English`. Paste the `general_prompt` value from
   calling-retell-draft.json into the system/general prompt. It includes the
   `{{approved_call_brief}}` variable used by our executor for each lead.
3. Set English (US), choose an available English voice, and set maximum call duration
   to 60 seconds. Add the built-in End Call function. Save as a draft.
4. Share the resulting agent ID and selected voice name/ID so account-specific
   binding can continue. No test calls or number assignment are required yet.

The JSON contains documented API request drafts, not a claimed dashboard import
format. The agent creation request intentionally requires the actual LLM and voice
IDs first. A live model/voice choice and account pricing remain UNVERIFIED.

Calendar and opt-out tool configuration is still required before live release. The
prompt does not claim those tools work when absent. Keep workflows and calling
release inactive. For later API setup, put the API key in n8n's credential store;
do not send it through chat.

API fields were checked against the official Create Retell LLM and Create Voice
Agent references on 2026-10-28:
https://docs.retellai.com/api-references/create-retell-llm
https://docs.retellai.com/api-references/create-agent
