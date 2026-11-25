'use strict';
// Install one additive SQL function and two check-only behavior changes.
const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const dir='.local/email-completion-20261115',hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function docker(args,input,binary=false){const r=cp.spawnSync('docker',args,{input,encoding:binary?undefined:'utf8',timeout:90000,maxBuffer:binary?100e6:1000000});assert.equal(r.status,0,'SENDER_REFRESH_DOCKER_FAILED');return binary?r.stdout:r.stdout.trim();}
const sql=q=>docker(['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],q);
async function main(){assert.ok(process.argv.includes('--apply-local'));assert.ok(JSON.parse(fs.readFileSync(dir+'/refresh-scratch.json')).passed,'SCRATCH_REQUIRED');assert.ok(!fs.existsSync(dir+'/install-journal.json'),'EXISTING_INSTALL_RECONCILE');
 const names=['worker.cjs','gmail-check.cjs'],old=['015b7febfd874b7a90490c395796c2c5363c900d158bfb01138408ab336c5832','d11aa499e4bb6748195db8bb85ee1e4ec49ecf0b79e79d1d476fa0f066200f1e'],folder='/home/node/.n8n/custom/lead-system/scripts/sender-connections/';
 const remote=()=>JSON.parse(docker(['exec','n8n','node','-e',"const fs=require('fs'),c=require('crypto');console.log(JSON.stringify("+JSON.stringify(names)+".map(n=>c.createHash('sha256').update(fs.readFileSync('"+folder+"'+n)).digest('hex'))))"]));assert.deepEqual(remote(),old,'SENDER_RUNTIME_CHANGED');
 assert.equal(sql("SELECT to_regprocedure('sender_connection_refreshed(integer,text,integer,jsonb)') IS NULL"),'t','ALREADY_INSTALLED');
 const idle=async()=>{for(let i=0;i<25;i++){if(sql("SELECT count(*) FROM execution_entity WHERE status IN('running','waiting')")==='0')return;await new Promise(r=>setTimeout(r,1500));}throw Error('ACTIVE_WORK_DEFERRED');};await idle();
 const active=sql("SELECT md5(coalesce(string_agg(id,',' ORDER BY id),'')) FROM workflow_entity WHERE active");
 const stateQuery="SELECT json_build_object('campaigns',(SELECT md5(coalesce(jsonb_agg(to_jsonb(v) ORDER BY org_id,campaign_id,version)::text,'')) FROM strategy_campaign_versions v),'approvals',(SELECT count(*) FROM strategy_approvals),'activities',(SELECT count(*) FROM outreach_activities))";
 const before=sql(stateQuery);fs.writeFileSync(dir+'/business-before.json',before);
 fs.writeFileSync(dir+'/sender-before-private.json',sql("SELECT json_agg(json_build_object('connection_id',connection_id,'version',version,'state',state,'checked_at',checked_at)) FROM sender_connections WHERE provider IN('gmail','smtp')"));
 for(const n of names)docker(['cp','n8n:'+folder+n,dir+'/'+n+'.before']);
 const backup=docker(['exec','postgres_db','pg_dump','-U','n8n_user','-d','lead_db','-Fc'],undefined,true);assert.equal(backup.subarray(0,5).toString(),'PGDMP');fs.writeFileSync(dir+'/before.dump',backup,{flag:'wx'});assert.ok(docker(['exec','-i','postgres_db','pg_restore','--list'],backup).includes('sender_connections'));
 fs.writeFileSync(dir+'/rollback.sql','-- Stop renewal and sender checks, restore both *.before source files, drop the additive function, then reload n8n. Preserve newer sender state; do not restore the database.\nDROP FUNCTION sender_connection_refreshed(integer,text,integer,jsonb);\n');
 const journal={phase:'backed_up',emails_sent:0,campaigns_approved:0,workflow_activations:0};const save=()=>fs.writeFileSync(dir+'/install-journal.json',JSON.stringify(journal,null,2));save();
 sql(fs.readFileSync('database/migrations/058_sender_connection_refresh.sql','utf8'));journal.phase='function_installed';save();assert.equal(sql(stateQuery),before,'BUSINESS_STATE_CHANGED');
 for(const n of names)docker(['cp','scripts/sender-connections/'+n,'n8n:'+folder+n]);assert.deepEqual(remote(),names.map(n=>hash(fs.readFileSync('scripts/sender-connections/'+n))));
 journal.phase='runtime_copied';save();await idle();docker(['restart','-t','30','n8n']);
 let ready=false;for(let i=0;i<40;i++){try{ready=(await fetch('http://127.0.0.1:5678/healthz/readiness',{signal:AbortSignal.timeout(1500)})).ok;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,1000));}assert.ok(ready,'N8N_NOT_READY');
 assert.deepEqual(remote(),names.map(n=>hash(fs.readFileSync('scripts/sender-connections/'+n))));assert.equal(sql("SELECT md5(coalesce(string_agg(id,',' ORDER BY id),'')) FROM workflow_entity WHERE active"),active,'WORKFLOW_ACTIVATION_CHANGED');
 assert.equal(sql("SELECT has_function_privilege('n8n_user','sender_connection_refreshed(integer,text,integer,jsonb)','EXECUTE')"),'t');
 journal.phase='verified';journal.migration='058';journal.installed_files=2;journal.workflow_activation_unchanged=true;journal.verified_at=new Date().toISOString();save();console.log(JSON.stringify(journal));
}
main().catch(e=>{console.error(/^[A-Z][A-Z_]+$/.test(e.message)?e.message:'SENDER_REFRESH_INSTALL_UNCONFIRMED');process.exitCode=1;});
