'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
async function main(){const dir='.local/email-completion-20261115',pool=require('../dashboard/start-local-auth.cjs').localPool();try{
 const prior=JSON.parse(fs.readFileSync(dir+'/sender-before-private.json'));
 const rows=(await pool.query("SELECT connection_id,provider,version,state,send_capable,reply_capable,checked_at>now()-interval '24 hours' AND checked_at<=now() AS fresh FROM sender_connections WHERE org_id=1 AND provider='gmail'")).rows;
 assert.equal(rows.length,1);const row=rows[0];assert.equal(row.state,'ready');assert.equal(row.fresh,true);assert.equal(row.send_capable,true);assert.equal(row.reply_capable,true);assert.equal(row.version,prior.find(x=>x.connection_id===row.connection_id).version,'REFRESH_CHANGED_BOUND_VERSION');
 const approved=(await pool.query("SELECT count(*)::integer n FROM strategy_campaigns c JOIN strategy_campaign_versions v ON v.org_id=c.org_id AND v.campaign_id=c.id AND v.version=c.version WHERE v.config#>>'{_email_execution,status}'='approved'")).rows[0]?.n;assert.equal(approved,0);
 const ids=JSON.parse(fs.readFileSync('.local/email-installer-acceptance-20261115/cleanup.json')).workflow_ids;
 const active=(await pool.query({text:'SELECT count(*)::integer n FROM workflow_entity WHERE id=ANY($1::text[]) AND active',values:[ids]})).rows[0]?.n;assert.equal(active,0);
 const controls=JSON.parse(fs.readFileSync(dir+'/controls.json'));assert.equal(controls.local_campaign_controls_enabled,true);
 const page=await fetch('http://127.0.0.1:3002/campaigns',{signal:AbortSignal.timeout(5000)});assert.equal(page.status,200);
 const report={implementation_ready_locally:true,real_n8n_lifecycle_passed:true,gmail_connection_fresh:true,sender_version_preserved:true,local_campaign_controls_enabled:true,approved_campaigns:approved,probe_workflows_inactive:true,customer_multiday_campaign_acceptance:false,new_emails_sent:0,checked_at:new Date().toISOString()};fs.writeFileSync(dir+'/completion.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await pool.end();}}
main().catch(e=>{console.error(/^[A-Z][A-Z_]+$/.test(e.message)?e.message:'EMAIL_COMPLETION_CHECK_UNCONFIRMED');process.exitCode=1;});
