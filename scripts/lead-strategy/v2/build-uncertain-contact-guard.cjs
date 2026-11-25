'use strict';
const fs=require('fs'),assert=require('assert/strict');
const source=fs.readFileSync('database/migrations/029_delivery_scan_checkpoint.sql','utf8');
let fn=source.slice(source.indexOf('CREATE OR REPLACE FUNCTION outreach_email_contact_gate'),source.lastIndexOf('COMMIT;'));
const marker="  IF a.dispatch_metadata->>'state'='provider_accepted' THEN";
assert(fn.includes(marker));
fn=fn.replace(marker,()=>`  IF a.dispatch_metadata->>'state' IN ('attempting','ambiguous') THEN
   RETURN '{"allowed":false,"reason":"contact_attempt_requires_reconciliation"}'; END IF;
`+marker);
fs.writeFileSync('database/migrations/031_email_uncertain_contact_guard.sql','-- Candidate: block cross-plan repeats after uncertain attempts. No retry/reset.\nBEGIN;\n'+fn+'COMMIT;\n');
