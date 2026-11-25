# Sender setup: local preparation and validation

Implemented a pure sender-policy validator and an offline draft command. The 07A executor reads email_dispatch from the exact organization/campaign/version referenced by the plan. Its native entry gate checks that policy against an explicitly configured workflow mailbox and the workflow's actual credential reference. Missing or mismatched policy yields no eligible item. The binding remains null in the local workflow, and transport still throws EMAIL_TRANSPORT_NOT_ENABLED.

The gate does not decrement quotas or pretend a per-run row limit is a daily limit. Existing SQL begin checks, mailbox locking, rolling quota, spacing, approval, hash, lease and suppression checks remain authoritative. Connected Gmail profile verification still runs after sender selection.

## Preparing a draft

Create an input JSON with these explicit fields:

- org_id: the organization's positive integer ID.
- credential_ref: the n8n Gmail credential reference, never an OAuth token or password.
- sender_email: lowercase mailbox address, without display-name text or aliases assumed equivalent.
- daily_limit: integer 1–9999; existing organization-day quota.
- mailbox_rolling_limit: integer 1–9999; shared mailbox limit over 24 hours.
- min_interval_seconds: integer 1–99999; minimum gap between attempts.

These ranges match local implementation constraints; they are NOT provider allowances or recommended sending volumes. No user's limit has been selected automatically.

Run from the repository root:

```powershell
node scripts/lead-strategy/v2/prepare-sender.cjs input.json .local/sender-review.json
```

The command writes a new file only, refuses overwrites and outputs an enabled=false policy, mailbox binding and execution_authorized=false. It rejects unsupported fields, including accidental OAuth secrets, without printing their values. It makes no network calls or database writes. An explicit enabled input cannot enable its output.

## Release requirements — still pending

Verify the connected Gmail account and required consent scopes. Confirm the organization mapping and limits. Use the existing campaign version/approval process for policy changes; do not mutate an approved historical version to evade its plan binding. Review and deploy the coordinated migrations/workflows separately. Configure matching explicit binding in 07A and 09 only during that release. No migration, credential creation, import, activation or message send is performed by this setup tool.

One Gmail credential remains fixed per workflow instance. This implements operator preparation and validated routing, not self-service OAuth onboarding or dynamic credential selection. The public dashboard must not accept arbitrary n8n credential references as proof of ownership. Display name/company remain part of approved campaign content; this change does not rewrite approved emails or add a From display name.

## Validation

83 mock-only regression tests passed, including invalid limits, disabled policy, tenant mismatch, credential mismatch, secret-field rejection and native gate item linkage. All eight isolated n8n executor scenarios passed using the actual sender-selection gate with a scratch binding: first email and follow-up acceptance/timeouts, empty receipt, rejected persistence, denied reservation and denied begin. See email-workflow-results.json. Authenticated Gmail access and real sending remain UNVERIFIED and disabled.
