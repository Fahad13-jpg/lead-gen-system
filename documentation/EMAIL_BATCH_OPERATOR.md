# Bounded email batch controller — 10 November 2026

Implemented locally and tested against mocked n8n responses. **No batch workflows
have been installed or activated by this development pass.** No provider, model,
Apify, inbox or sending calls were made. No migrations or live data writes occurred.

The controller extends the existing email rollout contract. It does not replace
leases, billing, approval hashes, campaign versions, sender checks or quota gates.
A dashboard preflight packet is input for operator review, not sending authority.

## Operator flow

1. Save a ready packet from Strategy review as a local JSON file. Review its exact
   recipients, plan hashes, sender/version and expiry. The current first slice
   permits up to ten first messages, no follow-ups, and an expiry within 24 hours
   and before every selected plan expires.
2. Run `prepare` with the current operator membership subject. It rechecks active
   owner/admin membership, current plan eligibility and sender/credential project
   ownership, then builds an independent Gmail or SMTP send/reply pair. It preserves
   working graphs and sticky notes, adds the batch boundary note and writes inactive
   workflow files in a new ignored `.local` directory. Raw credentials are never
   read. Local artifacts contain credential IDs and recipient data: keep them private.
3. Review `bundle.json`, `send.json` and `reply.json`. `install` requires the exact
   bundle digest. It revalidates current state and creates both copies inactive.
   Existing copies must match exactly; the controller never overwrites changed
   workflows or updates shared source templates.
4. **Only with explicit authorization for the listed recipients and content**, run
   `start` with the same digest and `--authorize-sending`. It revalidates the pair,
   enables reply monitoring, confirms it, rechecks eligibility, and enables sending
   last. Schedule ticks can then send real messages. This is not a dry-run command.
5. `pause` disables the exact send copy and preserves late-reply monitoring. It can
   pause an expired bundle. It cannot recall a message already submitted or stop
   an execution that has passed its final send boundary.

Run from `C:\Users\hp\lead-gen-system`:

```powershell
node .\scripts\sender-connections\email-batch-operator.cjs --help
# Examples only — replace placeholders after review; these were NOT executed.
node .\scripts\sender-connections\email-batch-operator.cjs prepare <packet.json> .local\<new-batch-dir> --subject=<membership-subject>
node .\scripts\sender-connections\email-batch-operator.cjs install .local\<batch-dir> --subject=<membership-subject> --ack=<bundle-digest>
node .\scripts\sender-connections\email-batch-operator.cjs start .local\<batch-dir> --subject=<membership-subject> --ack=<bundle-digest> --authorize-sending
node .\scripts\sender-connections\email-batch-operator.cjs pause .local\<batch-dir> --subject=<membership-subject> --ack=<bundle-digest>
```

The CLI uses the existing local n8n API key privately. It targets only
127.0.0.1:5678 and uses a read-only PostgreSQL connection. This is a trusted local
operator tool, not a customer authentication endpoint; knowing a membership subject
does not authorize a customer. No dashboard start route was added.

## Uncertain outcomes and stopping

Each mutating n8n request is journalled before submission. A lost response is
reconciled by GET. An unknown create/activation/deactivation is held for operator
review instead of being blindly replayed. A per-directory exclusive lock prevents
overlapping operator commands; a crash can leave the lock in place. Inspect the
journals and actual workflow state before manually clearing a stale lock.

If reply activation succeeds but sending cannot be confirmed, reply monitoring may
remain active; inspect both copies before another operation. A paused batch is not
automatically resumable. Prepare a newly reviewed batch after reconciling existing
attempts; never reset or replay uncertain outreach activities. The controller will
not activate sending when the reply copy or credential project fails verification.

## Validation and remaining work

Seventeen focused tests passed: existing preflight/rollout plus the new controller
and operator-loader cases. They cover both provider bundles, unchanged notes/graphs,
changed content or account identity, inactive/idempotent installation, reply-first
start, revocation between transitions, uncertain creates/activations/deactivation,
wrong projects, modified workflows and expiry-safe pause. Provider calls were mocked.
The CLI help and JavaScript syntax checks passed; no mutating CLI operation ran.

**UNVERIFIED:** real n8n batch installation/activation, per-batch runtime send/reply
acceptance and multi-host coordination. Current campaign policy and readiness must
still pass preflight; the controller does not enable paused campaign policy or
refresh stale plans. The first-message slice does not complete multi-day follow-up
release management. Late-reply poll retirement is an explicit later operator task.
Customer-facing campaign start/resume integration remains unfinished. Existing
campaign pause is already in the dashboard. These limitations are not bypassed by
the new operator commands.
