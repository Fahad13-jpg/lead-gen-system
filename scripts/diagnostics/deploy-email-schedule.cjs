'use strict';
const fs=require('fs'),cp=require('child_process'),path=require('path'),assert=require('assert/strict');
const dir=path.resolve('.local/email-schedule-deployment-20261015');
const targets=[['27W04lgTGdgFMWUx','workflows/06C_outreach_strategy_generator.json'],['gTjsUEP8VLlxKfWf','workflows/07a_email_outreach_executor.json']];
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',maxBuffer:20e6,timeout:180000});if(r.status!==0){fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'error.log'),String(r.stdout||'')+String(r.stderr||r.error||''));throw Error('Docker operation failed; private error.log retained');}return r.stdout.trim();}
const sql=q=>docker(['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],q);
const control=enabled=>sql('UPDATE strategy_controls SET enabled='+Boolean(enabled)+' WHERE id;');
const snapshot=()=>JSON.parse(sql(`SELECT json_build_object(
'activities',(SELECT count(*) FROM outreach_activities),
'plans',(SELECT coalesce(json_agg(json_build_object('id',id,'hash',content_hash,'body_hash',md5(body::text)) ORDER BY id),'[]') FROM strategy_plans),
'strategy_ai',(SELECT count(*) FROM strategy_ai_requests),
'enrichment_ai',(SELECT count(*) FROM enrichment_ai_requests),
'activation',(SELECT json_agg(json_build_object('id',id,'active',active) ORDER BY id) FROM workflow_entity));`));
async function health(){for(let i=0;i<45;i++){try{if((await fetch('http://127.0.0.1:5678/healthz',{signal:AbortSignal.timeout(2000)})).ok)return;}catch{}await new Promise(r=>setTimeout(r,1000));}throw Error('n8n health check failed');}
async function install(workflows){
 for(const w of workflows){const f=path.join(dir,'import-'+w.id+'.json');fs.writeFileSync(f,JSON.stringify({...w,active:false}));docker(['cp',f,'n8n:/tmp/email-schedule-import.json']);docker(['exec','n8n','n8n','import:workflow','--input=/tmp/email-schedule-import.json','--projectId=xLW48WqYIkxblH0N']);docker(['exec','n8n','n8n','update:workflow','--id='+w.id,'--active='+w.active]);}
 docker(['restart','--time','60','n8n']);await health();
}
async function main(){
 if(process.argv[2]==='rollback'){
  const before=JSON.parse(fs.readFileSync(path.join(dir,'before.json')));
  assert.equal(sql("SELECT count(*) FROM outreach_activities WHERE dispatch_metadata->>'state' IN ('attempting','provider_accepted','ambiguous')"),'0','Preserve/reconcile dispatched attempts before rollback');
  control(false);await install(before.workflows);
  sql(fs.readFileSync('database/migrations/020_email_dispatch_lifecycle.sql','utf8')); sql('DROP FUNCTION outreach_email_window(jsonb,timestamptz);');
  control(before.enabled);console.log('Target workflows restored; migration 020 begin restored and window helper removed.');return;
 }
 assert.equal(process.argv[2],'apply');
 const evidence=JSON.parse(fs.readFileSync('documentation/strategy-contract-v2/email-workflow-results.json'));
 assert.equal(evidence.cases.length,6);assert(evidence.cases.every(x=>x.pass));assert.equal(evidence.network,'none');
 assert.equal(sql("SELECT count(*) FROM pg_proc WHERE proname='outreach_email_window'"),'0','Already applied; inspect rather than replay');
 assert.equal(sql("SELECT count(*) FROM strategy_jobs WHERE status IN ('pending','processing')"),'0','Planner work outstanding');
 assert.equal(sql("SELECT count(*) FROM execution_entity WHERE status='running'"),'0','n8n executions running');
 assert.equal(sql('SELECT count(*) FROM strategy_ai_controls WHERE enabled OR monthly_limit<>0'),'0','AI allowance must stay zero');
 const before={enabled:sql('SELECT enabled FROM strategy_controls WHERE id')==='t',snapshot:snapshot(),workflows:targets.map(([id])=>JSON.parse(sql("SELECT row_to_json(w) FROM workflow_entity w WHERE id='"+id+"'")))};
 assert.equal(before.workflows[1].active,false,'Email executor unexpectedly active');
 const desired=targets.map(([id,file],i)=>({...JSON.parse(fs.readFileSync(file)),id,active:before.workflows[i].active}));
 assert.equal(desired[1].nodes.find(n=>n.name==='Daily limit check').parameters.jsCode.includes('return [];'),true);
 assert(desired[1].nodes.find(n=>n.name==='Send Email - Gmail').parameters.sendTo.includes("throw new Error('EMAIL_TRANSPORT_NOT_ENABLED')"));
 for(let i=0;i<2;i++)assert.deepEqual(desired[i].nodes.filter(n=>n.type==='n8n-nodes-base.stickyNote'),before.workflows[i].nodes.filter(n=>n.type==='n8n-nodes-base.stickyNote'));
 const strip=w=>({connections:w.connections,nodes:w.nodes.map(n=>{n=structuredClone(n);if(['Prepare Strategy','Validate and Assemble Draft','Build Preview'].includes(n.name))delete n.parameters.jsCode;return n;})});
 assert.deepEqual(strip(desired[0]),strip(before.workflows[0]),'Unexpected planner graph/config change');
 fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'before.json'),JSON.stringify(before),{flag:'wx'});
 docker(['exec','postgres_db','pg_dump','-U','n8n_user','-d','lead_db','-Fc','-f','/tmp/email-schedule-before.dump']);docker(['cp','postgres_db:/tmp/email-schedule-before.dump',path.join(dir,'before.dump')]);assert(fs.statSync(path.join(dir,'before.dump')).size>1000);
 control(false);console.log('Backup saved; planner paused for migration and inactive email import.');
 sql(fs.readFileSync('database/migrations/021_email_sending_window.sql','utf8'));
 await install(desired);
 for(const wanted of desired){const live=JSON.parse(sql("SELECT row_to_json(w) FROM workflow_entity w WHERE id='"+wanted.id+"'"));assert.deepEqual(live.nodes,wanted.nodes);assert.deepEqual(live.connections,wanted.connections);assert.equal(live.active,wanted.active);}
 assert.deepEqual(snapshot(),before.snapshot,'Unexpected activity, plan, ledger or activation change');
 assert.equal(sql("SELECT outreach_email_begin('{\"org_id\":1,\"plan_id\":9223372036854775807,\"step\":1}') ->> 'ready'"),'false');
 assert.equal(sql("SELECT has_function_privilege('n8n_user','outreach_email_begin(jsonb)','EXECUTE') AND has_function_privilege('n8n_user','outreach_email_finish(jsonb)','EXECUTE')"),'t');
 const smoke=cp.spawnSync(process.execPath,['scripts/lead-strategy/check-live.cjs'],{encoding:'utf8',timeout:90000});assert.equal(smoke.status,0,'Strategy API smoke failed');
 assert.equal(sql('SELECT count(*) FROM strategy_ai_controls WHERE enabled OR monthly_limit<>0'),'0');
 control(before.enabled);
 const result={deployed_at:new Date().toISOString(),migration:21,workflows:targets.map(x=>x[0]),email_active:false,transport_blocked:true,ai_allowance:0,api_smoke_passed:true,activities_plans_ledgers_and_activation_unchanged:true,provider_calls:0,sends:0};
 fs.writeFileSync('documentation/strategy-contract-v2/email-schedule-deployment-results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
main().catch(e=>{console.error(e.message);console.error('If deployment started, planner remains paused; inspect backup and use the targeted rollback if needed.');process.exitCode=1;});
