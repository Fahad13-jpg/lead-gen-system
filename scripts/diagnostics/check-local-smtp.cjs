'use strict';
// Execute only the manual, no-send connection-check workflow. Suppress raw CLI output.
const cp=require('node:child_process'),assert=require('node:assert/strict'),fs=require('node:fs');
function sql(q){const r=cp.spawnSync('docker',['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],{input:q,encoding:'utf8',timeout:30000});assert.equal(r.status,0,'Metadata check failed');return JSON.parse(r.stdout);}
const before=sql("SELECT json_build_object('activities',(SELECT count(*) FROM outreach_activities),'node',(SELECT nodes FROM workflow_entity WHERE id='managedSmtpcheck'),'active',(SELECT active FROM workflow_entity WHERE id='managedSmtpcheck'));");
const custom=before.node.find(n=>n.type==='CUSTOM.managedSender');assert.equal(custom.parameters.operation,'check');assert.equal(custom.parameters.release,'null');assert.equal(JSON.parse(custom.parameters.binding).connection_id,'fahad-gmail-smtp');
assert.equal(JSON.parse(custom.parameters.binding).org_id,1,'Unexpected organization');
assert.equal(before.node.filter(n=>n.type==='n8n-nodes-base.manualTrigger').length,1,'Manual trigger required');
assert.equal(before.node.filter(n=>n.type==='CUSTOM.managedSender').length,1);
assert(before.node.every(n=>['CUSTOM.managedSender','n8n-nodes-base.manualTrigger','n8n-nodes-base.scheduleTrigger','n8n-nodes-base.stickyNote'].includes(n.type)),'Unexpected operation in check workflow');
const run=cp.spawnSync('docker',['exec','n8n','n8n','execute','--id=managedSmtpcheck'],{encoding:'utf8',timeout:90000,maxBuffer:10e6});
const after=sql("SELECT json_build_object('activities',(SELECT count(*) FROM outreach_activities),'sender',(SELECT json_build_object('state',state,'version',version,'send_capable',send_capable,'reply_capable',reply_capable,'checked_at',checked_at) FROM sender_connections WHERE org_id=1 AND connection_id='fahad-gmail-smtp'));");
assert.equal(before.activities,after.activities,'Activity count changed');
const result={checked_at:new Date().toISOString(),pending_requests_only:true,cli_exit_code:run.status,timed_out:run.error?.code==='ETIMEDOUT',sender:after.sender,emails_sent:0,activity_count_unchanged:true};
if(run.status!==0){const raw=(run.stdout||'')+(run.stderr||'');result.diagnostic_class=/MANAGED_SENDER_OPERATION_FAILED/.test(raw)?'connector_check_failed':/Unrecognized node type/i.test(raw)?'custom_node_unrecognized':/credential/i.test(raw)?'credential_or_access_error':'cli_execution_failed';result.safe_reason=raw.match(/MANAGED_SENDER_OPERATION_FAILED:([A-Z_]{2,60});/)?.[1]||'unavailable';}
fs.writeFileSync('documentation/strategy-contract-v2/smtp-org1-check.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
