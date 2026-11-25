'use strict';
// Finish local campaign controls only. Requires zero approved automatic campaigns;
// no campaign approval, sending workflow activation or email is performed here.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
async function main(){assert.ok(process.argv.includes('--enable-local-controls'));
 const dir=path.resolve('.local/email-completion-20261115');assert.ok(!fs.existsSync(dir+'/controls.json'),'CONTROLS_ALREADY_CONFIGURED');assert.equal(JSON.parse(fs.readFileSync(dir+'/install-journal.json')).phase,'verified');
 assert.equal(JSON.parse(fs.readFileSync('.local/email-installer-acceptance-20261115/result.json')).passed,true);
 assert.equal(JSON.parse(fs.readFileSync('.local/email-installer-acceptance-20261115/cleanup.json')).probe_workflows_inactive,true);
 const pool=require('../dashboard/start-local-auth.cjs').localPool();try{
  const count=(await pool.query("SELECT count(*)::integer n FROM strategy_campaigns c JOIN strategy_campaign_versions v ON v.org_id=c.org_id AND v.campaign_id=c.id AND v.version=c.version WHERE v.config#>>'{_email_execution,status}'='approved'")).rows[0]?.n;assert.equal(count,0,'EXISTING_APPROVAL_REQUIRES_REVIEW');
  const tick=await require('../sender-connections/run-campaign-renewal.cjs').run({enabled:true,pool,execute:()=>assert.fail('NO_APPROVED_WORK_EXPECTED'),installAndStart:()=>assert.fail('NO_APPROVED_WORK_EXPECTED')});assert.equal(tick.state,'tick_complete');assert.equal(tick.campaigns,0);
  const pid=Number(fs.readFileSync('.local/call-activity-20261115/gateway.pid','utf8').trim());assert.ok(Number.isSafeInteger(pid)&&pid>0);
  const ps=`$ErrorActionPreference='Stop'; $taskProcess=Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'; if($taskProcess){if($taskProcess.CommandLine -notlike '*scripts/dashboard/start-local-auth.cjs*'){throw 'GATEWAY_IDENTITY_MISMATCH'}; Stop-Process -Id ${pid}}; $env:EMAIL_CAMPAIGN_RENEWAL_ENABLED='true'; $env:EMAIL_BATCH_DASHBOARD_START_ENABLED='false'; $taskGateway=Start-Process -FilePath 'C:\\Users\\hp\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\bin\\node.exe' -ArgumentList 'scripts/dashboard/start-local-auth.cjs' -WorkingDirectory 'C:\\Users\\hp\\lead-gen-system' -WindowStyle Hidden -RedirectStandardOutput 'C:\\Users\\hp\\lead-gen-system\\.local\\email-completion-20261115\\gateway.out.log' -RedirectStandardError 'C:\\Users\\hp\\lead-gen-system\\.local\\email-completion-20261115\\gateway.err.log' -PassThru; $taskGateway.Id`;
  const r=cp.spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',ps],{encoding:'utf8',timeout:30000,windowsHide:true});assert.equal(r.status,0,'GATEWAY_RELOAD_UNCONFIRMED');const next=Number(r.stdout.trim());assert.ok(Number.isSafeInteger(next)&&next>0);
  fs.writeFileSync(dir+'/gateway.pid',String(next));
  let ready=false;for(let i=0;i<20;i++){try{ready=(await fetch('http://127.0.0.1:3002/login',{signal:AbortSignal.timeout(1500)})).ok;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready,'GATEWAY_NOT_READY');
  const result={local_campaign_controls_enabled:true,manual_batch_start_enabled:false,approved_campaigns:0,initial_tick:tick.state,initial_campaigns:tick.campaigns,emails_sent:0,campaigns_approved:0,provider_workflows_activated:0,gateway_pid:next,verified_at:new Date().toISOString()};fs.writeFileSync(dir+'/controls.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await pool.end();}}
main().catch(e=>{console.error(/^[A-Z][A-Z_]+$/.test(e.message)?e.message:'LOCAL_EMAIL_CONTROLS_UNCONFIRMED');process.exitCode=1;});
