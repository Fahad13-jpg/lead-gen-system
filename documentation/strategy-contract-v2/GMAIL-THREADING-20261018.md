# Gmail threading — offline adapter implementation

`gmail-message.cjs` produces base64url RFC MIME for the approved subject/body. Non-ASCII subjects are folded into independently valid encoded words; body is UTF-8/base64. No synthetic reply prefix or conversation headers are used for first contact.

Followups require a trusted loader to obtain the previous accepted activity and its actual Gmail message. The helper checks org, plan, plan hash, previous step, credential, sender, recipient and Gmail receipt. A matching subject and valid Message-ID are required. It supplies Gmail `threadId`, `In-Reply-To` and `References`. Mismatches block; approved content is not rewritten. Sources: [Google threading requirements](https://developers.google.com/workspace/gmail/api/guides/threads).

The injected `email-executor.cjs` now runs that validation before committing an attempt and passes `gmail_request` to its transport. Missing/failed parent loading blocks without a send or attempt write. This is covered by mocks, not live Gmail tests.

07A now selects the previous activity scoped to the same organization, plan and step, verifies the connected Gmail profile, retrieves the parent message for followups, and builds MIME before reserving. The transport node retains its historical name `Send Email - Gmail` but is now an HTTP Request using the same Gmail OAuth credential; it accepts the raw Gmail API request. Its URL deliberately throws `EMAIL_TRANSPORT_NOT_ENABLED`. No provider switch or separate email account was introduced. The entry gate remains closed as well.

Authenticated parent retrieval, OAuth compatibility and actual Gmail conversation behavior remain UNVERIFIED. The isolated n8n harness mocks all HTTP and SQL nodes and strips credentials. It validates routing and Code-node execution, not live API delivery.

This completes the pure formatting/validation adapter, not the full production integration. All sender gates remain closed, and no Gmail messages were sent.
