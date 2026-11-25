'use strict';
// Existing tool-only workflow; no agent publication, dialer, event or campaign write.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const dir=path.resolve('.local/owned-call-tools-20261116'),folder='/home/node/.n8n/custom/custom/',sources=[['scripts/calling/tool-worker.cjs','lead-system/scripts/calling/tool-worker.cjs'],['scripts/calling/owned-tools.cjs','lead-system/scripts/calling/owned-tools.cjs'],['scripts/calling/account-provider.cjs','lead-system/scripts/calling/account-provider.cjs'],['scripts/calling/n8n/ManagedCallTools.node.js','ManagedCallTools.node.js']];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function docker(args){const r=cp.spawnSync('docker',args,{encoding:'utf8',timeout:60000,maxBuffer:1000000});assert.equal(r.status,0,'LOCAL_DOCKER_STEP_FAILED');return r.stdout.trim();}
async function main(){
 fs.mkdirSync(dir,{recursive:true});assert(!fs.existsSync(path.join(dir,'journal.json')),'RECONCILE_EXISTING_INSTALL');const pool=require('../dashboard/start-local-auth.cjs').localPool();
 try{
  const apiKeyFile=['.local/n8n-api-key','.local/n8n-api-key.txt'].find(f=>fs.existsSync(f)),apiKey=fs.readFileSync(apiKeyFile,'utf8').trim();
  const staleSchedules=new Set();
  const idle=async()=>{
   const rows=(await pool.query('SELECT id,status,"startedAt" FROM execution_entity WHERE status IN($1,$2)',['running','waiting'])).rows;
   for(const row of rows){
    assert(row.status==='running'&&Date.now()-Date.parse(row.startedAt)>3600000,'EXECUTIONS_ACTIVE');
    const response=await fetch('http://127.0.0.1:5678/api/v1/executions/'+row.id+'?includeData=true',{headers:{'X-N8N-API-KEY':apiKey},signal:AbortSignal.timeout(10000)});assert.equal(response.status,200);
    const execution=await response.json(),data=execution.data,stack=data?.executionData?.nodeExecutionStack;
    assert(execution.status==='running'&&Object.keys(data?.resultData?.runData||{}).length===0&&Array.isArray(stack)&&stack.length===1&&stack[0].node?.type==='n8n-nodes-base.scheduleTrigger','EXECUTION_HAS_REAL_WORK');staleSchedules.add(row.id);
   }
   assert.equal((await pool.query("SELECT count(*)::int n FROM outreach_activities WHERE channel='call' AND coalesce(dispatch_metadata->>'state','unknown') NOT IN('settled','cancelled_before_send')")).rows[0].n,0,'CALL_ACTIVE_OR_UNCERTAIN');
  };
  await idle();const wf=(await pool.query('SELECT id,active,nodes,connections,settings FROM workflow_entity ORDER BY id')).rows,beforeHash=hash(JSON.stringify(wf));
  const check=(await pool.query("SELECT active FROM workflow_entity WHERE id='retellCallToolsV1'")).rows[0];assert.equal(check?.active,true);
  fs.writeFileSync(path.join(dir,'workflow-hash.before'),beforeHash);
  const journal={phase:'backing_up',agent_version_unchanged:true,campaigns_modified:0,calls_created:0,events_created:0};const save=()=>fs.writeFileSync(path.join(dir,'journal.json'),JSON.stringify(journal,null,2));save();
  for(const [source,dest]of sources){const exists=docker(['exec','n8n','node','-e',`console.log(require('fs').existsSync(${JSON.stringify(folder+dest)}))`]);if(exists==='true')docker(['cp','n8n:'+folder+dest,path.join(dir,path.basename(source)+'.before')]);}
  const keyPath='/home/node/.n8n/calling-account-encryption.key';const keyExists=docker(['exec','n8n','node','-e',`console.log(require('fs').existsSync(${JSON.stringify(keyPath)}))`]);journal.key_existed=keyExists==='true';if(journal.key_existed)docker(['cp','n8n:'+keyPath,path.join(dir,'encryption.key.before')]);
  fs.writeFileSync(path.join(dir,'rollback.txt'),'With no running/waiting executions or active/uncertain calls, restore the *.before source files to '+folder+' and reload n8n. Restore the prior encryption key if a backup exists. New helper files can remain unused. Restore the dashboard launcher/catalog backups when reverting the caller. No workflow, agent, campaign, or database changes require rollback.\n');
  for(const source of ['scripts/dashboard/calling-calendar.cjs','scripts/dashboard/start-local-auth.cjs'])fs.copyFileSync(source,path.join(dir,path.basename(source)+'.installed'));
  await idle();assert.equal(fs.readFileSync('.local/calling-accounts/encryption.key').length,32);
  docker(['cp','.local/calling-accounts/encryption.key','n8n:'+keyPath]);docker(['exec','-u','root','n8n','sh','-c','chown node:node /home/node/.n8n/calling-account-encryption.key && chmod 600 /home/node/.n8n/calling-account-encryption.key']);
  for(const[source,dest]of sources)docker(['cp',source,'n8n:'+folder+dest]);
  const remote=JSON.parse(docker(['exec','n8n','node','-e',`const f=require('fs'),c=require('crypto');console.log(JSON.stringify(${JSON.stringify(sources.map(([,dest])=>folder+dest))}.map(p=>c.createHash('sha256').update(f.readFileSync(p)).digest('hex'))))`]));assert.deepEqual(remote,sources.map(([source])=>hash(fs.readFileSync(source))));
  journal.phase='copied';save();await idle();docker(['restart','-t','30','n8n']);journal.phase='restarted';save();
  let ready=false;for(let i=0;i<30;i++){try{ready=(await fetch('http://127.0.0.1:5678/healthz/readiness',{signal:AbortSignal.timeout(1500)})).ok;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,1000));}assert(ready,'N8N_READINESS_UNCONFIRMED');
  const after=(await pool.query('SELECT id,active,nodes,connections,settings FROM workflow_entity ORDER BY id')).rows;assert.equal(hash(JSON.stringify(after)),beforeHash,'WORKFLOW_DEFINITIONS_CHANGED');journal.phase='installed';journal.empty_stale_schedules=[...staleSchedules];journal.workflow_definitions_unchanged=true;journal.installed_at=new Date().toISOString();save();console.log(JSON.stringify(journal));
 }finally{await pool.end();}
}
if(require.main===module)main().catch(e=>{console.error(e.message?.slice(0,130));process.exitCode=1;});
