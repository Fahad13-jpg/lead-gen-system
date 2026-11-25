# Version 1 channel checks

21 November 2026: 55 focused backend/core checks and 39 browser component checks passed. These use local fixtures, not real provider sends. Coverage includes Gmail connection UI, email campaign start/pause, plan approval, manual WhatsApp links and stops, manual Messenger current approved text and safe destinations, LinkedIn copy/open and task transitions, email preflight/release and duplicate prevention.

The Lead Gen workspace (organization 8) currently has no Gmail/SMTP sender and only the earlier SMS campaign 17. Use new Version 1 campaigns rather than treating that SMS campaign as email/manual setup. No paid strategy request, scrape or outreach was started in this pass.

Remaining browser acceptance order:

1. Manual WhatsApp: owned test lead, empty message blocked, review required, text/number correct in the opened chat, editing resets review, opening does not count as delivery.
2. LinkedIn: permitted personal test profile, campaign/draft review, copy note/message and open profile, verify no automatic send and no false sent status.
3. Messenger: permitted Page with messaging available, approved draft or reviewed manual text, copy/open, verify correct destination, no false sent status.
4. Email: connect the intended sender in the test workspace, make a one-recipient campaign for an owned inbox, review content and scope, explicitly authorize one message, confirm receipt/reply and stopped follow-up.

Manual copy/open checks can be completed without pressing Send. Real email and any new AI generation require the specific intended sender/recipient/content and bounded allowance.
