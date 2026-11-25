# Bounce and contact gates — local/scratch

The reply matcher now recognizes a bounded subset of structured RFC 3464 delivery reports: `multipart/report`, one `message/delivery-status` part, a matching final recipient, `Action: failed`, a permanent 5.x.x status and the returned original Message-ID. Gmail mailbox, original message, thread and time checks still apply. Subject text alone, temporary failures, conflicting fields and missing attachment bodies go to review. It does not prove the reporting server's authenticity; stopping is conservative and the event remains reviewable.

References: [RFC 3464](https://www.rfc-editor.org/rfc/rfc3464), [Gmail message resource](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages).

025 accepts the scoped bounce event and sets the existing bounced timestamp through 024. 028 adds an org-scoped address/lead contact gate immediately before committing an attempt. Prior opt-out/bounce audit events continue to suppress even if the last event later changes to a reply. New attempts capture recipient_email, so later lead edits do not erase address history. Older records fall back conservatively to their current lead email; historical original addresses are UNVERIFIED.

Prior accepted email activities require a successful conversation scan within five minutes. Missing/invalid/stale scans defer unattempted sends; unresolved review items block. The scan is not an atomic guarantee that no new reply arrived after retrieval. First contacts have no prior conversation to check. Larger mailbox workloads may need batching/cadence tuning; stale work stays queued rather than bypassing the gate.

09 now checks the authenticated Gmail profile against the explicit organization/credential/email binding before selecting activities. Wrong-account profiles fail closed. No live account has been verified: the binding gate remains empty and the profile response tests are mocks. Aliases are not implicitly accepted.

Tests: JS fixtures cover hard failures and mismatch cases. Scratch non-superuser tests verify bounce persistence, fresh/stale/review gates, suppression across lead IDs and sender changes, and org isolation. Other quota/deferral regression tests still pass. 028 applied only in isolated scratch, after 027. Local JSON rebuilt, not imported.

UNVERIFIED/remaining: delivery reports outside the original Gmail thread, MIME bodies stored as attachments, account/credential compatibility in actual n8n HTTP nodes, live mailbox ownership, authenticated Gmail tests, outbound threading and deployment. The current conversation-only poll does not provide complete bounce discovery. Sending remains disabled; no provider calls or live DB changes occurred.
