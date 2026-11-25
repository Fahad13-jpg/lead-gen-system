'use strict';
const fs=require('fs'),assert=require('assert/strict');
const source=fs.readFileSync('database/migrations/023_email_sequence_dispatch.sql','utf8');
const start=source.indexOf('CREATE OR REPLACE FUNCTION outreach_email_step_begin('),end=source.indexOf('END $$;',start)+7;
assert(start>=0&&end>start);
let begin=source.slice(start,end).replace('cfg jsonb; policy jsonb;','mailbox_guard jsonb; cfg jsonb; policy jsonb;');
const marker=" UPDATE outreach_activities SET status='attempting',dispatch_metadata=dispatch_metadata||jsonb_build_object(";
assert(begin.includes(marker));
begin=begin.replace(marker,` mailbox_guard:=outreach_mailbox_capacity(v.org_id,policy);
 IF mailbox_guard->>'allowed' IS DISTINCT FROM 'true' THEN
 RETURN mailbox_guard||'{"ready":false,"execution_authorized":false}'::jsonb; END IF;
`+marker);
const guard=fs.readFileSync('scripts/lead-strategy/v2/mailbox-capacity.sql','utf8');
fs.writeFileSync('database/migrations/026_mailbox_capacity.sql',`-- Local candidate. Preserves existing approval, lease and org quota checks.
BEGIN;
${guard}
${begin}
REVOKE ALL ON FUNCTION outreach_mailbox_capacity(integer,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_mailbox_capacity(integer,jsonb) TO n8n_user;
COMMIT;
`);
console.log('026 written locally; not applied.');
