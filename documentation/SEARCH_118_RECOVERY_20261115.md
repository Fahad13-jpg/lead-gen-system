# Search 118 — provider authorization recovery

The user started one BYOK Google Maps search for five dental clinics in Islamabad
with fifteen candidate records and a $0.50 provider ceiling. It reached n8n's
Start Apify Actor and failed at Parse Run. Search state is `needs_review`, no run
or dataset ID is recorded, and cost remains unreconciled. Raw execution data was
not retained. Do not retry the paid start or treat missing run ID as zero cost.

A read-only actor-run listing using the exact stored BYOK account key returned
HTTP 401, type `user-or-token-not-found`. No run was started by that diagnostic.
The original request's exact HTTP response is unavailable, so this proves the
current key rejection, not the absence of an original provider charge/run.

The existing account connector blocked every key replacement while jobs were
unsettled, preventing restoration of access needed for reconciliation. Migration
060 now permits key-only renewal after connect-apify verifies the **same** provider
identity. Account ID/identity, enabled state, limits, budgets, price multiplier,
reservations and jobs remain unchanged. Different-account switching is still
blocked while jobs are unsettled. Invalid key input is rejected.

The real SQL rotation probe passed and rolled back its inert key. Migration 060
was then installed, preserving function owner/grants and the unchanged search and
account metadata. Rollback function and evidence are in
`.local/search-118-20261115/rotation-{rollback.sql,scratch.json,installed.json}`.
No real credential was replaced, balance changed or provider request made during
installation. No new workflow activation or n8n restart was needed.

Resolved after the user restored the original account key through Settings.
Authenticated `/v2/users/me` matched the saved provider identity. The actor-specific
listing returned zero runs. The complete account-wide run listing returned ten
runs, all on November 4, before search 118's November 15 13:01:05 UTC start.
There was no provider run for this attempt. Evidence is saved in
`.local/search-118-20261115/original-account-{runs,verified}.json`.

The administrative closure locked account, organization and job, checked the
unchanged unresolved state, absence of run/dataset/results/cost entries and fresh
complete provider evidence, then marked search 118 `failed`, `cost_status=not_started`,
provider/customer cost zero and completion reason `provider_start_not_created`.
The normal charge function recorded a zero-cost entry. The reservation is released;
history is retained. Before/after evidence is in `before-close.json` and
`unstarted-closed.json` in the same private directory.

Next: the user may now connect the funded account in Settings and review a fresh
search before starting it. No paid actor start or automatic retry was made during
recovery. AI usage remains four of ten; no strategy request was created for this
search.

The subsequent account switch was blocked in the browser by the session-only
`lg_apify_change_*` pending marker from an earlier uncertain connection request.
Refreshing settings did not clear this marker. `ConnectApify` now offers an
explicit **Enter a replacement key** action in that state. It clears only the
local marker and opens an empty, unconfirmed form; it does not replay the prior
request or claim its success. A new submission still requires an entered key,
the billing acknowledgement, authenticated server verification and the existing
SQL unsettled-job checks. Three focused UI tests cover uncertainty, role checks
and explicit recovery without a network request.
