'use strict';
// Local 06C Code-body update only. No model calls, job admissions or migration.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {localPool}=require('../dashboard/start-local-auth.cjs');
const id='27W04lgTGdgFMWUx',allowed=['Prepare Strategy','Validate and Assemble Draft','Build Preview'];
const dir=path.resolve('.local/strategy-checklist-'+Date.now());
function docker(args,binary=false){const r=cp.spawnSync('docker',args,{encoding:binary?undefined:'utf8',timeout:120000,maxBuffer:100e6});if(r.status!==0)throw Error('DOCKER_OPERATION_UNCONFIRMED');return r.stdout;}
function definition(w){return {nodes:w.nodes,connections:w.connections,settings:w.settings};}
function stripped(w){const x=structuredClone(definition(w));for(const n of x.nodes)if(allowed.includes(n.name))delete n.parameters.jsCode;return x;}
async function main(){fs.mkdirSync(dir,{recursive:true});const db=localPool();let phase='preflight';try{
 const row=async q=>(await db.query(q)).rows[0];
 const state=async()=>(await row(`SELECT jsonb_build_object(
 'controls',(SELECT jsonb_agg(to_jsonb(c)) FROM strategy_controls c),
 'ai_controls',(SELECT jsonb_agg(to_jsonb(c) ORDER BY org_id) FROM strategy_ai_controls c),
 'requests',(SELECT md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY lease)::text,'')) FROM strategy_ai_requests r),
 'jobs',(SELECT md5(coalesce(jsonb_agg(to_jsonb(j) ORDER BY id)::text,'')) FROM strategy_jobs j),
 'plans',(SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY id)::text,'')) FROM strategy_plans p),
 'approvals',(SELECT count(*) FROM strategy_approvals),
 'other_workflows',(SELECT md5(jsonb_agg(jsonb_build_object('id',id,'active',active,'nodes',nodes,'connections',connections,'settings',settings) ORDER BY id)::text) FROM workflow_entity WHERE id<>'${id}')
 ) state`)).state;
 const before=await row(`SELECT id,name,active,nodes,connections,settings FROM workflow_entity WHERE id='${id}'`);
 assert.equal(before.active,true);assert.equal((await row('SELECT enabled FROM strategy_controls WHERE id')).enabled,false);
 if(process.argv.includes('--require-draft-release-off')){const runtime=JSON.parse(docker(['exec','n8n','node','-e',"console.log(JSON.stringify({enabled:process.env.STRATEGY_DRAFT_REVIEW_ENABLED==='true'}))"]));assert.equal(runtime.enabled,false,'DRAFT_REVIEW_SWITCH_MUST_REMAIN_OFF');}
 assert.equal(Number((await row("SELECT count(*) n FROM strategy_jobs WHERE status IN ('pending','processing')")).n),0);
 const desired=JSON.parse(fs.readFileSync('workflows/06C_outreach_strategy_generator.json','utf8'));
 assert(desired.id===undefined||desired.id===id,'WRONG_WORKFLOW_ID');assert.deepEqual(stripped(desired),stripped(before),'ONLY_THREE_CODE_BODIES_MAY_CHANGE');
 for(const name of allowed)assert(desired.nodes.find(n=>n.name===name).parameters.jsCode.includes('strategy_v2.8'));
 const changed=allowed.filter(name=>desired.nodes.find(n=>n.name===name).parameters.jsCode!==before.nodes.find(n=>n.name===name).parameters.jsCode);
 assert.equal(changed.length,3,'EXPECTED_UNINSTALLED_CHECKLIST_UPDATE');
 // Avoid interrupting even an unrelated local workflow with the CLI reload.
 let idle=false;for(let i=0;i<40;i++){
  if(Number((await row("SELECT count(*) n FROM execution_entity WHERE status IN ('new','running','waiting')")).n)===0){idle=true;break;}
  await new Promise(r=>setTimeout(r,1000));
 }assert(idle,'N8N_NOT_IDLE_NO_IMPORT_PERFORMED');
 // A busy installation must not generate another full backup on each retry.
 const baseline=await state();fs.writeFileSync(dir+'/before.json',JSON.stringify({workflow:before,baseline},null,2));
 assert.equal(cp.spawnSync('git',['check-ignore',dir+'/before.dump'],{stdio:'ignore'}).status,0);
 fs.writeFileSync(dir+'/before.dump',docker(['exec','postgres_db','pg_dump','-U','n8n_user','-d','lead_db','-Fc'],true));
 const file=dir+'/import.json';fs.writeFileSync(file,JSON.stringify({...desired,id,active:false}));
 phase='importing';fs.writeFileSync(dir+'/phase.txt',phase);
 docker(['cp',file,'n8n:/tmp/strategy-checklist-import.json']);
 docker(['exec','n8n','n8n','import:workflow','--input=/tmp/strategy-checklist-import.json','--projectId=xLW48WqYIkxblH0N']);
 docker(['exec','n8n','n8n','update:workflow','--id='+id,'--active=true']);
 docker(['restart','--time','60','n8n']);
 phase='verifying';fs.writeFileSync(dir+'/phase.txt',phase);
 let ready=false;for(let i=0;i<60;i++){try{
  const r=await fetch('http://127.0.0.1:5678/webhook/strategy-report?org_id=1&job_id=3',{signal:AbortSignal.timeout(1500)});
  if([401,403].includes(r.status)){ready=true;break;}
 }catch{}await new Promise(r=>setTimeout(r,1000));}assert(ready,'MANAGEMENT_NOT_READY');
 const installed=await row(`SELECT id,name,active,nodes,connections,settings FROM workflow_entity WHERE id='${id}'`);
 assert.equal(installed.active,true);assert.deepEqual(definition(installed),definition(desired));
 const key=fs.readFileSync('.local/gathering-api-key','utf8').trim();
 const previews=[];
 for(const lead_id of [167,449,446]){
  const r=await fetch('http://127.0.0.1:5678/webhook/strategy-preview',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','X-Lead-Gathering-Key':key},body:JSON.stringify({org_id:1,campaign_id:1,lead_id}),signal:AbortSignal.timeout(15000)});
  assert.equal(r.status,200);const p=await r.json();assert.equal(p.preview,true);assert.equal(p.provider_requests,0);assert.equal(p.ai_generated,false);assert.equal(p.plan,null);
  previews.push({lead_id,fit:p.qualification.fit,provider_requests:0,saved_plan:false});
 }
 assert.deepEqual(await state(),baseline,'UNEXPECTED_CONTROL_OR_BUSINESS_CHANGE');
 const result={installed:true,prompt_version:'strategy_v2.8',changed_nodes:changed,graph_unchanged:true,other_workflows_unchanged:true,processing_paused:true,model_calls:0,previews,quota_and_saved_plans_unchanged:true,report_directory:dir,verified_at:new Date().toISOString()};
 fs.writeFileSync(dir+'/result.json',JSON.stringify(result,null,2));fs.writeFileSync(dir+'/phase.txt','verified');console.log(JSON.stringify(result));
 }catch(e){fs.writeFileSync(dir+'/failure.json',JSON.stringify({phase,error:e.message}));console.error(JSON.stringify({error:e.message,phase,report_directory:dir,retry_import_automatically:false}));process.exitCode=1;}finally{await db.end();}}
main().catch(()=>{console.error('CHECKLIST_UPDATE_UNCONFIRMED');process.exitCode=1;});
