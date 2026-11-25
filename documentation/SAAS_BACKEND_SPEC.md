# Freemium, Standard and Premium backend specification

Status: proposed design for review, 21 October 2026. No migration, workflow import, activation or billing change accompanies this document. Numerical commercial limits and prices are not approved. Existing operating limits stay unchanged.

## 1. Product requirements and boundaries

- One shared n8n/PostgreSQL pipeline; no forked workflow set per subscription tier.
- Every tier permits customer-defined strategy, channel selection, daily maximums, templates and connection of supported customer-owned providers.
- Customer choices remain subject to organization policy, plan allowances, provider capabilities, budgets and execution safeguards.
- Organization is the tenant and provider-account owner. Use org_id; do not revive deprecated user-owned billing or credentials.
- Preserve existing leases, reservations, approval flow, immutable approved content hashes, suppression and uncertain-send handling.
- No new tables or webhooks are authorized. A proposed schema extension below needs agreement before implementation.
- Cloud deployment, payment checkout, Flutter screens and new channel executors are outside the first implementation slice.
- A channel visible in configuration is not necessarily implemented or eligible to execute.

## 2. Evidence from the current implementation

| Area | Observed implementation | Required extension |
|---|---|---|
| Organization | Live organizations has subscription_tier, max_users and credit fields; no general policy/config JSON column | Versioned organization policies and connection metadata |
| Scraping | gathering_accounts, budgets, wallet entries, provider reservations, platform/BYOK modes | Subscription allowance checks alongside existing cost checks |
| Strategy configuration | Versioned strategy_campaign_versions.config JSON with mode, templates, sequence and time zone | Explicit customer control and preservation of custom templates in v2 |
| Planner v2 | native.cjs accepts ai/template; rejects hybrid. contract.cjs builds its own deterministic template | Customer-defined and assisted implementations are not yet complete |
| Email | Deployed Gmail workflows and 21 audited SQL functions; approval/hash, limits, threading and reply checks | Configurable eligibility policy and multiple supported organization connections |
| Contact verification | contact_controls is global; contact attempts/cache include org_id | Per-organization allowance and policy, retaining global emergency controls |
| Enrichment AI | Global controls; requests linked to tasks | Per-org quota via task ownership plus global provider cap |
| Strategy AI | strategy_ai_controls and requests already organization-scoped | Tier entitlement checks without replacing ledger |
| Credentials | Gmail fixed credential binding; Apify key columns exist in database | Secret handling review, ownership mapping and provider-specific adapters |
| Customer API access | Shared integration header for internal webhooks | Trusted membership/role boundary before exposing to Flutter |

Source anchors:
- database/migrations/003_gathering_billing.sql
- database/migrations/005_contact_discovery.sql
- database/migrations/011_enrichment_ai_quota.sql
- database/migrations/015_outreach_strategy.sql
- database/migrations/019_outreach_dispatch_handoff.sql
- database/migrations/026_mailbox_capacity.sql
- scripts/lead-strategy/runtime.cjs
- scripts/lead-strategy/v2/native.cjs
- scripts/lead-strategy/v2/contract.cjs
- scripts/lead-strategy/v2/sender-policy.cjs

These are implementation observations, not a claim that every local feature is deployed. The live email pair is installed but inactive. No current prospect campaign is approved to send.

## 3. Entitlements: what each tier may use

The tier is a product entitlement, not a credential, permission to contact a lead, or provider budget.

| Capability | Freemium | Standard | Premium |
|---|---|---|---|
| Customer-defined strategy | Included | Included | Included |
| Connect supported own accounts | Included | Included | Included |
| Select channels and set lower limits | Included | Included | Included |
| Cleaning, deduplication and provenance | Included within processing allowance | Same | Same |
| Basic email checks | Included | Included | Included |
| Opt-outs, bounce suppression, tenant isolation and approvals | Mandatory | Mandatory | Mandatory |
| AI-assisted/generated strategies | Small configured allowance or supported BYOK | Configured allowance or supported BYOK | Higher configured allowance or supported BYOK |
| Platform-funded scraping | Optional bounded trial allocation | Configured allowance | Higher configured allowance |
| Provider email verification | Optional separately allocated credits or supported BYOK | Same | Included configured credits plus optional BYOK |
| Processing/concurrency, connection count, team seats, reporting | Small/basic allocation | Larger allocation | Higher allocation/advanced features |

All quantities remain commercial decisions. Do not advertise unlimited scraping, calls, AI, sender accounts or provider credits. Do not invent free-tier provider availability.

Separate entitlement to a feature from the amount of included platform funding. A customer may have permission to use verification but zero platform-funded verification credits. Premium does not force strict verification or override invalid-address/opt-out blocks.

Use a versioned, administrator-controlled plan catalog in code/configuration initially. Organization overrides must be explicit, capped and auditable. Billing checkout can update these through a trusted administrative path later; client request bodies cannot select their own tier.

## 4. Policy precedence

Evaluate independently, returning all actionable blockers:

1. Organization active and requester authorized.
2. Operation supported by the deployed executor and permitted by the tier.
3. Provider connection belongs to this organization and has required capabilities.
4. Recipient/channel eligibility and no suppression/stop condition.
5. Approved plan hash and fresh campaign/lead context, if execution is requested.
6. Organization and campaign windows, limits and budgets.
7. Provider, mailbox and global capacity.
8. Atomic reservation, lease ownership and last-moment recheck.

For comparable send caps: effective cap = minimum of plan cap, organization cap, campaign requested maximum and configured provider/mailbox cap. Remaining monthly volume, rolling-24-hour usage, daily usage and spend are separate checks, not numbers to combine without matching units. Enforce the longest applicable minimum spacing and the intersection of allowed sending windows.

Example: campaign requests 50/day, organization permits 30/day and sender permits 10/day. At most 10 are eligible; exhausted monthly credits or a reply can still allow zero. State the binding limit in the dashboard. Never promise the requested maximum will be achieved.

Unknown required configuration must block execution with a reason, not default to unlimited. Preserve current approved limits during migration; new platform-funded capabilities remain disabled until budgets are set.

## 5. Strategy modes and content ownership

Use the existing persisted mode names where practical, with clear customer-facing names:

| Display mode | Existing value | Authority |
|---|---|---|
| Customer-defined | template | Customer supplies exact content and sequence; renderer performs no AI generation |
| AI-assisted | hybrid | Customer locks sequence, channels and template fields; AI can modify only explicitly allowed fields |
| AI-generated | ai | AI proposes content/strategy within customer constraints; approval is still required |

This mapping is proposed, not current v2 functionality. Do not start saving hybrid campaigns for v2 until native validation, planner and output validation support them.

Customer-defined requirements:
- Exact supplied subject/body and follow-ups, with an allowlisted variable renderer.
- Missing required variables produce a review block, never invented values or unresolved placeholders.
- Subject/header injection and invalid lengths rejected; channel-specific validation applies.
- Required opt-out text and sender details are shown in the rendered preview. Do not silently rewrite an already approved message to insert them.
- Claims supplied by a customer are customer assertions, not independently verified business facts. A deterministic validator cannot prove arbitrary natural-language claims true. Preserve provenance, require review and do not describe custom messages as AI/evidence-verified.
- Do not weaken the existing AI observed/offer claim contract to accept arbitrary custom prose. Define a versioned customer-template artifact/validation path explicitly before implementation; preserve readability of v1/v2 plans.
- No strategy-AI reservation or token charge. Optional enrichment AI is a separate setting, not implied by strategy mode.

AI-assisted requirements:
- Allowed edits must be explicit (for example greeting/personalization block); locked fields remain byte-equivalent after rendering/normalization rules.
- AI cannot add channels, change delays, introduce a benefit, increase limits or change the CTA without review.
- An unavailable model fails the AI task or offers a separately acknowledged fallback; no silent substitution.

All modes converge on versioned plans, validation, approval, hash binding and the same executor. Never send follow-up intent text as if it were an approved message.

## 6. Organization-owned connections

Connection metadata: stable connection ID, org_id, provider type, credential reference, identity, capabilities, health, checked_at, configuration version, caps and funding mode. Credentials themselves never enter campaign JSON, frontend storage, logs or preview responses.

Lifecycle: disconnected -> pending_check -> ready; ready can become degraded, reconnect_required or disabled. Readiness is capability-specific: a successful send credential test does not prove inbox access, bounce visibility or reply matching.

| Integration | Needed capabilities and limitations |
|---|---|
| Gmail | Send, mailbox identity, read replies, refresh OAuth; self-service account routing not implemented |
| SMTP plus IMAP/mailbox API | Send and matching inbound access; SMTP alone is not complete automatic-follow-up readiness |
| Apify | Account ownership, provider budget and selected actor/source support; existing BYOK/platform accounting stays |
| AI provider | Supported model/adapter, key, quota and explicit funding; no arbitrary user-controlled HTTP endpoint |
| Verification | Supported provider, expiry/risk mapping and request budget |
| SMS/WhatsApp/calls | Supported adapter, sender identity, event processing and required recipient/channel permissions; current integration readiness must be established individually |
| LinkedIn | Treat current helper/task preparation separately from any supported automatic sending integration |

No arbitrary credential ID supplied by the dashboard may select a sender. Resolve connection_id through trusted org ownership; prevent cross-org reuse. Shared actual mailboxes still require a global mailbox capacity guard, without disclosing another organization's usage or recipients.

Generic dynamic credential selection is UNVERIFIED for the intended n8n architecture. Prototype safely with mocks before choosing between managed credential-bound subworkflows and a trusted provider adapter. Do not deploy a plaintext password pass-through to Code nodes as a shortcut.

SMTP/IMAP hosts create an SSRF/internal-network access risk. Define permitted public destinations, TLS validation, ports, DNS handling and server-side timeouts. Connection checks must never transmit a message without authorization.

Current Apify api_key text columns are a secret-handling review item, not proof of encryption at rest. Do not copy this pattern for new providers. Use managed credential references or approved secret storage and plan any legacy migration separately.

## 7. Email eligibility independent of tier

Proposed policies:

- strict_verified: fresh acceptable provider result, matching address/provenance and all normal contact gates.
- reviewed_basic: acceptable syntax and mail-domain assessment, attributable business source or customer-supplied recipient, recorded review and exact-message approval. Display deliverability_unverified.
- owned_test: explicit bounded test authorization for a customer-owned mailbox; never a general prospect exception.

Basic checks do not prove mailbox existence or ownership. Distinguish DNS temporary failure from a confirmed negative result. Define mail-domain checking correctly, including explicit no-mail domains and valid mail-routing alternatives; absence of one DNS record alone must not become a verified invalid mailbox. No SMTP recipient probing is included by default.

All policies block known invalid addresses, opt-outs, hard bounces, unresolved ownership conflicts and uncertain previous sends. Unknown or catch-all provider results must not be silently treated as strict verification success.

Apply the same policy in contact selection, trust/readiness reporting, strategy channel eligibility, first-send checks and follow-up checks. Existing code currently requires provider_verified in multiple places. Do not change only the last Gmail node.

Keep evidence status separate from execution eligibility. A reviewed-basic address may be eligible under a policy without becoming provider_verified. New basic-check evidence can live in existing lead_contacts.verification/evidence JSON, clearly namespaced and dated.

## 8. Metering and funding contracts

| Meter | Definition | Existing accounting foundation |
|---|---|---|
| New leads | Newly accepted businesses for the org; existing matches separate | Gathering results/jobs |
| Scraping provider cost | Recorded provider spend, independent of lead yield | gathering_costs and wallet entries |
| Discovery/enrichment work | Defined completed operations; avoid charging duplicate replay | Tasks/attempts |
| AI | Operation count plus token/cost evidence where available | Strategy/enrichment AI request ledgers |
| Verification | Actual provider requests; cache reuse distinguished | contact_attempts and verification_cache |
| Email | Initial and follow-up attempts share org/mailbox limits | outreach_activities.dispatch_metadata |
| Future SMS/calls/WhatsApp | Provider-specific billable units, confirmed by adapter | Mapping UNVERIFIED until integration design |

Quota reservation is not automatically a customer charge. For email, ambiguous attempts still consume anti-duplicate/safety capacity. Whether and when a customer is commercially charged must be separately specified. Do not count a provider-accepted email as delivered or read.

BYOK records provider usage for visibility and enforces customer-supplied spending ceilings, but does not debit the platform provider wallet. Platform processing allowances still apply. Never switch funding mode or account automatically after exhaustion.

Admission checks occur both at enqueue and at atomic reservation/begin; previews reserve nothing. Replays use the original request identity. Existing uncertain operations must be reconciled before releasing cost reservations. Cancellation releases only demonstrably unused reservations.

Use explicit accounting windows. Proposed subscription month: UTC calendar month initially; sender daily window: configured sender time zone; rolling 24 hours remains separate. Preserve existing behavior until a reviewed migration reconciles any different current reset calculations. No historical ledger deletion on reset.

## 9. Customer lifecycle and progress

Authenticated organization -> connections -> offer/strategy -> feasibility preview -> persisted job -> gather -> clean -> enrich -> channel eligibility -> render/generate plan -> review/approve -> scheduled execution -> replies/outcomes -> stop or next approved step.

Progress must report separate counts: requested new leads, fetched candidates, new accepted, existing matches, rejected, contact-discovered, eligible, awaiting approval, queued, attempted, provider-accepted, bounced and replied. A denominator for one stage is not the denominator for every stage.

Represent waiting reasons in existing error/metadata fields and dashboard projections initially; do not add new job-state enum values implicitly. Useful reasons: quota_exhausted, budget_exhausted, approval_required, recipient_not_ready, connection_required, provider_unavailable, outside_sending_window, uncertain_attempt_review. Include next eligible time only when known.

Selected channels without readiness stay blocked. Do not automatically substitute SMS for email or call a number because an email is missing. Keep cross-channel stop checks ahead of each action; phone ownership and channel permission are not inferred from public availability.

## 10. Changes, roles and approvals

- Owner/admin manages tier assignment through trusted administration, connections and organization caps.
- Campaign operator may draft within caps; approver approves exact rendered content/recipients. Small organizations may assign both roles to one person.
- Viewer sees progress only. Authorization is server-side, not a hidden frontend button.
- Shared internal API keys must never be embedded in Flutter. Existing org_id body fields are not an authentication boundary.
- Message, sender, recipient, sequence or channel changes create a new campaign/plan version requiring the applicable approval. Never mutate a historical approved body/hash.
- Restrictive policy changes affect unsent work immediately. Increasing caps or downgrading strict verification does not retroactively authorize a blocked plan; revalidate and approve as needed.
- Downgrades preserve data, evidence and receipts. Pause work exceeding new entitlements; do not terminate an uncertain external operation and release its reservation prematurely.
- Pausing sending must not disable necessary reply/bounce ingestion and suppression.
- Deleting or disconnecting a provider should retain audit references and unresolved outcome records. Specify credential retention/revocation behavior before implementation.

## 11. Minimal storage proposal and schema decision

| Data | Proposed home | Change status |
|---|---|---|
| Tier name | organizations.subscription_tier | Existing varchar, default starter, no table CHECK constraints found in read-only inspection; map legacy tiers explicitly |
| Plan definitions | Versioned local administrator-controlled catalog | New local config only |
| Org overrides, revision, connection metadata | Proposed organizations.automation_config JSONB | NEW COLUMN; requires approval, not implemented |
| Campaign controls/templates | strategy_campaign_versions.config | Existing JSON; validator changes required |
| Sender policy reference/version | Campaign config, snapshotted into plan/dispatch metadata | Existing JSON; preserve hashes |
| Usage/reservations | Existing operation-specific ledgers | Extend existing checks; no replacement ledger |
| Contact check evidence | lead_contacts.evidence/verification | Existing JSON; version shape |
| Execution decision audit | outreach_activities.dispatch_metadata | Existing JSON, only where valid dispatch identity exists |
| Secrets | Managed credential storage | Existing n8n credentials for supported integrations; new routing design unresolved |

automation_config would contain bounded connection metadata and policy revisions, not passwords or a growing usage ledger. Updates lock the organization row and use expected revision checks. Historical campaign snapshots retain the referenced policy version and effective decision; current restrictive safety state is rechecked at send time.

The current subscription_tier default is starter. Inventory existing values and agree on their Freemium/Standard/Premium mapping before any migration. Do not silently downgrade an organization, change its approved limits or let an unknown tier inherit unlimited access.

Trade-off: one bounded JSON field avoids new tables for an initial implementation, but weakens relational uniqueness and scales poorly for large connection inventories. Validation and locking must enforce ownership/reference consistency. A normalized connection registry may be appropriate later, requiring separate permission. Do not pretend a JSON object provides foreign-key enforcement.

If no new column is approved, only a local design/catalog and existing single-sender flow can progress. Do not misuse org_name, billing_email, a fake campaign or subscription_tier to store credential registries/policy JSON.

## 12. Implementation order and acceptance criteria

1. Policy resolver and plan catalog offline: pure inputs/outputs, versioned rules, no live mutation. Tests cover restrictive precedence, absent configuration, BYOK funding isolation and all three tiers.
2. Approved storage extension and organization administration: migration only after schema agreement; scratch restore/rollback and role tests before deployment.
3. Customer-defined email path: preserve exact templates, render allowed variables, block missing values, reuse approval/hash/executor. Assert zero model calls and zero AI charges.
4. Shared email eligibility: strict/basic/test policy tests at strategy, first send and follow-up. Confirm negative/suppressed addresses remain blocked in every tier.
5. One additional email connection adapter: choose Gmail multi-account routing or SMTP+IMAP after the credential-routing prototype. Verify cross-org access denial, refresh/disconnect behavior, threading and reply attribution.
6. Enforce per-org contact/enrichment allowances under existing global caps; test concurrency and idempotent reservation/settlement.
7. AI-assisted mode and extra channels after the shared contract works. No need to rewrite existing email execution.

Required scenarios include: two campaigns sharing one mailbox; concurrent last-slot claims; tier downgrade with pending work; revoked credentials; provider timeout after an uncertain send; repeated payment/credit references; cached verification with expiry; time-zone/daylight-saving boundaries; reply arriving just before another channel starts; invalid customer template; disabled AI; permitted feature with zero funded credits; foreign-org connection ID.

Completion means the chosen slice works through its real existing entry points with no bypass of gates—not merely that a new file exists or a mock returns success. External sends/calls require explicit bounded authorization. Do not repeat unchanged passing tests without a new concern.

## 13. Decisions before implementation

Recommended defaults for agreement:
1. Shared strategy controls/BYOK in every tier; tiers vary allowances and funded services.
2. Keep commercial prices and allowances configurable and unset until cost review; preserve current approved caps in the meantime.
3. Premium includes verification credits; eligibility policy remains a separate organization choice. reviewed_basic still requires source/review and all suppression gates.
4. Permit one organizations JSONB configuration column, with no new tables/webhooks, only if explicitly approved.
5. Implement customer-defined email first, then connection routing, before another executor.

UNVERIFIED / open: inventory/mapping of existing subscription-tier values; exact secret-at-rest properties of existing Apify storage; multi-account n8n credential-routing design; provider-specific SMTP/IMAP compatibility; paid-provider prices and billable units; customer-auth gateway implementation; production suitability of non-email executors; final quotas, retention, seat/connection caps and subscription reset policy. These are not silently assumed complete.

## 14. Offline implementation checkpoint

Implemented locally on 21 October:
- `scripts/organization-policy/catalog.cjs`: immutable draft tier entitlements, with commercial limits intentionally null/unconfigured.
- `scripts/organization-policy/policy.cjs`: pure strategy-mode resolution and email policy preview. Explicit legacy-tier mapping, tenant/connection checks, separate quota scopes including reservations, restrictive spacing, AI readiness and provider/platform funding checks.
- `tests/organization-policy/policy.test.cjs`: 21 passing offline tests, including all tiers, quota exhaustion, malformed limits, BYOK accounting, cross-org rejection, send-only connection rejection and preservation of existing safety checks.

The catalog and all input snapshots must be supplied by a trusted backend; this module is not an authentication boundary. `policy_eligible` means only that these preview checks passed. Every result has `execution_authorized: false` and requires existing SQL reservations/rechecks. No counters or wallet balances are mutated. Micro-USD amounts are integer units, not floating USD.

Strategy mode selection is implemented; rendering customer templates and implementing hybrid generation are NOT part of this checkpoint. Current template rendering, verification gates, live settings, SQL and n8n workflows remain unchanged. No new column or migration has been written/applied. No AI, provider, email or database operation is performed by the component or tests. Test allowance numbers are fixtures, not approved commercial limits.

Run: `node --test tests/organization-policy/policy.test.cjs`.

## 15. Customer email renderer checkpoint

`scripts/organization-policy/customer-email-template.cjs` now renders customer-defined plain-text English email and supplied follow-ups locally. It preserves wording/spacing, performs one-pass allowlisted variable substitution, retains explicit delays and windows, and uses no AI. Missing variables, malformed expressions, header/control injection, missing sender/opt-out lines, prohibited phrases, unapproved recognized URLs, length violations and unsupported modes/channels block the entire preview rather than silently changing messages.

Output is `customer_email_preview_v1`, always `execution_authorized: false`. Customer assertions remain unverified; checks do not establish general factual accuracy. Its SHA-256 preview hash is not a substitute for the current SQL plan/content hashes. This artifact cannot be submitted directly to the strategy_v2 email executor. The integration/versioned approval path still needs implementation and review; no existing validator has been relaxed.

A fictional two-step rendered example is saved at `documentation/strategy-contract-v2/customer-template-preview-example.json`. It is not an actual recipient, campaign update or approval.

Validation: 32 tests passed together (11 renderer tests and 21 policy tests). The initial attempt was prevented by an automatic approval-service usage limit; after retry approval, the suite ran successfully. Command: `node --test tests/organization-policy/policy.test.cjs tests/organization-policy/customer-email-template.test.cjs`.

This checkpoint modifies local source/tests/documentation only. Live database, n8n workflows, credentials, subscriptions and sending remain unchanged. Organization configuration storage still awaits the schema decision.

## 16. Local customer-plan adapter

`scripts/organization-policy/customer-plan.cjs` builds a local strategy_v2-shaped save payload from a trusted job/context and freshly rendered customer template. It preserves subject, full body, recipient review metadata, timing and per-step stop conditions. The existing email handoff can extract the exact message artifacts in offline tests.

Custom parts are explicitly `customer_supplied` under validation profile `customer_email_v1`; they are not disguised as observed facts, approved AI offer blocks or standard copy. The unchanged AI schema rejects those parts. This separate path has its own re-render-and-compare validator, which rejects changed text, recipient, campaign version and cleared blockers even if a caller recomputes the local hash. SQL remains responsible for its authoritative plan hash and approval records.

The adapter always includes `customer_template_integration_offline_only`. Current SQL approval rules reject nonempty blockers, and local approval preflight returns no authorization. It is NOT wired into the native planner, imported into n8n, persisted or ready to send. A reviewed routing/persistence change is still required to activate this validation profile; do not merely remove the blocker. This preserves the existing AI contract during local development.

The combined policy/renderer/adapter suite passed 38 tests. Adapter tests cover exact first/follow-up extraction, changed-content rejection, tenant isolation, suppression/reply blockers and rejection by the AI schema. No scratch/live database calls or AI/provider requests were made.

## 17. Local native routing and scratch persistence

This checkpoint supersedes section 16's not-wired/not-persisted status for LOCAL and SCRATCH only. The v2 native planner now routes explicit template-mode email templates through `customer_email_v1`. It sets `wants_ai: false` and no provider request, renders previews using the same renderer, and revalidates the trusted claim before assembling the save payload. Invalid explicit templates fail rather than falling through to generated copy. AI and legacy v1 paths retain their previous behavior.

The local 06C JSON was regenerated: only Prepare Strategy, Validate and Assemble Draft, and Build Preview Code bodies change in this checkpoint. Graph, sticky notes, modes, HTTP node and other node settings are preserved. The bundle uses only its existing crypto dependency; a VM test caught and removed reliance on unavailable `structuredClone` in the renderer.

Validation: 38 policy/renderer/adapter tests and 13 actual workflow Code-body VM checks passed. `scripts/diagnostics/customer-strategy-scratch.cjs` passed 11 checks in existing network-isolated container `lead_diag_pg_20261011`, database `scratch_strategy_v2_20261012`, as non-superuser `v2_scratch_runtime`. It used real campaign save, enqueue, claim, context, AI gate, finish and approval functions. Exact plan-body retention, database MD5 hash, replay behavior, tenant and stale-lease rejection, no AI reservation/allowance increase, and approval denial were verified. All test row changes rolled back; scratch sequence values may advance. Existing campaign-save behavior can create a disabled zero-limit AI control when absent, also rolled back.

No migrations were needed or applied. No live changes, workflow imports, sends or provider calls occurred. The scratch container was started for testing; production containers were untouched.

Remaining: `customer_template_integration_offline_only` stays until the customer-content review/approval contract is implemented and tested. This is a stored draft path, not a send-enabled path. The existing campaign API normalizer trims/normalizes supplied templates and has a shorter subject limit; preserving exact submitted text through that API still needs alignment and tests. Current exact-content guarantees start at the stored campaign configuration. Live n8n execution of this new route and production database compatibility are UNVERIFIED; scratch uses its existing 017-era SQL. Organization policy persistence and commercial quotas remain pending decisions. Hybrid and non-email customer templates are not implemented by this slice.

## 18. Campaign input and customer acknowledgement gate

The local campaign normalizer now preserves template-mode email subjects, bodies and follow-up whitespace instead of trimming messages. Subjects allow up to 200 characters, matching rendered-message validation. Header newlines/tabs, hidden controls, non-object explicit email templates and malformed follow-up arrays are rejected. Missing recipient variables and final rendered-message checks still run per lead. AI/hybrid normalization and non-email rendering remain unchanged.

The native builder refreshes the embedded shared runtime in existing Code nodes and verifies their routing tails are preserved (except the three intentional v2 assembly/preview bodies). No nodes, connections, modes, credentials, sticky notes or non-Code settings were changed. This closes section 17's campaign-input preservation gap locally.

Proposed migration `032_customer_content_approval.sql` extends the existing `strategy_approval(jsonb)` function. For customer content, an approve request requires boolean `acknowledge_customer_content: true` and `acknowledge_customer_content_hash` equal to the current DATABASE content hash. Missing, string-boolean or old-hash acknowledgements fail. Provenance must remain customer-supplied and unverified. Revocation needs no acknowledgement. Existing expiry, organization, content-hash, blocker and fallback checks remain; successful approval still grants no sending authority. The existing approval row records actor and the reviewed content hash only after all checks pass. No new storage is introduced.

Validation: 42 organization-policy tests, 14 actual Code-body VM checks, existing strategy runtime and qualifier regression suites passed. Scratch test `node scripts/diagnostics/customer-strategy-scratch.cjs --review-gate` exercised 032 in a single rolled-back transaction in `scratch_strategy_v2_20261012`, including real normalized campaign -> claim -> template gate -> save. Missing/wrong/string acknowledgements, retained blockers, cross-org access, content changes, expiry, invalid provenance, revocation and the existing fallback gate passed. A deliberately unblocked SCRATCH FIXTURE tested positive approval with `execution_authorized: false`; source builders still emit the integration blocker. Migration DDL and row changes rolled back; no live migration occurred.

Still pending: complete the customer-content executor acceptance/revalidation contract before removing `customer_template_integration_offline_only`; run against the latest email SQL in scratch; then review a deployment package. New live n8n execution and latest-live-schema compatibility are UNVERIFIED. The acknowledgement is a review requirement, not proof that customer claims are true. Organization policy storage, commercial quotas, hybrid support and other customer channels remain separate work. No sending, AI calls, provider spending or live configuration changes occurred.

## 19. Executor customer-content revalidation (local)

`customer-execution.cjs` now re-renders the full customer email sequence from current SQL strategy context before preparing transport. It checks organization, lead, recipient, campaign version, review provenance, suppression/replies/conflicts, message subjects/bodies/parts, follow-up mapping, sending window, delays and stop conditions. Any mismatch or remaining plan blocker rejects the request. Content validity grants no execution authority: the existing SQL begin/lease/quota/approval/contact checks remain necessary.

`email-handoff.executionDraft` applies this check to customer plans; the existing read-only `draft` adapter remains available for previews. The injected email executor now uses `executionDraft`. A narrow local builder changes only the 07A context-select query and Prepare Email Content Code body, preserving connections, sender bindings and all other settings. The main builder also retains these changes on regeneration. AI plans avoid the new customer-only dependency at runtime.

The preview hash now canonicalizes object keys, so PostgreSQL JSONB key ordering cannot invalidate unchanged messages. This changes LOCAL preview hashes; these customer plans have never been deployed. Database content hashes retain their existing behavior.

Validation: 49 organization-policy tests, 14 strategy workflow Code-body tests, and 20 email handoff/executor/release/rollout tests passed. Tests include the actual local 07A content Code body, reordered JSON keys, changed recipients/campaigns/messages/timing, retained integration blockers, and rejection before any provider or database call. The 032 approval and persistence tests passed against `scratch_email_release_20261019`, including revalidation after JSONB storage. This snapshot initially lacked the non-superuser test role's table and organization-row-lock grants. Test-only grants were added within the same rolled-back transaction; this is not a live permissions audit. No migration or grants persisted.

Remaining before activation: verify the complete customer dispatch check/reservation/begin chain with acknowledged content and the existing recipient eligibility rules in scratch, then remove the integration blocker only through a reviewed release. The current builders deliberately retain it. Live execution, live credential permissions and compatibility with changes newer than the October 19 scratch snapshot remain UNVERIFIED. No live deployment, send, provider call or budget change occurred.

## 20. Customer dispatch lifecycle checkpoint — 2026-10-22

The rollback-only harness now supports `--review-gate --latest-email --dispatch`. It passed against `scratch_email_release_20261019` in network-isolated `lead_diag_pg_20261011`. The actual current context rejected the test mailbox with `email_not_freshly_verified`. The positive branch explicitly used a synthetic verified-email context and mock provider receipt; it is not a claim of real mailbox verification or delivery.

Passed lifecycle checks: transport release required, hash-bound customer acknowledgement, reservation, current-context re-rendering, altered-message and sender mismatch rejection, one begin only, mock receipt persistence, follow-up delay, due follow-up, and reply stopping further outreach. Test-only context replacement, grants, configuration, plans and activity rows all rolled back. Scratch sequences may advance. No active leftover scratch client session was present before the resumed run.

This exposed and fixed a local integration bug: customer content validation previously required the plan's release flag to be false, while the existing SQL begin gate requires true for an authorized attempt. The validator now accepts a boolean release flag as data and still returns `execution_authorized: false`; SQL retains authority. It rejects string or missing release flags. Default generated plans and the integration blocker remain unchanged. This does not grant release authority or bypass SQL checks.

After rebuilding local 06C and 07A bundles, 70 combined organization-policy/email tests and 14 actual strategy Code-body checks passed. The real 07A content-node check is included in the 70. An earlier rerun was prevented by the approval service's usage limit; the resumed approved run completed successfully.

Remaining: prepare and review the deployment/release changes, including migration 032 and deliberate removal of the customer integration blocker. The legacy email release manifest does not yet include 032 or the customer strategy dependency; it must not be used to deploy this feature as-is. No deployment or activation has been performed. Live n8n execution, production permission checks and real customer-template delivery remain UNVERIFIED. Commercial tier limits and organization policy persistence remain separate unresolved product/schema decisions.

## 21. Review bundle ready — 2026-10-22

`releases/customer-email-20261022` contains migration 032, complete 06C/07A/09 workflow JSON, deployment/rollback instructions and a SHA-256 manifest. All packaged workflows are explicitly inactive (06C's previously omitted active flag is set false in the package). Helpers are embedded, so this change adds no separately installed worker. The separate `customer-release.cjs` packager verifies exact bytes, closed sender gates, node modes and zero-row behavior, and refuses overwriting an existing bundle. The historical email-only package remains unchanged.

`CUSTOMER_EMAIL_TEMPLATES_ENABLED=true` is a server-controlled opt-in for new customer drafts to reach review under strategy_v2. Unset/false retains the integration blocker. Campaign/user input cannot enable it. It does not authorize sending, activate schedules, change limits, bypass verification or remove existing plan blockers retroactively. Migration 032 must be installed before enabling it. The draft still requires customer acknowledgement, hash-bound approval and the existing separate transport release.

Final verification passed: 72 combined policy/email/package tests, 15 strategy Code-body checks, and rollback-only approval/dispatch tests using the enabled builder path in scratch. The bundle was packed and hash-verified. No live migration, import, flag change, activation or send has occurred. Next step is approval for the local deployment process described in `documentation/CUSTOMER_EMAIL_RELEASE.md`; real customer-template delivery remains UNVERIFIED and requires a separately approved eligible-mailbox test.

## 22. Approved local deployment completed — 2026-10-22 (Asia/Karachi)

Following explicit user approval, migration 032 and the bundled 06C, 07A and 09 workflows were deployed to local Docker PostgreSQL/n8n. Before mutation, all 22 relevant baseline SQL bodies matched, no pending/processing planner jobs or running/waiting/new executions existed, and exact workflow snapshots plus a fresh custom-format database backup were saved under `.local/customer-email-deployment-20261022`. The backup archive catalog was checked; this was not a full restore rehearsal.

The previously active planner was paused. All three imported workflows are inactive, strategy_controls is disabled, CUSTOMER_EMAIL_TEMPLATES_ENABLED remains off, and sending gates remain closed. One n8n restart unloaded prior scheduler registrations. The first host health check timed out; subsequent internal health returned HTTP 200. Read-only verification then confirmed workflow nodes/connections, exact 032 function body, runtime EXECUTE grant and unchanged snapshots of outreach activities, plans, approvals, strategy AI requests/controls and unrelated workflow definitions/activation states.

Evidence: `documentation/strategy-contract-v2/customer-email-deployment-20261022.json`. The deployment script supports a read-only `verify` mode so interrupted verification does not replay imports or migration. No provider calls or emails occurred. This completes the approved inactive local installation; it does not activate automated processing or prove real customer-template delivery. Activation and an eligible owned-mailbox delivery test remain separate authorization steps.
