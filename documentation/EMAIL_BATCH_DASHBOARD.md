# Dashboard control of released email batches — 10 November 2026

Strategy review includes a Released email batches panel. It lists only exact
operator-delegated batches for the verified organization, owner/admin subject and
campaign. Opening the panel reads status; it never starts a workflow. A user must
acknowledge the listed recipients before starting or pausing. The browser cannot
submit workflow bodies, paths, credentials, new recipients or amended release limits.

The existing controller remains authoritative: current membership and delegation
are rechecked, the exact bundle is revalidated against current plans/sender/approval
state, reply monitoring starts first, and sending starts last. Pausing disables only
the send copy. A previously started and paused batch needs a new reviewed release;
there is no automatic resume or enlargement of its scope. Expired batches can still
be paused. Backend and browser both retain uncertain outcomes rather than retrying
automatically. Refresh reconciles actual schedule state, not provider delivery.

## Operator setup — not executed during development

After preparing and installing an inactive pair with the operator CLI, review its
exact bundle digest. The new explicit `authorize-dashboard` command requires the
same active owner/admin subject and `--authorize-sending`. It verifies the pair is
installed and inactive, revalidates current state and records that exact delegation
in the private ignored `.local/email-batch-dashboard.json` registry. This command
does not activate schedules or enable the dashboard start switch.

```powershell
# Example only — do not run without reviewing the batch and its recipients.
node .\scripts\sender-connections\email-batch-operator.cjs authorize-dashboard .local\<batch-dir> --subject=<membership-subject> --ack=<bundle-digest> --authorize-sending
```

Dashboard start additionally requires the server environment variable
`EMAIL_BATCH_DASHBOARD_START_ENABLED=true`. It defaults off and was left off.
The switch prevents start requests; it does not pause already active workflows.
Use the explicit pause operation or existing versioned campaign pause to stop new
dispatches. Removing a delegation file alone also does not stop active schedules.

The registry contains only local artifact references, membership hashes and bundle
identifiers; no tokens/passwords. A customer cannot write it through the API.
Existing JSON files and controller journals are reused; no tables, migrations or
n8n webhooks were added. The controller and dashboard share the bundle directory's
exclusive filesystem lock. A stale lock requires operator reconciliation. Multi-host
shared storage/coordination remains UNVERIFIED.

Fixed authenticated gateway paths:

- GET `/dashboard-api/api/email-batches` — delegated batch status by campaign.
- POST `/dashboard-api/email-batch/control` — exact batch/digest, start or pause,
  with explicit acknowledgement and the same-origin/Bearer checks.

## Validation

Thirty-two backend/controller/HTTP tests and six dashboard/plan-review UI tests pass.
They cover default-disabled start, exact acknowledgement, tenant/role/subject
isolation, reply-first start, pause retention, stale or changed content, uncertain
results, repeated-click protection and browser status reconciliation. n8n and
providers were mocked. These tests perform no workflow imports or activation,
provider calls, inbox reads, sends, migrations or live database writes.

Real batch delegation/install/start and the authenticated browser/provider journey
remain UNVERIFIED. The first-message contract and existing 24-hour rollout expiry
remain unchanged. Multi-day follow-up release management is still unfinished.

Local installation completed: build main.1e818ec1.js is served by the dashboard
gateway, launched with EMAIL_BATCH_DASHBOARD_START_ENABLED=false. Campaign navigation
returned 200 with this bundle; anonymous batch list/control requests both returned
401. The private registry has zero delegated batches. No batch installation,
delegation or activation was performed. Smoke evidence:
.local/email-batch-dashboard-20261110/smoke.json.
