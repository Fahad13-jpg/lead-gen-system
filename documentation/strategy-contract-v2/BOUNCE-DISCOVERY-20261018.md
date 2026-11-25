# Bounded mailbox bounce discovery — local implementation

`discoverDeliveryReports` searches an explicitly bound Gmail mailbox through injected list/get methods. It scans at most two pages of 25 message references, deduplicates IDs, uses a fixed timestamp window with a one-second overlap and matches only structured permanent-failure reports tied to the exact original Message-ID and recipient. Reports may be in a different Gmail thread; normal human replies still require the original conversation.

Wrong org/credential/sender context makes no mailbox requests. A page cap, repeated/malformed page token, failed message read or malformed response returns incomplete and no new checkpoint. The caller must persist events before advancing a successful checkpoint. Partial results are not proof that the mailbox is clear. Subject-only bounce inference remains prohibited.

71 local tests pass across MIME/threading, reply/bounce matching, discovery, sender checks and executor safety. Discovery tests use mocks only. No Gmail mailbox was read.

## Integration status

09 now has native HTTP list/get orchestration alongside original-conversation checks. It processes one page of at most 25 candidates per activity per scheduled run, then persists its next-page token and fixed time window in the existing dispatch_metadata JSON. The separately injectable helper remains available for unit tests; native nodes perform the scheduled orchestration directly.

Migration 029 adds compare-and-set checkpoint persistence and requires a complete, recent delivery scan before another email to that contact can begin. Concurrent stale writers are rejected before any stop-event write. Partial scans cannot claim the mailbox is clear; review flags persist across pages. No tables were added. Migration 029 was applied ONLY to scratch_v2_release_20261014 in the network-isolated scratch PostgreSQL container; fixture writes rolled back. It has NOT been applied live.

`test-delivery-checkpoint.cjs` passed SQL checks as the non-superuser scratch runtime role: partial scan blocks, stale writer rejected, fixed-window continuity, final page permits the contact gate, review blocks. A generator bug interpreting SQL regex dollar signs as JavaScript replacement patterns was corrected by callback replacements.

`test-reply-workflow.cjs` executed the actual 09 graph inside a network-isolated n8n container from the installed image, with Gmail and SQL boundaries mocked. Three mixed activities passed: empty page, cross-thread hard bounce, and incomplete paginated scan. This exercises item linkage, both IF branches, aggregation, deduplication and persistence payloads. Raw summarized results: `reply-workflow-results.json`. This does not verify authenticated Gmail behavior.

## Sender setup gaps

Both native workflows still have empty entry gates. They cannot yet select an enabled org sender policy for routine execution. Public campaign normalization currently excludes operator-only email_dispatch settings, so manual policy seeding must not be presented as complete self-service onboarding. The actual Gmail account, consent scopes and desired cap remain unverified. No credentials exported, live migrations applied, imports, activations or sends.

## Remaining release checks

- UNVERIFIED: real Gmail OAuth scopes, account ownership, HTTP response compatibility and live pagination behavior.
- UNVERIFIED: attachment-backed or internationalized delivery reports; these remain review cases, not assumed delivery success.
- An expired pagination token stops the scan. Migration 030 now supplies a bounded, operator-only restart of the same window; see SCAN-RECOVERY-20261018.md. No automatic token reset or dashboard recovery button.
- Sender-policy onboarding, daily-limit confirmation and a coherent reviewed migration/deployment bundle remain necessary before activation.
- 07A sender verification now takes org_id from the lead row after spreading sender fields, preventing nested sender configuration from overriding tenant identity. Covered by a regression test.
