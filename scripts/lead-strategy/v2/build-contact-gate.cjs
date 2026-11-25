'use strict';
const fs=require('fs'),assert=require('assert/strict');
const source=fs.readFileSync('database/migrations/027_email_safe_deferral.sql','utf8');
function fn(name){const start=source.indexOf('CREATE OR REPLACE FUNCTION '+name+'('),end=source.indexOf('END $$;',start);assert(start>=0&&end>start);return source.slice(start,end+7);}
let begin=fn('outreach_email_step_begin').replace('mailbox_guard jsonb;','contact_gate jsonb; mailbox_guard jsonb;');
const marker=" UPDATE outreach_activities SET status='attempting',dispatch_metadata=dispatch_metadata||jsonb_build_object(";
assert(begin.includes(marker));begin=begin.replace(marker,` contact_gate:=outreach_email_contact_gate(v.org_id,v.lead_id,p->>'to_email',policy->>'sender_email');
 IF contact_gate->>'allowed' IS DISTINCT FROM 'true' THEN
 IF contact_gate->>'reason'='reply_check_stale' THEN RETURN outreach_email_defer(p,'reply_check_stale',clock_timestamp()+interval '5 minutes'); END IF;
 RETURN contact_gate||'{"ready":false,"execution_authorized":false}'::jsonb; END IF;
`+marker);
begin=begin.replace("'credential_ref',policy->>'credential_ref','sender_email',policy->>'sender_email'","'recipient_email',p->>'to_email','credential_ref',policy->>'credential_ref','sender_email',policy->>'sender_email'");
const defer=fn('outreach_email_defer').replace("'outside_sending_window')","'outside_sending_window','reply_check_stale')");
fs.writeFileSync('database/migrations/028_email_contact_gate.sql',`-- Local candidate. No sending activation or live application.
BEGIN;
${fs.readFileSync('scripts/lead-strategy/v2/email-contact-gate.sql','utf8')}
${defer}
${begin}
REVOKE ALL ON FUNCTION outreach_email_contact_gate(integer,integer,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_email_contact_gate(integer,integer,text,text) TO n8n_user;
COMMIT;
`);
console.log('028 generated locally.');
