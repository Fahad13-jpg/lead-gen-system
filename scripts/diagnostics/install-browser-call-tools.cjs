'use strict';
// Install the bounded browser fixture on the existing node/ingress, no new webhook.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function docker(args){const r=cp.spawnSync('docker',args,{encoding:'utf8',timeout:60000,maxBuffer:1000000});assert.equal(r.status,0,'BROWSER_RUNTIME_DOCKER_FAILED');return r.stdout.trim();}
const sql=q=>docker(['exec','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db','-c',q]);
async function main(){
 assert.ok(process.argv.includes('--apply-local'));
 const refreshGateway=process.argv.includes('--refresh-gateway'),refresh=process.argv.includes('--refresh-browser')||refreshGateway;
 if(process.argv.includes('--verify-installed')){
  const folder='/home/node/.n8n/custom/custom/lead-system/scripts/calling/',names=['tool-worker.cjs','tool-gateway.cjs','tools.cjs','tool-storage.cjs','browser-test.cjs','retell.cjs'];
  const hashes=JSON.parse(docker(['exec','n8n','node','-e',"const fs=require('fs'),c=require('crypto');console.log(JSON.stringify("+JSON.stringify(names)+".map(n=>c.createHash('sha256').update(fs.readFileSync('"+folder+"'+n)).digest('hex'))))"]));
  assert.deepEqual(hashes,names.map(n=>hash(fs.readFileSync('scripts/calling/'+n))));
  assert.equal(sql("SELECT active FROM workflow_entity WHERE id='retellCallToolsV1'"),'t');
  assert.ok((await fetch('http://127.0.0.1:5678/healthz/readiness',{signal:AbortSignal.timeout(3000)})).ok);
  const file=path.resolve('.local/calling-browser-test/runtime-verification.json'),report={phase:'verified_by_post_restart_readback',files_verified:names.length,existing_tool_workflow_active:true,phone_version_unchanged:true,calls_created:0,events_created:0,verified_at:new Date().toISOString()};
  fs.writeFileSync(file,JSON.stringify(report,null,2));console.log(JSON.stringify(report));return;
 }
 const dir=path.resolve('.local/browser-call-tools-20261115'+(refresh?'-refresh-'+Date.now():''));assert.ok(!fs.existsSync(path.join(dir,'journal.json')),'EXISTING_INSTALL_INSPECT_FIRST');fs.mkdirSync(dir,{recursive:true});
 const folder='/home/node/.n8n/custom/custom/lead-system/scripts/calling/';
 const names=refresh?(refreshGateway?['tool-gateway.cjs','retell.cjs']:['browser-test.cjs']):['tool-worker.cjs','tool-gateway.cjs','tools.cjs','tool-storage.cjs','browser-test.cjs','retell.cjs'];
 const idle=()=>{assert.equal(sql("SELECT count(*) FROM execution_entity WHERE status IN('running','waiting')"),'0','ACTIVE_EXECUTIONS_RELOAD_DEFERRED');assert.equal(sql("SELECT count(*) FROM outreach_activities WHERE channel='call' AND coalesce(dispatch_metadata->>'state','unknown') NOT IN('settled','cancelled_before_send')"),'0','CALL_ACTIVE_OR_UNCERTAIN');};
 const awaitIdle=async()=>{for(let i=0;i<20;i++){try{idle();return;}catch(e){if(!process.argv.includes('--wait-idle')||!e.message.includes('ACTIVE_EXECUTIONS_RELOAD_DEFERRED'))throw e;}await new Promise(r=>setTimeout(r,2000));}idle();};await awaitIdle();
 const active=sql("SELECT md5(coalesce(string_agg(id,',' ORDER BY id),'')) FROM workflow_entity WHERE active");
 for(const n of names){const exists=docker(['exec','n8n','node','-e',"console.log(require('fs').existsSync('"+folder+n+"'))"]);if(exists==='true'){docker(['cp','n8n:'+folder+n,path.join(dir,n+'.before')]);
   // Only the reviewed prior source is replaced; preserve rollback copies privately.
   assert.ok(fs.statSync(path.join(dir,n+'.before')).size>100);}}
 fs.writeFileSync(path.join(dir,'rollback.txt'),'With no active calls/executions, restore the four *.before files to '+folder+' and reload n8n. Disable /home/node/.n8n/calling-browser-test.json if present. No database restore or campaign changes are needed.\n');
 const journal={phase:'backed_up',files:names,phone_version_unchanged:true,calls_created:0,events_created:0};
 const save=()=>fs.writeFileSync(path.join(dir,'journal.json'),JSON.stringify(journal,null,2));save();await awaitIdle();
 for(const n of names)docker(['cp','scripts/calling/'+n,'n8n:'+folder+n]);
 const remote=JSON.parse(docker(['exec','n8n','node','-e',"const fs=require('fs'),c=require('crypto');console.log(JSON.stringify("+JSON.stringify(names)+".map(n=>c.createHash('sha256').update(fs.readFileSync('"+folder+"'+n)).digest('hex'))))"]));
 assert.deepEqual(remote,names.map(n=>hash(fs.readFileSync('scripts/calling/'+n))));
 journal.phase='copied';save();await awaitIdle();docker(['restart','-t','30','n8n']);
 let ready=false;for(let i=0;i<40;i++){try{ready=(await fetch('http://127.0.0.1:5678/healthz/readiness',{signal:AbortSignal.timeout(1500)})).ok;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,1000));}
 assert.ok(ready,'N8N_READINESS_UNCONFIRMED');assert.equal(sql("SELECT md5(coalesce(string_agg(id,',' ORDER BY id),'')) FROM workflow_entity WHERE active"),active,'WORKFLOW_ACTIVATION_CHANGED');
 journal.phase='verified';journal.workflow_activation_unchanged=true;journal.verified_at=new Date().toISOString();save();console.log(JSON.stringify(journal));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
