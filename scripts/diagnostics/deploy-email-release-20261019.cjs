'use strict';
// Explicitly authorized inactive release. No provider requests or activation.
const fs=require('fs'),cp=require('child_process'),path=require('path'),assert=require('assert/strict');
const bundle=path.resolve('.local/email-release-20261019'),dir=path.resolve('.local/email-deployment-20261019');
const targets=[['gTjsUEP8VLlxKfWf','workflows/07a_email_outreach_executor.json'],['TrgeZrs4ILZnrXuJ','workflows/09_reply_detection.json']];
function docker(args,input,binary=false){const r=cp.spawnSync('docker',args,{input,encoding:binary?undefined:'utf8',timeout:180000,maxBuffer:80e6});if(r.status!==0){if(fs.existsSync(dir))fs.writeFileSync(path.join(dir,'private-error.log'),String(r.stderr||r.error||'command failed'));throw Error('Deployment stopped; inspect private deployment diagnostics. Gates were not opened.');}return binary?r.stdout:r.stdout.trim();}
const sql=q=>docker(['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],q);
const json=q=>JSON.parse(sql(q));
function snapshot(){return json(`SELECT json_build_object(
 'activities',(SELECT md5(coalesce(jsonb_agg(to_jsonb(a) ORDER BY id)::text,'[]')) FROM outreach_activities a),
 'plans',(SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY id)::text,'[]')) FROM strategy_plans p),
 'approvals',(SELECT md5(coalesce(jsonb_agg(to_jsonb(a) ORDER BY id)::text,'[]')) FROM strategy_approvals a),
 'strategy_ledger',(SELECT md5(coalesce(jsonb_agg(to_jsonb(a) ORDER BY to_jsonb(a)::text)::text,'[]')) FROM strategy_ai_requests a),
 'enrichment_ledger',(SELECT md5(coalesce(jsonb_agg(to_jsonb(a) ORDER BY to_jsonb(a)::text)::text,'[]')) FROM enrichment_ai_requests a),
 'other_workflows',(SELECT md5(coalesce(jsonb_agg(jsonb_build_object('id',id,'nodes',nodes,'connections',connections,'active',active) ORDER BY id)::text,'[]')) FROM workflow_entity WHERE id NOT IN ('gTjsUEP8VLlxKfWf','TrgeZrs4ILZnrXuJ')),
 'ai_enabled',(SELECT count(*) FROM strategy_ai_controls WHERE enabled OR monthly_limit<>0));`);}
async function main(){
 assert(['apply','resume-imports'].includes(process.argv[2]),'Explicit apply or resume-imports argument required');
 const resume=process.argv[2]==='resume-imports';
 const manifest=require('../lead-strategy/v2/email-release.cjs').verify(bundle);
 let before,progress;
 if(resume){
  before=JSON.parse(fs.readFileSync(path.join(dir,'before.json'),'utf8'));
  progress=JSON.parse(fs.readFileSync(path.join(dir,'progress.json'),'utf8'));
  assert.deepEqual(progress.migrations,manifest.migrations,'Resume only after all migrations committed');
  assert.deepEqual(progress.imports,[],'Review any partial workflow import before proceeding');
  assert.deepEqual(snapshot(),before.snapshot,'State changed during interrupted deployment');
 }else{
 const pre=cp.spawnSync(process.execPath,['scripts/diagnostics/email-live-preflight.cjs'],{encoding:'utf8',timeout:90000});assert.equal(pre.status,0,'Read-only preflight failed');
 const preflight=JSON.parse(fs.readFileSync('documentation/strategy-contract-v2/email-live-preflight.json','utf8'));assert.deepEqual(preflight.blockers,[]);
 assert.equal(sql("SELECT count(*) FROM strategy_jobs WHERE status IN ('pending','processing')"),'0','Planner work outstanding');
 // A pre-snapshot read error cannot have reached any live mutation. Preserve its
 // diagnostic, but refuse every attempt with backup/progress evidence present.
 if(fs.existsSync(dir))assert(fs.readdirSync(dir).every(f=>f==='private-error.log'),'Prior deployment evidence exists; do not replay');
 else fs.mkdirSync(dir);
 before={snapshot:snapshot(),workflows:targets.map(([id])=>json("SELECT row_to_json(w) FROM workflow_entity w WHERE id='"+id+"'"))};
 assert.equal(before.snapshot.ai_enabled,0);
 before.workflows.forEach(w=>assert.equal(w.active,false));
 fs.writeFileSync(path.join(dir,'before.json'),JSON.stringify(before),{flag:'wx'});
 const previousFunctions=sql("SELECT string_agg(pg_get_functiondef(p.oid),E'\\n' ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'outreach_%'");
 fs.writeFileSync(path.join(dir,'previous-functions.sql'),previousFunctions);
 const backup=docker(['exec','postgres_db','pg_dump','-U','n8n_user','-d','lead_db','-Fc'],undefined,true);assert(backup.length>1000);
 fs.writeFileSync(path.join(dir,'before.dump'),backup,{flag:'wx'});
 const listing=docker(['exec','-i','postgres_db','pg_restore','--list'],backup);assert(listing.includes('TABLE DATA public outreach_activities'));
 progress={started_at:new Date().toISOString(),migrations:[],imports:[],active:false,sends:0};
 fs.writeFileSync(path.join(dir,'progress.json'),JSON.stringify(progress,null,2));
 console.log('Fresh backup saved and archive catalog checked; applying reviewed inactive release.');
 for(const file of manifest.migrations){sql(fs.readFileSync(path.join(bundle,file),'utf8'));progress.migrations.push(file);fs.writeFileSync(path.join(dir,'progress.json'),JSON.stringify(progress,null,2));}
 }
 const save=()=>fs.writeFileSync(path.join(dir,'progress.json'),JSON.stringify(progress,null,2));
 for(const [index,[id,file]] of targets.entries()){
  const old=before.workflows[index],local=JSON.parse(fs.readFileSync(path.join(bundle,file),'utf8'));
  const desired={...old,...local,id,name:local.name||old.name,active:false};
  const project=sql("SELECT \"projectId\" FROM shared_workflow WHERE \"workflowId\"='"+id+"' AND role='workflow:owner'");assert(/^[A-Za-z0-9_-]+$/.test(project),'Single owner project required');
  const f=path.join(dir,'import-'+id+'.json');fs.writeFileSync(f,JSON.stringify(desired));
  const service=JSON.parse(docker(['inspect','n8n']))[0];
  if(service.State.Running){
   docker(['cp',f,'n8n:/tmp/email-release-'+id+'.json']);
   docker(['exec','n8n','n8n','import:workflow','--input=/tmp/email-release-'+id+'.json','--projectId='+project]);
  }else{
   // CLI-only process: no n8n server, timers, webhooks or worker are started.
   // Keep credentials private in memory; never print inspect/env or argv.
   const networks=Object.keys(service.NetworkSettings.Networks);assert.equal(networks.length,1,'Expected one existing service network');
   const cli='email-release-import-'+id.toLowerCase();
   const env=(service.Config.Env||[]).flatMap(e=>['--env',e]);
   docker(['create','--name',cli,'--network',networks[0],'--volumes-from','n8n',...env,'--entrypoint','n8n',service.Image,'import:workflow','--input=/tmp/import.json','--projectId='+project]);
   docker(['cp',f,cli+':/tmp/import.json']);
   docker(['start','-a',cli]);
   const status=JSON.parse(docker(['inspect',cli]))[0];assert.equal(status.State.ExitCode,0,'CLI import failed');
  }
  const current=json("SELECT row_to_json(w) FROM workflow_entity w WHERE id='"+id+"'");
  assert.equal(current.active,false);assert.deepEqual(current.nodes,desired.nodes);assert.deepEqual(current.connections,desired.connections);
  progress.imports.push({id,active:false});save();
 }
 assert.deepEqual(snapshot(),before.snapshot,'Unexpected plan, activity, approval, ledger or unrelated workflow change');
 const check=json(`SELECT json_build_object('step_begin_denied',outreach_email_step_begin('{}')->>'ready'='false',
 'reply_scan_denied',outreach_reply_scan_finish('{}')->>'saved'='false',
 'recovery_denied',outreach_delivery_scan_restart('{}')->>'saved'='false',
 'runtime_grants',has_function_privilege('n8n_user','outreach_email_step_begin(jsonb)','EXECUTE') AND has_function_privilege('n8n_user','outreach_reply_scan_finish(jsonb)','EXECUTE'));`);
 assert(Object.values(check).every(v=>v===true),'Post-apply denied-input/grant smoke failed');
 const result={...progress,completed_at:new Date().toISOString(),verified:check,preserved_snapshot:true,transport_blocked:true,entry_gates_closed:true,provider_calls:0,container_restarts:0,gmail_account_verified:false};
 fs.writeFileSync('documentation/strategy-contract-v2/email-release-deployment-20261019.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
}
main().catch(e=>{console.error(e.message);console.error('Do not rerun automatically. Inspect progress.json; workflows were never activated and sending gates remain closed.');process.exitCode=1;});
