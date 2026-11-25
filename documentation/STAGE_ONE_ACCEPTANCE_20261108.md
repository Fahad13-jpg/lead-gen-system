# Stored pipeline acceptance and queue guards

8 November 2026. Supplements STAGE_ONE_COMPLETION_20261108.md. This is local
integration evidence; it is not a paid provider or cloud deployment certification.

## Accepted changes

- Traced 24 stored searches from staging through org-scoped cleaning links,
  canonical businesses and assessment profiles. Dashboard counts matched the
  independent trace. The inspected database contained zero cross-org cleaning
  links and zero gathering results attached to another org's job.
- Search cards now distinguish distinct existing matches from duplicate source
  records, show final target shortfall only for terminal new/matching-mode jobs,
  and identify historical searches whose mode/result details were not recorded.
  No historical rows or counters were changed to manufacture a successful result.
- Actual SQL ran against isolated scratch fixtures: two staging rows linked to one
  business count once; a good current assessment and a failed refresh can coexist;
  repeated existing rows count once; matching/reuse targets are distinct from new
  targets; cross-org results are excluded; legacy and running shortfalls stay null.
- Five existing workflow JSONs and live workflows now explicitly emit/handle empty
  claim results. Empty queues stop before task processing; malformed nonempty
  claims still fail. No SQL or connections were replaced, no nodes or webhooks added,
  and all notes/credential bindings were retained. Builders retain the correction.
- A live 06A Code node omitted mode; it now explicitly uses its prior default,
  runOnceForAllItems. The local file already used that mode.

Target workflows: 02_main_orchestrator, 03b_email_scraper, 04_data_cleaning,
05_email_validation(Batch), 06A_basic_enrichment. Prior active states were restored;
the disabled paid verification control was not enabled merely because 05 is active.

## Validation and installation

- Seven queue-guard tests passed, including actual Code bodies, idempotence,
  empty input, explicit implicit-mode normalization, retained notes/connections,
  valid tasks and malformed task rejection.
- Twelve dashboard backend tests and seven SearchProgress component tests passed.
  Eight real-SQL scratch scenarios passed; all fixture writes rolled back in
  network-isolated scratch_contact_refresh_20261108.
- Optimized React build passed. localhost:3002 serves main.21787e06.js, HTTP 200;
  anonymous jobs reads remain HTTP 401. Authenticated visual review is UNVERIFIED.
- Workflow import journal and fresh backup: `.local/queue-guards-1794148635413/`.
  It records five verified in-place imports, unchanged graphs/notes/SQL/settings,
  previous active states, unchanged other workflows and unchanged AI/verification
  controls/activity counts. n8n was restarted when idle and health verified.
- Installation caught an implicit live mode after the first import. The journal
  allowed verifying/skipping that import and completing the remaining four.
  Post-restart verification was completed separately, without repeating imports or
  restart; final journal phase is installed_and_healthy at 14:43 UTC.

No provider/model/sending calls were made by installation or acceptance tests.
Existing free basic schedules continued independently. Backups and workflow
snapshots are private and must not be published. Rollback uses the saved before
definitions in the same workflow IDs/projects with their saved active states,
followed by an idle restart/readback; do not restore the whole DB over newer work.

## Convention audit

The user approved preserving parameterized workflow SQL, shared-number business
identity support and no blind retries of paid actor starts. See
WORKFLOW_CONVENTIONS.md; do not reopen these decisions as automatic refactors.

The offline audit inspected eight exports and found no broken connections or
missing local Code modes. Five queue-claim review items are now corrected.
Remaining static review flags are **not 17 demonstrated runtime bugs**:

- Four scraper Save Run/Heartbeat UPDATE nodes deliberately stop on lost-ownership
  zero rows. Their alwaysOutputData convention still needs a consumer-safe review;
  flipping the flag alone would incorrectly continue an unowned run.
- Five Apify GET nodes use current continue-error routing, neverError=false and
  2000 ms retry spacing instead of the earlier specified response policy/3000 ms.
  A targeted HTTP-policy change must test its downstream consumers; it was not
  silently bundled into this queue correction.
- Eight exports have no Error Trigger in their own graph. Existing per-node failure
  routes and SQL lease/stale-job recovery need coverage review; absence of that
  node alone does not establish missing error handling or justify a new workflow.

Private audit evidence: `.local/stage-one-workflow-audit.json`.

## Remaining acceptance boundaries

At 14:41 UTC: 8 basic tasks complete, 27 partial, 7 failed and 2 pending their
normal final retry. No failed task was reset to make the queue appear complete.
Final readback at **14:47 UTC**: **8 complete, 27 partial, 9 failed, zero pending
or processing**. The last two blocked-source checks exhausted their existing three
attempts normally. The refresh queue is drained; the nine failed assessments remain
visible, with earlier evidence preserved. This is not 44 verified leads.

Yellow Pages paid live quality and a new paid dashboard admission through the full
pipeline remain UNVERIFIED. The UI already labels Yellow Pages accordingly; Yelp
is unsupported. The platform-preview credit shortfall was not funded or bypassed.
These configuration/provider acceptance gaps can be parked while independent
strategy-generator development proceeds, but cannot be called completed live tests.
