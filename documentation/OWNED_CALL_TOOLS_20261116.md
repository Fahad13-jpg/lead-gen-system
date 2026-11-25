# Organization-scoped calling tools and Calendar

The existing tool worker now resolves the enrolled account from `calling_accounts`
using its trusted workflow deployment scope. It decrypts that organization's saved
Retell key inside n8n and derives the exact current account-version reference.
Disconnected accounts, foreign organizations and changed published agents cannot
fall back to operator credentials. Browser-test isolation remains unchanged.

Each trusted workflow can select a fixed backend ID, choosing an operator-owned
private configuration and that workflow's Calendar OAuth credential. Model input
cannot select a backend, organization, Calendar credential or key. The existing
legacy deployment remains pinned to organization 1. Other organizations still
need their own provisioned backend and Calendar authorization; this is not a
self-service customer Calendar OAuth flow.

Authenticated connection checks return non-secret account/agent/reference metadata
and the available calendars. The dashboard rejects mismatched account versions,
references or organizations before listing calendars. These checks create no event
and never mark a campaign ready to dial.

## Installed and verified

- Organization 1, enrolled account version 1 and published agent version 1 resolve
  through the vault. Two writable calendars were confirmed.
- The local n8n worker and dashboard loader passed live read-only checks. The
  Calendar API still rejects anonymous requests. Scoped resolver, gateway and
  Calendar tests passed, including foreign/stale backend response rejection.
- Custom modules and the owner-only vault key were installed in the local n8n
  container with private rollback copies. A guarded graceful reload preserved all
  workflow definitions/activation. The old schedule record had no executed nodes;
  no execution was cancelled or deleted by the installer.
- No Retell agent publication, campaign change, phone call or Calendar event was
  performed. Calling remains disabled and no transport authorization was added.

## Public callback remains unavailable

The user approved one read-only check to the agent's existing temporary tunnel.
The authenticated attempt could not connect; a subsequent credential-free DNS
lookup returned ENOTFOUND. No authenticated retry was made. The local proxy/tunnel
process was also unavailable. Local backend health does not prove public reachability.

Leave the stable public callback URL and corresponding agent-version update for
deployment, as requested by the user. Until then, do not run a phone or browser
booking acceptance test that depends on the old public callback. A transport trust
record was not saved; the approved public check did not authorize that extra write.

## Next local step

Calling campaign 3, "MY Company", can load its writable calendars. The owner must
select the desired calendar and actual offered availability. Saving creates a
paused campaign version and no event. Stable ingress, number/route/caller proof,
funded quote, current approved plans/recipients, live acceptance and final provider
cost settlement remain before unattended calling.

Evidence: `.local/owned-call-tools-20261116/` contains the runtime journal,
source backups, workflow definition hash, local verification, single-public-check
attempt/outcome and dashboard verification. Transport configuration is unchanged.

Calendar retention refinement: first-time account binding now retains an existing
Calendar selection only after fresh writable access, future-slot validation and
an exact organization/account/agent/reference check. Reads happen before the
global call lock; campaign and account versions and the Calendar snapshot are
rechecked under lock. Account updates/disconnect still clear Calendar readiness.
The real saved campaign 3 selection passed read-only validation with one future
slot; no binding or campaign mutation was performed. Focused binding/Calendar
checks passed and the gateway was reloaded.
