# Gathering recovery and cost summaries — 17 November 2026

This completes a focused recovery-hardening pass for the existing four bounded
search workers. It introduces no new source, schedule, paid run or retry loop.

## Worker safety

Every worker's Saved Run branch now treats **any** non-null provider reference as
evidence of existing work. A partial pair, blank or malformed reference cannot
fall through to Start Apify Actor. Parse Run validates both saved IDs and resumes
only that exact pair. New start receipts also require valid string IDs. Errors
follow the existing review path; paid starts still have no automatic retry.

The four installed worker definitions were backed up and read back after update.
Only Saved Run branching and Parse Run code changed. Credentials, ownership
guards, settings, existing edges and activation were preserved. The deployment
builder and repository workflows carry the same guards. The operator safety
helper now compares identical code across CRLF/LF line endings; other guard
changes still fail validation.

## Recovery SQL

Migration 069 strengthens the existing `gathering_recover_v3()` function:

- Inconsistent queued work with a start time or saved provider reference becomes
  Needs review. Pending work with provider references but no recorded start also
  requires review. Neither is reclassified as an unstarted, zero-cost job.
- Automatic pre-claim redispatch requires no start time, no run ID and no dataset
  ID. Missing heartbeat falls back to dispatched/created time.
- Started stale workers use the recorded start time when heartbeat is absent.
- Queue expiry assigns zero cost only when the job is provably unstarted and has
  no provider references. Unknown costs/reservations remain unresolved.
- Recovery is scoped to the current bounded pipeline (`billing_mode IS NOT NULL`).
  Legacy rows remain untouched. Function owner and grants were preserved.

No current bounded jobs were pending/running during installation. Existing legacy
pending rows were not interpreted as active current-pipeline executions.

## Read API additions

`GET /dashboard-api/api/jobs` adds:

- `lifecycle`: fixed status, reason, labelled next action, and whether provider
  references are recorded/incomplete/missing. Stale workers, unknown paid starts,
  incomplete references and unsettled terminal cost point to review, never retry.
- `billing`: recorded provider ceiling/cost, recorded platform ceiling/charge and
  billing mode. Missing or invalid amounts are `null`; a recorded zero remains
  zero. A ceiling is not a charge, and these fields do not verify a live balance.

Provider IDs, internal assessment flags, raw errors, request settings and credentials
are not returned. All joins/reads retain organization scope. Gathering completion
does not assert cleaning, assessment, contact verification or outreach completion.
Existing frontend consumers remain compatible; dashboard rendering of these new
summaries is deferred to the planned UI work.

## Verification / recovery

One hundred relevant code checks passed across runtime, worker ownership/safety,
status projection and tenant-scoped data reads. Eight rollback-only database cases
covered pre-claim redispatch, partial references, an old started queue, genuine
unstarted expiry, missing heartbeat, known-run resume, a fresh worker and a legacy
row. Costs and provider references were retained in all review cases. No fixture
committed. Ten actual read-only job projections and the API auth guard also passed.

The first SQL probe exposed inconsistent timestamp parameter inference in the
fixture and rolled back before installation; explicit casts corrected the fixture.
There was no uncertain installation retry. Write/readback evidence, rollback SQL
and worker snapshots are in ignored `.local/job-recovery-20261117/`.

Before rollback, check for newer workflow/function changes and active current jobs.
Use only the saved function/worker definitions after review; never overwrite the
whole database or discard provider references/unsettled reservations. Calling/SMS
live acceptance and calling final-cost integration remain separate unfinished work.
