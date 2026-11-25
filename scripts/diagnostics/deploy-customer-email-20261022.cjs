'use strict';
// User-authorized LOCAL inactive deployment only. No activation, provider calls or sends.
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),assert=require('node:assert/strict');
const root=process.cwd(),bundle=path.resolve('releases/customer-email-20261022'),dir=path.resolve('.local/customer-email-deployment-20261022');
const targets=[['27W04lgTGdgFMWUx','workflows/06C_outreach_strategy_generator.json'],['gTjsUEP8VLlxKfWf','workflows/07a_email_outreach_executor.json'],['TrgeZrs4ILZnrXuJ','workflows/09_reply_detection.json']];
const ids=targets.map(([id])=>"'"+id+"'").join(',');
function docker(args,input,binary=false){const r=cp.spawnSync('docker',args,{input,encoding:binary?undefined:'utf8',maxBuffer:100e6,timeout:180000});if(r.status!==0){if(fs.existsSync(dir))fs.writeFileSync(path.join(dir,'private-error.log'),String(r.stderr||r.error||'failed'));throw Error('Docker operation failed; see private deployment error log');}return binary?r.stdout:r.stdout.trim();}
const sql=q=>docker(['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],q);
const json=q=>JSON.parse(sql(q));
function state(){return json(`SELECT json_build_object('activities',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) FROM outreach_activities t),'plans',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) FROM strategy_plans t),'approvals',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) FROM strategy_approvals t),'ai_requests',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY lease)::text,'[]')) FROM strategy_ai_requests t),'ai_controls',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY org_id)::text,'[]')) FROM strategy_ai_controls t),'other_workflows',(SELECT md5(coalesce(jsonb_agg(jsonb_build_object('id',id,'nodes',nodes,'connections',connections,'active',active) ORDER BY id)::text,'[]')) FROM workflow_entity WHERE id NOT IN (${ids})));`);}
function strip(w,index){const nodes=structuredClone(w.nodes);for(const n of nodes){if(index===0&&n.type==='n8n-nodes-base.code')delete n.parameters.jsCode;if(index===1&&n.name==='Prepare Email Content')delete n.parameters.jsCode;if(index===1&&n.name==='Get Email-Ready Leads')delete n.parameters.query;}return {nodes,connections:w.connections};}
async function main(){
 if(process.argv[2]==='verify'){
  const progress=JSON.parse(fs.readFileSync(path.join(dir,'progress.json'),'utf8'));
  const before=JSON.parse(fs.readFileSync(path.join(dir,'before.json'),'utf8'));
  assert(progress.migration_applied&&progress.restarted&&progress.imports.length===3,'Incomplete deployment; inspect first');
  require('../organization-policy/customer-release.cjs').verify(bundle);
  for(const [id] of targets){const expected=JSON.parse(fs.readFileSync(path.join(dir,'import-'+id+'.json'),'utf8'));const live=json("SELECT row_to_json(w) FROM workflow_entity w WHERE id='"+id+"'");assert.equal(live.active,false);assert.deepEqual(live.nodes,expected.nodes);assert.deepEqual(live.connections,expected.connections);}
  assert.deepEqual(state(),before.snapshot,'Unexpected business data or unrelated workflow change');
  assert.equal(sql('SELECT enabled FROM strategy_controls WHERE id'),'f');
  assert.equal(sql("SELECT has_function_privilege('n8n_user','strategy_approval(jsonb)','EXECUTE')"),'t');
  const body=sql("SELECT prosrc FROM pg_proc WHERE oid='strategy_approval(jsonb)'::regprocedure");const proposed=fs.readFileSync(path.join(bundle,'database/migrations/032_customer_content_approval.sql'),'utf8').match(/AS \$\$([\s\S]*?)\$\$;/)[1];assert.equal(body.trim(),proposed.trim());
  const health=JSON.parse(docker(['exec','n8n','node','-e',"fetch('http://127.0.0.1:5678/healthz',{signal:AbortSignal.timeout(5000)}).then(r=>console.log(JSON.stringify({status:r.status,customer_enabled:process.env.CUSTOMER_EMAIL_TEMPLATES_ENABLED==='true'}))).catch(()=>process.exit(1))"]));assert.equal(health.status,200);assert.equal(health.customer_enabled,false);
  const result={...progress,completed_at:new Date().toISOString(),health:true,health_check:'container internal endpoint; initial host check timed out',sql_body_verified:true,runtime_grant_verified:true,business_state_preserved:true,workflows_inactive:true,planner_paused:true,customer_flag_enabled:false,sending_enabled:false,provider_calls:0,emails_sent:0};
  fs.writeFileSync('documentation/strategy-contract-v2/customer-email-deployment-20261022.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));return;
 }
 assert.equal(process.argv[2],'apply','Explicit apply required');assert(!fs.existsSync(dir),'Prior deployment exists; inspect before retry');
 require('../organization-policy/customer-release.cjs').verify(bundle);
 assert.equal(sql('SELECT current_database()'),'lead_db');
 assert.equal(sql("SELECT count(*) FROM strategy_jobs WHERE status IN ('pending','processing')"),'0');
 assert.equal(sql("SELECT count(*) FROM execution_entity WHERE status IN ('new','running','waiting')"),'0','Running executions: do not restart');
 const service=JSON.parse(docker(['inspect','n8n']))[0];assert(service.State.Running);
 const env=Object.fromEntries(service.Config.Env.map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)];}));
 assert.notEqual(env.CUSTOMER_EMAIL_TEMPLATES_ENABLED,'true','Customer flag already enabled');
 assert.equal(env.STRATEGY_CONTRACT_VERSION,'strategy_v2');
 assert((env.NODE_FUNCTION_ALLOW_BUILTIN||'').split(',').some(s=>['crypto','*'].includes(s.trim())),'crypto not allowed');
 const before=targets.map(([id])=>json("SELECT row_to_json(w) FROM workflow_entity w WHERE id='"+id+"'"));
 const desired=targets.map(([id,file],i)=>{const w=JSON.parse(fs.readFileSync(path.join(bundle,file),'utf8'));assert(before[i]);assert.deepEqual(strip(w,i),strip(before[i],i),'Unexpected live graph/credential/non-code drift');if(i>0)assert.equal(before[i].active,false);return {...before[i],...w,id,active:false,settings:w.settings||before[i].settings};});
 // Compare baseline function bodies with the latest definitions in local migrations through 031.
 const expected=new Map();for(const f of fs.readdirSync('database/migrations').filter(f=>/^\d{3}_.*\.sql$/.test(f)&&Number(f.slice(0,3))<=31).sort()){
  const s=fs.readFileSync(path.join('database/migrations',f),'utf8');for(const m of s.matchAll(/CREATE OR REPLACE FUNCTION\s+(\w+)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/g))if(m[1]==='strategy_approval'||m[1].startsWith('outreach_'))expected.set(m[1],m[2].trim());
 }
 const functions=json("SELECT json_agg(json_build_object('name',p.proname,'body',p.prosrc)) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND (p.proname='strategy_approval' OR p.proname LIKE 'outreach_%')");
 for(const [name,body] of expected){const found=functions.filter(f=>f.name===name);assert.equal(found.length,1,'Missing/overloaded baseline '+name);assert.equal(found[0].body.trim(),body,'Baseline drift '+name);}
 fs.mkdirSync(dir,{recursive:true});const snapshot=state();
 fs.writeFileSync(path.join(dir,'before.json'),JSON.stringify({workflows:before,snapshot,planner_enabled:sql('SELECT enabled FROM strategy_controls WHERE id')}));
 fs.writeFileSync(path.join(dir,'previous-approval.sql'),sql("SELECT pg_get_functiondef('strategy_approval(jsonb)'::regprocedure)"));
 fs.writeFileSync(path.join(dir,'previous-approval-permissions.json'),sql("SELECT row_to_json(p) FROM (SELECT pg_get_userbyid(proowner) AS owner,proacl FROM pg_proc WHERE oid='strategy_approval(jsonb)'::regprocedure) p"));
 const backup=docker(['exec','postgres_db','pg_dump','-U','n8n_user','-d','lead_db','-Fc'],undefined,true);assert(backup.length>1000);fs.writeFileSync(path.join(dir,'before.dump'),backup);
 assert(docker(['exec','-i','postgres_db','pg_restore','--list'],backup).includes('TABLE DATA public strategy_plans'));
 const progress={started_at:new Date().toISOString(),baseline_functions:expected.size,backup_catalog_verified:true,migration_applied:false,imports:[],restarted:false};
 const save=()=>fs.writeFileSync(path.join(dir,'progress.json'),JSON.stringify(progress,null,2));save();
 console.log('Baseline verified; fresh backup and exact workflow snapshots saved.');
 sql('UPDATE strategy_controls SET enabled=false WHERE id;');
 sql(fs.readFileSync(path.join(bundle,'database/migrations/032_customer_content_approval.sql'),'utf8'));progress.migration_applied=true;save();
 for(let i=0;i<targets.length;i++){
  const [id]=targets[i];const project=sql("SELECT \"projectId\" FROM shared_workflow WHERE \"workflowId\"='"+id+"' AND role='workflow:owner'");assert(/^[A-Za-z0-9_-]+$/.test(project));
  const file=path.join(dir,'import-'+id+'.json');fs.writeFileSync(file,JSON.stringify(desired[i]));
  docker(['cp',file,'n8n:/tmp/customer-email-'+id+'.json']);
  docker(['exec','n8n','n8n','import:workflow','--input=/tmp/customer-email-'+id+'.json','--projectId='+project]);
  const current=json("SELECT row_to_json(w) FROM workflow_entity w WHERE id='"+id+"'");assert.equal(current.active,false);assert.deepEqual(current.nodes,desired[i].nodes);assert.deepEqual(current.connections,desired[i].connections);
  progress.imports.push({id,active:false});save();
 }
 // Reload scheduler registrations after CLI imports; all target workflows remain inactive.
 assert.equal(sql("SELECT count(*) FROM execution_entity WHERE status IN ('new','running','waiting')"),'0');
 docker(['restart','--time','60','n8n']);progress.restarted=true;save();
 let healthy=false;for(let i=0;i<30;i++){try{if((await fetch('http://127.0.0.1:5678/healthz',{signal:AbortSignal.timeout(1500)})).ok){healthy=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}assert(healthy,'n8n health failed');
 assert.deepEqual(state(),snapshot,'Unexpected business data or unrelated workflow changes');
 assert.equal(sql("SELECT count(*) FROM workflow_entity WHERE id IN ("+ids+") AND active"),'0');
 assert.equal(sql("SELECT has_function_privilege('n8n_user','strategy_approval(jsonb)','EXECUTE')"),'t');
 const body=sql("SELECT prosrc FROM pg_proc WHERE oid='strategy_approval(jsonb)'::regprocedure");const proposed=fs.readFileSync(path.join(bundle,'database/migrations/032_customer_content_approval.sql'),'utf8').match(/AS \$\$([\s\S]*?)\$\$;/)[1];assert.equal(body.trim(),proposed.trim());
 const result={...progress,completed_at:new Date().toISOString(),health:true,sql_body_verified:true,runtime_grant_verified:true,business_state_preserved:true,workflows_inactive:true,planner_paused:true,customer_flag_enabled:false,sending_enabled:false,provider_calls:0,emails_sent:0};
 fs.writeFileSync('documentation/strategy-contract-v2/customer-email-deployment-20261022.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
main().catch(e=>{console.error(e.message);console.error('Deployment stopped. Inspect private progress before retrying; do not activate or send.');process.exitCode=1;});
