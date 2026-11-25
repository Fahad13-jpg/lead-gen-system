'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const dir='.local/calling-tool-diagnostics-20261114',hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function docker(args){const r=cp.spawnSync('docker',args,{encoding:'utf8',timeout:60000,maxBuffer:200000});assert.equal(r.status,0,'DIAGNOSTIC_DOCKER_STEP_FAILED');return r.stdout.trim();}
const sql=q=>docker(['exec','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db','-c',q]);
async function main(){assert(process.argv.includes('--apply-local'));assert(!fs.existsSync(dir+'/result.json'),'DIAGNOSTICS_ALREADY_INSTALLED');
 const files=[{source:'scripts/calling/tool-worker.cjs',before:dir+'/tool-worker.before.cjs',target:'/home/node/.n8n/custom/custom/lead-system/scripts/calling/tool-worker.cjs'},{source:'scripts/calling/n8n/ManagedCallTools.node.js',before:dir+'/ManagedCallTools.before.node.js',target:'/home/node/.n8n/custom/custom/ManagedCallTools.node.js'}];
 const remote=()=>JSON.parse(docker(['exec','n8n','node','-e',"const fs=require('fs'),c=require('crypto');console.log(JSON.stringify("+JSON.stringify(files.map(f=>f.target))+".map(p=>c.createHash('sha256').update(fs.readFileSync(p)).digest('hex'))));"]));
 assert.deepEqual(remote(),files.map(f=>hash(fs.readFileSync(f.before))),'REVIEWED_RUNTIME_BASELINE_CHANGED');
 const idle=()=>{assert.equal(sql("SELECT count(*) FROM execution_entity WHERE status IN('running','waiting')"),'0','ACTIVE_EXECUTIONS_RELOAD_DEFERRED');assert.equal(sql("SELECT count(*) FROM outreach_activities WHERE channel='call' AND coalesce(dispatch_metadata->>'state','unknown') NOT IN('settled','cancelled_before_send')"),'0','CALL_ACTIVE_OR_UNCERTAIN');};idle();
 const active=sql("SELECT md5(coalesce(string_agg(id,',' ORDER BY id),'')) FROM workflow_entity WHERE active");fs.writeFileSync(dir+'/rollback.txt','Restore the two *.before files to their matching installed custom-node paths while no calls or workflow executions are active, then reload n8n. No credentials or workflow definitions need changing.\n');
 for(const f of files)docker(['cp',f.source,'n8n:'+f.target]);assert.deepEqual(remote(),files.map(f=>hash(fs.readFileSync(f.source))));idle();docker(['restart','-t','30','n8n']);
 let ready=false;for(let i=0;i<30;i++){try{if((await fetch('http://localhost:5678/healthz/readiness',{signal:AbortSignal.timeout(2000)})).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}assert(ready,'N8N_READINESS_UNCONFIRMED');assert.equal(sql("SELECT md5(coalesce(string_agg(id,',' ORDER BY id),'')) FROM workflow_entity WHERE active"),active,'ACTIVATION_CHANGED');assert.deepEqual(remote(),files.map(f=>hash(fs.readFileSync(f.source))));
 const result={installed:true,files:2,sanitized_codes_only:true,workflow_activation_unchanged:true,provider_requests:0,phone_calls_placed:0,bookings_created:0,verified_at:new Date().toISOString()};fs.writeFileSync(dir+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
