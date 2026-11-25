# Scraper ownership and HTTP safety — 8 November 2026

Installed locally and verified. No model/Apify requests, paid verification or
outreach were made by this work. AI controls and previous active states remain
unchanged. No database migration or webhook was added.

## Result

- Save Run and Heartbeat explicitly emit zero-row results. Each scraper now has
  one **Validate Saved Run Ownership** Code node between Save Run and the poll
  wait. Missing/wrong job receipts fail through the existing Format Failure and
  Mark Failed path. Current Worker State similarly validates Heartbeat receipts
  before routing to dataset retrieval or abort decisions.
- Existing SQL still fences job, org, running state and execution identity. A stale
  error cannot overwrite the current owner. Saved run/dataset IDs survive an owned
  failure in needs_review; no automatic new paid start or charge is introduced.
- Full-response Apify HTTP nodes set neverError=true. Read-only requests use three
  tries and 3000 ms spacing for transport failures. **HTTP status errors are not
  automatically retried by neverError=true**; explicit parsers reject non-2xx
  responses into existing failure handling. Do not describe this as three retries
  of HTTP 429/503. Paid starts remain single-attempt; abort POSTs also retain no
  automatic retries.
- Non-2xx start/status/dataset bodies cannot masquerade as successful responses,
  even when they contain run-like fields or an empty array. Saved-run resume uses
  existing identities without requiring/repeating a start response.
- One guard node and its failure route were added per scraper; the Save Run normal
  edge goes through that guard. Existing SQL, other nodes/routing, credential
  bindings and notes were retained. The build generator retains the changes.

## Authentic test evidence

1. Seventy-seven offline gathering/runtime/safety checks passed, including actual
   Code bodies, status 401/403/429/500/503, existing-run resume, guard rejection,
   graph references and no paid-start retry.
2. The actual Maps and Yellow Pages SQL ran in network-isolated scratch against
   owner/org changes: stale writes and error updates were rejected, current writes
   accepted, saved run retained for review, and no charge created. Fixtures rolled
   back; live DB data was not used as a writable test fixture.
3. A same-image native n8n probe initially **failed**: an exception inside the Wait
   parameter expression did not stop execution. The expression strategy was removed.
   No provider nodes or credentials existed in that probe. The installed interim
   response changes were subsequently superseded by the explicit Code guard.
4. The corrected native probe passed lost-save ownership, lost-heartbeat ownership
   and valid-save cases, including real error-output routing to Format Failure.
   The valid native Wait recorded **15006 ms**, and execution finished successfully.
   Network was none, credentials copied zero, and no live workflow was executed.
   Raw private evidence: `.local/scraper-native-1794150286810/`.

This is evidence for n8n execution semantics and SQL fencing, not a live Apify run
or proof of Yellow Pages actor input/output quality.

## Installation and rollback

Initial response/safety checkpoint: `.local/scraper-safety-1794149725370/`.
Final explicit-Code-guard checkpoint: `.local/scraper-safety-1794150431994/`.
The final release reviewed three workflows, updated Maps/Yellow Pages, and skipped
the unchanged connection workflow. All definitions were read back; other workflows,
SQL, notes, AI/verification controls and activity count matched the baseline.
n8n restarted only when idle and passed its health check. Final journal phase is
installed_and_healthy. Backups/snapshots are private and must not be published.

If rollback is necessary, restore the **original** known-safe pre-expression
scraper snapshots from the initial checkpoint, into the same IDs/project and prior
active states, then idle-restart/read back. Do not restore the intermediate Wait
expression revision from the final checkpoint's before images as a safety rollback.
Do not overwrite newer business data with a full database restore or reset leases.

## Convention audit disposition

All reviewed local Code modes, connection references, queue zero-row guards,
scraper ownership zero-row guards and Apify read HTTP settings now pass the static
audit. The eight remaining flags mean only that exports lack an Error Trigger in
their own graph. Actual handling was reviewed: connection validation/error replies;
orchestrator dispatch failure and stale-job recovery; scraper inline Format Failure
and fenced Mark Failed; cleaning/contact/enrichment bounded lease recovery.
Those flags are not eight demonstrated failures. A future centralized error-alert
workflow is separate work; it must not guess a contact lease or incorrectly fail
another worker's job from an execution error alone.

No new Error Trigger architecture was silently introduced. The existing mechanisms
and approved exceptions are documented in WORKFLOW_CONVENTIONS.md.

Remaining provider acceptance: a new paid dashboard admission through the complete
pipeline and Yellow Pages live actor quality are still **UNVERIFIED**. Existing
credit/budget controls were not funded or bypassed. They remain explicitly labelled
provider/configuration acceptance gaps while strategy integration proceeds.
