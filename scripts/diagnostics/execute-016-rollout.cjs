'use strict';
// Explicit approved local rollout. No model, Apify, verification or outreach calls.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const dir=path.resolve(process.argv[2]||''),validationDir=path.resolve(process.argv[3]||'');
const q=v=>"'"+String(v).replace(/'/g,"''")+"'";
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
function docker(args,input,binary=false){const r=cp.spawnSync('docker',args,{input,encoding:binary?undefined:'utf8',timeout:180000,maxBuffer:256*1024*1024});if(r.status!==0){fs.writeFileSync(dir+'/private-error.txt',r.stderr||'');throw Error('ROLLOUT_COMMAND_UNCONFIRMED');}return binary?r.stdout:r.stdout.trim();}
const sql=text=>docker(['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],text),json=text=>JSON.parse(sql(text));
const state={migration_applied:false,workflows_paused:false,canary:[],completed:false};
function save(phase){state.phase=phase;fs.writeFileSync(dir+'/progress.json',JSON.stringify(state,null,2));console.log(JSON.stringify({phase,...(phase==='canary_result'?{result:state.canary.at(-1)}:{})}));}
const inflight=()=>json(`SELECT json_build_object('executions',(SELECT count(*) FROM execution_entity WHERE status IN ('new','running','waiting')),'tasks',(SELECT count(*) FROM enrichment_tasks WHERE status='processing'),'linkedin',(SELECT count(*) FROM enrichment_linkedin_jobs WHERE status IN ('starting','running','needs_review')))`);
const ledger=()=>json(`SELECT jsonb_build_object('enrichment_ai',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY lease)::text,'')) FROM enrichment_ai_requests t),'strategy_ai',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY lease)::text,'')) FROM strategy_ai_requests t),'linkedin',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM enrichment_linkedin_jobs t),'apify',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY reference)::text,'')) FROM apify_diagnostic_runs t),'wallet',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY org_id,reference)::text,'')) FROM gathering_wallet_entries t),'outreach',(SELECT count(*) FROM outreach_activities))`);
async function health(){for(let i=0;i<45;i++){try{if((await fetch('http://127.0.0.1:5678/healthz',{signal:AbortSignal.timeout(2000)})).ok)return;}catch{}await new Promise(r=>setTimeout(r,1000));}throw Error('N8N_HEALTH_UNCONFIRMED');}
async function main(){
 for(const target of [dir,validationDir])assert(target.startsWith(path.resolve('.local')+path.sep),'LOCAL_REVIEWED_BUNDLE_REQUIRED');
 assert(!fs.existsSync(dir+'/progress.json'),'EXISTING_ROLLOUT_REQUIRES_RECONCILIATION');
 const manifest=JSON.parse(fs.readFileSync(dir+'/manifest.json')),before=JSON.parse(fs.readFileSync(dir+'/before-state.json')),validated=JSON.parse(fs.readFileSync(validationDir+'/state.json'));
 assert(validated.success===true&&validated.live_migrated===false&&validated.phase==='validation_complete','SCRATCH_VALIDATION_REQUIRED');assert(Date.now()-Date.parse(validated.finished_at)<3600000,'FRESH_SCRATCH_VALIDATION_REQUIRED');
 const migration=fs.readFileSync(dir+'/migration.sql');assert.equal(hash(migration),manifest.migration_sha256);assert.equal(hash(fs.readFileSync('database/migrations/016_signal_sheet.sql')),manifest.migration_sha256);assert(fs.statSync('database/migrations/016_signal_sheet.sql').mtimeMs<Number(validated.database.split('_').at(-1)),'MIGRATION_CHANGED_AFTER_VALIDATION');
 assert.equal(json(`SELECT to_json(to_regprocedure('enrichment_source_checks(integer,integer)') IS NULL)`),true,'MIGRATION_ALREADY_PRESENT');assert.deepEqual(inflight(),{executions:0,tasks:0,linkedin:0});
 const current=json(`SELECT json_agg(json_build_object('id',id,'name',name,'active',active) ORDER BY name) FROM workflow_entity`);assert.deepEqual(current,before.workflows,'WORKFLOW_STATE_CHANGED');
 for(const table of Object.keys(before.controls))assert.deepEqual(json('SELECT json_agg(t) FROM '+table+' t'),before.controls[table],'CONTROLS_CHANGED');
 const baseline=ledger();fs.writeFileSync(dir+'/ledger-before.json',JSON.stringify(baseline,null,2));
 const graphHash=json(`SELECT to_json(md5(jsonb_agg(jsonb_build_object('id',id,'nodes',nodes,'connections',connections,'settings',settings) ORDER BY id)::text)) FROM workflow_entity`);state.graph_hash=graphHash;
 sql('BEGIN;UPDATE enrichment_controls SET enabled=false WHERE id;UPDATE enrichment_ai_controls SET enabled=false WHERE id;UPDATE enrichment_linkedin_controls SET enabled=false WHERE id;COMMIT;');save('provider_and_enrichment_claims_paused');
 docker(['exec','n8n','n8n','update:workflow','--all','--active=false']);assert.equal(json('SELECT count(*)::integer FROM workflow_entity WHERE active'),0);docker(['restart','--time','30','n8n']);await health();state.workflows_paused=true;save('maintenance_window_active');assert.deepEqual(inflight(),{executions:0,tasks:0,linkedin:0});
 const backup=docker(['exec','postgres_db','pg_dump','-U','n8n_user','-d','lead_db','-Fc'],undefined,true);fs.writeFileSync(dir+'/before-016.dump',backup);docker(['exec','-i','postgres_db','pg_restore','--list'],backup);state.backup_bytes=backup.length;state.backup_sha256=hash(backup);
 docker(['cp','n8n:/home/node/.n8n/enrichment-stage',dir+'/helpers-before']);save('fresh_backup_and_helper_rollback_saved');
 for(const file of ['worker.cjs','runtime.cjs','observations.cjs','signals.cjs','ai-research.cjs'])docker(['cp','scripts/lead-enrichment/'+file,'n8n:/home/node/.n8n/enrichment-stage/'+file]);
 assert.equal(docker(['exec','n8n','node','-e',"const w=require('/home/node/.n8n/enrichment-stage/worker.cjs');if(typeof w.basic!=='function')process.exit(1);process.stdout.write('OK')"]),'OK');
 sql(migration.toString('utf8'));state.migration_applied=true;save('migration_016_applied');
 assert.equal(json(`SELECT to_json(provolatile='s') FROM pg_proc WHERE oid='enrichment_stamp_source(text,jsonb,text)'::regprocedure`),true);
 assert.equal(json(`SELECT to_json(has_function_privilege('n8n_user','enrichment_source_checks(integer,integer)','EXECUTE'))`),true);
 state.invalidated_profiles=json(`SELECT count(*)::integer FROM enrichment_profiles p WHERE p.basic->>'input_fingerprint' IS DISTINCT FROM enrichment_fingerprint(p.org_id,p.lead_id,'basic')`);assert.equal(state.invalidated_profiles,validated.after.invalid_profiles);
 const seen=new Set();
 for(let round=0;round<3;round++){
  let tasks;sql('UPDATE enrichment_controls SET enabled=true,lead_ids=ARRAY[167,445,446,447,449] WHERE id');
  try{tasks=json(`SELECT coalesce(jsonb_agg(value),'[]'::jsonb) FROM enrichment_claim('basic',2) value`);}finally{sql('UPDATE enrichment_controls SET enabled=false WHERE id');}
  if(!tasks.length)break;
  for(const task of tasks){assert(Number.isSafeInteger(task.id)&&/^[a-f0-9]{32}$/.test(task.lease)&&!seen.has(task.id));seen.add(task.id);
   const metadata=json(`SELECT json_build_object('kind',kind,'lead_id',lead_id) FROM enrichment_tasks WHERE id=${task.id} AND lease=${q(task.lease)}`);assert.equal(metadata.kind,'basic');assert(manifest.canary_leads.includes(metadata.lead_id));
   const output=docker(['exec','n8n','node','/home/node/.n8n/enrichment-stage/worker.cjs',String(task.id),task.lease]);const result=JSON.parse(output);assert.equal(String(result.id),String(task.id));assert.equal(result.lease,task.lease);
   fs.writeFileSync(dir+'/canary-'+task.id+'.json',JSON.stringify(result,null,2));
   const saved=json(`SELECT enrichment_finish(${q(JSON.stringify(result))}::jsonb)`);state.canary.push({lead_id:metadata.lead_id,task_id:task.id,status:result.status,saved:saved.saved===true,outcome:saved.status||saved.reason});save('canary_result');
  }
 }
 const control=before.controls.enrichment_controls[0];const ids=control.lead_ids===null?'NULL':'ARRAY['+control.lead_ids.map(v=>{assert(Number.isSafeInteger(v));return v;}).join(',')+']::integer[]';
 sql(`UPDATE enrichment_controls SET enabled=${control.enabled?'true':'false'},lead_ids=${ids} WHERE id`);
 // Research/LinkedIn remain paused while the old profiles refresh through basic.
 for(const workflow of before.workflows.filter(w=>w.active&&!w.name.startsWith('6B -')&&!w.name.startsWith('6C -'))){assert(/^[A-Za-z0-9_-]{1,36}$/.test(workflow.id));docker(['exec','n8n','n8n','update:workflow','--id='+workflow.id,'--active=true']);}
 docker(['restart','--time','30','n8n']);await health();state.workflows_paused=false;save('previous_schedules_restored_research_held');
 assert.equal(json(`SELECT to_json(md5(jsonb_agg(jsonb_build_object('id',id,'nodes',nodes,'connections',connections,'settings',settings) ORDER BY id)::text)) FROM workflow_entity`),graphHash,'WORKFLOW_GRAPH_CHANGED');assert.deepEqual(ledger(),baseline,'PROVIDER_LEDGER_OR_OUTREACH_CHANGED');
 state.profile_status=json(`SELECT json_build_object('fresh',(SELECT count(*) FROM enrichment_profiles p WHERE p.basic->>'input_fingerprint'=enrichment_fingerprint(p.org_id,p.lead_id,'basic')),'total',(SELECT count(*) FROM enrichment_profiles))`);
 state.completed=true;state.finished_at=new Date().toISOString();save('rollout_complete');console.log(JSON.stringify({completed:true,migration_applied:true,canary:state.canary,profiles:state.profile_status,research_and_linkedin_paused:true,provider_ledgers_unchanged:true,emails_sent:0}));
}
main().catch(error=>{state.error_location=String(error?.stack||'').split('\n').find(line=>line.includes('execute-016-rollout.cjs:'))?.trim();if(fs.existsSync(dir))save('rollout_unconfirmed_inspect_progress_do_not_retry');console.error('ROLLOUT_016_UNCONFIRMED; inspect progress and active states before further changes');process.exitCode=1;});
