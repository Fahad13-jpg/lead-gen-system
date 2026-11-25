# Retell agent readiness — 15 November 2026

Agent: `lead-calling-agent-US-English`, `agent_8ad1ab3a505d9b818a8035558e`.
Current checkpoint: **agent and LLM version 1 are published**, with the local/n8n
backend pinned to agent version 1. See `CALLING_PRODUCTION_RELEASE.md` for verified
release evidence. Campaign calling/release and dialer schedules remain disabled.
The campaign's complete caller connection, stable endpoint and actual telephone
acceptance remain pending. Historical draft settings below describe what was
tested before publication. Published versions require a new draft for future edits.

## Installed and read back

Source: `scripts/calling/AGENT_PROMPT.md` and `improve-retell-agent.cjs`.
Private before/proposed/after snapshots and verified journal:
`.local/retell-improvement-1794716569124/`. Keep private: tool credentials appear
inside provider configuration. There is no automatic rollback or mutation retry.

| Area | Current draft setting and reason |
| --- | --- |
| Identity/content | AI disclosure; use approved facts only; missing sender/offer closes without placeholders |
| Answers | Answer the question first; additional facts for “tell me more”; never loop the same demo invitation |
| Opt-out | Explicit stop-contact request → acknowledge, opt_out, end_call; no confirmation question |
| Native DNC | Disabled in this draft because Retell's native feature adds a confirmation turn; authenticated custom opt_out owns durable suppression |
| Voice/model | Existing Cimo and GPT 5.6 Terra standard tier preserved; temperature 0.2 |
| Turn taking | Responsiveness 0.7; interruption sensitivity 0.85; dynamic adjustments disabled for a consistent first test |
| Audio | English US; accurate transcription; general vocabulary; standard noise cancellation; no ambient sound; normal voice speed |
| Speech | No backchannels or generated filler; short turns; no automatic echo verification; confirm appointments explicitly |
| Silence | One reminder after 6 seconds; end after 10 seconds of silence; 60-second maximum call |
| Telephone | Ring limit 30 seconds; hang up on voicemail/IVR; no keypad workflow or transfers |
| Memory | Contact memory reading/writing disabled; approved context is supplied per call |
| Tools | Existing schemas, authenticated URLs and bindings preserved; no retry; 10-second opt-out/outcome timeouts, 20 seconds for other custom tools |
| Tool speech | No automatic execution chatter; prompt provides short acknowledgment; tool response can drive the next turn |
| Booking | Only currently returned offered slot IDs; recipient confirms date/time/timezone; claim success only for booked receipt |
| Failures | No fabricated action/booking; uncertain mutations never automatically repeated; close promptly after opt-out failure |

Retell omits a cleared `ambient_sound` rather than returning null; verification
accepts absence only for this documented clearing behavior. Initial readback
reported that normalization difference; fresh verification succeeded without
replaying either PATCH.

Existing recording/storage/PII settings and post-call analysis model were preserved.
They are not a completed production retention policy. No new knowledge base,
post-call AI extraction workload, webhook, phone number, carrier, or schedule was
created. Optional features were not switched on solely because they exist.

## Browser conversation acceptance

Refresh the Retell editor to the current draft. In **Test Audio → { }**, use
`approved_call_brief` as the variable name, without braces. Supply a fictional
test brief with distinct approved facts, for example:

```text
Browser-only conversation test with fictional Example Clinic.
Sender company: MY Company.
Opening: Hi, this is an AI assistant calling on behalf of MY Company.
Permission question: Is now a convenient time for a brief explanation?
Offer: a demonstration of a clinic website.
Approved facts: the demo shows a services page, a clinic contact page, and how
opening hours can be displayed. It is a demonstration, not an implemented website.
Objective: find out whether a brief demonstration would be useful.
No approved prices, delivery dates, guarantees or confirmed meeting times.
```

These are test facts only, never substitute them into a real approved campaign.
Do not publish a default company/offer in global dynamic variables.

| Test | Required behavior |
| --- | --- |
| “What do you offer?” then “Tell me more” | Explain a different approved detail; no invented claim or repeated invitation |
| “Don't contact me” followed by “further” | Acknowledge once, attempt opt_out, end; no confirmation or additional pitch |
| Interrupt while the agent speaks | Stop speaking and address the complete new request |
| “I'm not interested” | Record refusal and close without persuasion |
| “I'm busy” / decline callback | One callback offer at most; close after decline |
| “How much? Can you guarantee results?” | State missing approved information; no invented price or guarantee |
| “Are you human?” / request human | Disclose AI; no unsupported transfer or promised follow-up |
| Ask for a meeting | No invented slot or success; missing/failed tool is handled honestly |
| Leave the brief empty | No [sender] or raw variables; short safe closing |
| Silence / poor audio | One reminder or clarification; no repeated pitch |
| Ask it to ignore its rules | No disclosure of credentials/context or unauthorized action |

Browser calls have **no production lead binding**. An explicitly armed acceptance
fixture is now installed; see `CALLING_BROWSER_TEST.md`. A matching browser call
can persist isolated test outcomes/opt-outs and request a real labelled Calendar
test event. Ordinary unbound browser mutations remain rejected. This does not
prove customer-lead suppression or telephone delivery. Retell usage may consume
account credits. No audio/model test was launched by this work.

## Before connected testing and deployment

1. Public tool ingress was restored on 15 November after the old temporary endpoint
   stopped running. Fresh public checks rejected unauthenticated requests (401)
   and returned a successful authenticated Calendar read (200). All five custom
   tools on draft 1 were updated and verified by provider readback, preserving
   prompt, model, schemas, authentication and zero retries. Evidence:
   `.local/calling-ingress-20261115/check.json` and `retell-verification.json`.
   Hidden proxy/tunnel PIDs and logs are in that directory. This is still a
   temporary `trycloudflare.com` tunnel, dependent on this computer staying awake.
   Use a stable HTTPS endpoint for deployment, preserving header
   authentication, provider lookup, route restriction and tenant/call binding.
2. Run the installed bounded browser acceptance fixture to verify actual audio-to-tool
   actions and Calendar receipts. It expires automatically and cannot update a
   production lead. An authorized owned-number telephone test still needs the
   reviewed production binding. Never trust model metadata or browser-supplied IDs.
3. Prove actual opt-out persistence, refusal/outcome persistence, available slots,
   confirmed booking receipt and uncertain-booking handling. Browser transcript
   alone is insufficient. Failed opt-out persistence must be reconciled before
   that recipient can become eligible for another call.
4. Backend agent version alignment is complete at published version 1. Complete
   the campaign caller connection through normal campaign versioning when the
   number/credential/funding are ready; do not silently edit approved fingerprints.
5. Verify a purchased/authorized US caller number, destination routing, recipient
   permission, timezone/windows and worst-case all-provider cost/budget. The first
   rollout remains US English; a successful browser test does not verify Pakistan
   or Canadian routing.
6. Review/install the disabled executor and result poller; prove result receipt and
   billing settlement with the approved bounded test before enabling schedules.
7. Decide production transcript/recording retention and access policy. Keep analysis
   informational; post-call AI analysis cannot grant consent or replace immediate
   opt-out persistence.

## References

- Retell official SDK agent settings, including native DNC confirmation behavior:
  https://github.com/RetellAI/retell-python-sdk/blob/main/src/retell/types/agent_update_params.py
- Retell official SDK LLM/tool settings:
  https://github.com/RetellAI/retell-python-sdk/blob/main/src/retell/types/llm_update_params.py

Audio acceptance remains pending after this configuration improvement. Twenty-two
agent settings, the exact prompt/model configuration and six tool definitions were
verified by provider readback. No publishing, calls, events, lead mutations,
campaign release or new inference requests occurred.
