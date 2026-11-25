'use strict';
// Server-owned metadata stays outside the fingerprinted evidence input.
function snapshot(input){
 const config=`(${input}#>'{campaign,config}')`;
 const installed=name=>`EXISTS(SELECT 1 FROM workflow_entity w CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(w.nodes::jsonb)='array' THEN w.nodes::jsonb ELSE '[]'::jsonb END) n WHERE n->>'name'='${name}' AND n#>>'{credentials,gmailOAuth2,id}'=s.credential_ref)`;
 return `(SELECT jsonb_build_object('kind','email_draft_snapshot_v1','observed_at',clock_timestamp(),'org_id',s.org_id,'connection_id',s.connection_id,'version',s.version,'provider',s.provider,'state',s.state,'email',s.email,'credential_ref',s.credential_ref,'send_capable',s.send_capable,'reply_capable',s.reply_capable,'checked_at',s.checked_at,'sharing',s.sharing,'owner_subject',s.owner_subject,'daily_limit',s.daily_limit,'mailbox_rolling_limit',s.mailbox_rolling_limit,'min_interval_seconds',s.min_interval_seconds,'org_active',o.status='active','member_active',m.active IS TRUE,'member_subject',m.subject,'member_role',m.role,'email_workflow_installed',${installed('Send Email - Gmail')},'reply_workflow_installed',${installed('Read Connected Mailbox')}) FROM sender_connections s LEFT JOIN organizations o ON o.id=s.org_id LEFT JOIN org_sender_memberships m ON m.org_id=s.org_id AND m.subject=${config}#>>'{sender_connection,subject}' WHERE s.org_id::text=${input}->>'org_id' AND s.connection_id=${config}#>>'{sender_connection,connection_id}' AND s.provider='gmail' LIMIT 1)`;
}
module.exports={snapshot};
