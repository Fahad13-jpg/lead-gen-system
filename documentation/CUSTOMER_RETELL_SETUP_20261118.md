# Customer Retell agent setup

The reviewed customer template builder is implemented in `scripts/calling/customer-agent-template.cjs`. It prepares new-draft API requests from the tested calling prompt and settings; it performs no network requests, publication, number binding, campaign activation or calls.

It requires a trusted current Plus snapshot, an organization-matched connected account, a verified published source agent/engine with the existing voice/model, and a separately verified tool binding issued for that organization/account fingerprint. Published source agents are never patched. Existing source tool headers are not copied. The read-only review omits the tool token and includes a hash bound to the final settings and tool credential digest.

This is the reusable settings-generation step, not a completed self-service installer. The existing development tool backend must not be cloned into customer accounts with its shared private token. Customer-specific authenticated tool routing needs to be provisioned and verified first. Only then should the setup service perform draft creation with durable request receipts and no blind retries, read back the result, offer a browser test and allow explicitly reviewed publication. Calls remain separately blocked by number, route, funding, consent, release, package and agent checks.

Verification: four offline scenarios cover the template, no published-agent mutation, cross-organization/Free denial, unverified source/tool rejection, omission of source credentials, draft-engine validation and credential-bound review hashes. No provider request or inference was executed.
