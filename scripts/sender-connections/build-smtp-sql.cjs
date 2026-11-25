'use strict';
// Generate additions from the exact reviewed Gmail gate/begin; never weaken it.
const fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync('database/migrations/035_sender_connections.sql','utf8');
function fn(name){const text=source.match(new RegExp('CREATE OR REPLACE FUNCTION '+name+'\\([\\s\\S]*?END \\$\\$;'))?.[0];assert(text,name);return text;}
let gate=fn('sender_connection_gate').replaceAll('sender_connection_gate','sender_connection_smtp_gate');
gate=gate.replace("IF ref IS NULL THEN", "IF ref IS NULL THEN RETURN '{\"allowed\":false,\"reason\":\"managed_smtp_binding_required\"}'; END IF;\n IF false THEN");
gate=gate.replace("s.provider<>'gmail'","s.provider<>'smtp'").replace('smtp_execution_not_integrated','smtp_connection_required');
let begin=fn('outreach_email_step_begin').replaceAll('outreach_email_step_begin','outreach_smtp_begin').replace('sender_connection_gate(v.org_id,cfg)','sender_connection_smtp_gate(v.org_id,cfg)');
begin=begin.replace('BEGIN\n','BEGIN\n'); // Source may use CRLF; insertion is anchored to SQL text below.
const guard=`
 IF coalesce(p->>'message_id','') !~ '^<[^<>[:space:]]+@[^<>[:space:]]+>$' OR length(p->>'message_id')>250
 OR p->'checkpoint'->>'mailbox' IS DISTINCT FROM 'INBOX'
 OR coalesce(p->'checkpoint'->>'uid_validity','') !~ '^[1-9][0-9]{0,9}$'
 OR coalesce(p->'checkpoint'->>'uid_next','') !~ '^[1-9][0-9]{0,9}$'
 OR jsonb_typeof(p->'references') IS DISTINCT FROM 'array' THEN RETURN '{"ready":false,"reason":"smtp_headers_or_cursor_invalid"}';END IF;
 IF jsonb_array_length(p->'references')>20 THEN RETURN '{"ready":false,"reason":"smtp_headers_invalid"}';END IF;
`;
begin=begin.replace(' ck:=outreach_email_step_recheck(p);',()=>guard+' ck:=outreach_email_step_recheck(p);');
begin=begin.replace(" policy:=cfg->'email_dispatch';",` policy:=cfg->'email_dispatch';
 IF cfg->'sender_connection'->>'connection_id' IS DISTINCT FROM p->>'connection_id'
 OR NOT EXISTS(SELECT 1 FROM sender_connections s WHERE s.org_id=v.org_id AND s.connection_id=p->>'connection_id' AND s.inbox_credential_ref=p->>'inbox_credential_ref') THEN RETURN '{"ready":false,"reason":"smtp_inbox_binding_mismatch"}';END IF;`);
begin=begin.replace("'state','attempting','attempts',1",`'transport','smtp','smtp_message_id',p->>'message_id','smtp_references',p->'references',
 'connection_id',p->>'connection_id','inbox_credential_ref',p->>'inbox_credential_ref','imap_checkpoint',p->'checkpoint','smtp_subject',p->>'subject',
 'state','attempting','attempts',1`);
let bind=fn('sender_connection_bind').replace('result:=sender_connection_gate(p_org,cfg);',"IF s.provider='smtp' THEN result:=sender_connection_smtp_gate(p_org,cfg); ELSE result:=sender_connection_gate(p_org,cfg);END IF;");
const path='database/migrations/036_smtp_receipts.sql';let sql=fs.readFileSync(path,'utf8').split('-- GENERATED SMTP INTEGRATION')[0].replace(/COMMIT;\s*$/,'');
sql+='-- GENERATED SMTP INTEGRATION: scripts/sender-connections/build-smtp-sql.cjs\n'+gate+'\n'+begin+'\n'+bind+`
REVOKE ALL ON FUNCTION sender_connection_smtp_gate(integer,jsonb),outreach_smtp_begin(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sender_connection_smtp_gate(integer,jsonb),outreach_smtp_begin(jsonb) TO n8n_user;
COMMIT;
`;
fs.writeFileSync(path,sql);
