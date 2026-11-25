'use strict';
// One operator-authorized recheck of the existing org1 sender. No retries or sending.
const cp=require('node:child_process'),assert=require('node:assert/strict'),fs=require('node:fs');
function sql(text){const r=cp.spawnSync('docker',['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],{input:text,encoding:'utf8',timeout:30000});assert.equal(r.status,0,'Registry diagnostic failed; private output suppressed');return JSON.parse(r.stdout);}
const state=()=>sql("SELECT json_build_object('activities',(SELECT count(*) FROM outreach_activities),'check_active',(SELECT active FROM workflow_entity WHERE id='managedSmtpcheck'),'send_poll_active',(SELECT count(*) FROM workflow_entity WHERE id IN ('managedSmtpsend','managedSmtppoll') AND active),'sender',(SELECT json_build_object('state',state,'version',version,'send_capable',send_capable,'reply_capable',reply_capable,'checked_at',checked_at) FROM sender_connections WHERE org_id=1 AND connection_id='fahad-gmail-smtp'))");
(async()=>{
 const before=state();assert.equal(before.check_active,true);assert.equal(before.send_poll_active,0);assert(['ready','pending_check'].includes(before.sender.state));
 const queued=before.sender.state==='pending_check'?before.sender:sql("SELECT sender_connection_manage(1,owner_subject,jsonb_build_object('action','recheck','connection_id',connection_id,'expected_version',version)) FROM sender_connections WHERE org_id=1 AND connection_id='fahad-gmail-smtp'");
 assert.equal(queued.state,'pending_check');console.log(JSON.stringify({recheck_queued:before.sender.state!=='pending_check',observing_existing_request:before.sender.state==='pending_check',emails_sent:0}));
 const deadline=Date.now()+150000;let after;
 while(Date.now()<deadline){after=state();if(after.sender.version>queued.version&&after.sender.state!=='pending_check')break;await new Promise(r=>setTimeout(r,3000));}
 assert.equal(after.activities,before.activities);assert.equal(after.send_poll_active,0);
 const result={checked_at:new Date().toISOString(),automatic_recheck_finished:after.sender.version>queued.version&&after.sender.state!=='pending_check',sender:after.sender,emails_sent:0,activities_unchanged:true,send_poll_inactive:true};
 fs.writeFileSync('.local/sender-recheck-20261108/live-test.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(!result.automatic_recheck_finished)process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1;});
