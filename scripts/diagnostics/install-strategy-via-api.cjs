'use strict';
// Uses the installed n8n v1 API update handler, which refreshes only this workflow.
// No CLI import, container restart, activation endpoint, model call or send.
const fs=require('node:fs'),assert=require('node:assert/strict'),cp=require('node:child_process');
const id='27W04lgTGdgFMWUx',allowed=['Prepare Strategy','Validate and Assemble Draft','Build Preview'];
function definition(w){return{nodes:w.nodes,connections:w.connections,settings:w.settings};}
function stripped(w){const d=structuredClone(definition(w));for(const n of d.nodes)if(allowed.includes(n.name))delete n.parameters.jsCode;return d;}
function payload(w){return{name:w.name,...definition(w),staticData:w.staticData??null};}
async function update({request,desired,checkpoint}){
 const before=await request('GET');assert.equal(before.id,id);assert.equal(before.active,true);assert.deepEqual(stripped(before),stripped(desired),'ONLY_REVIEWED_CODE_BODIES_MAY_CHANGE');
 const changed=allowed.filter(name=>before.nodes.find(n=>n.name===name).parameters.jsCode!==desired.nodes.find(n=>n.name===name).parameters.jsCode);
 if(!changed.length)return{already_installed:true,changed_nodes:[]};
 assert.equal(changed.length,3,'UNEXPECTED_PARTIAL_INSTALL_REVIEW_REQUIRED');
 const candidate={...before,nodes:desired.nodes};await checkpoint({before,rollback:payload(before),candidate:payload(candidate)});
 // A failed/ambiguous PUT is reconciled by reading, never replayed.
 let putUnconfirmed=false;try{await request('PUT',payload(candidate));}catch{putUnconfirmed=true;}
 let installed;try{installed=await request('GET');}catch{throw Error('UPDATE_UNCONFIRMED_DO_NOT_RETRY');}
 assert.equal(installed.active,before.active,'ACTIVATION_STATE_CHANGED_REVIEW_REQUIRED');
 assert.deepEqual(payload(installed),payload(candidate),'UPDATE_NOT_CONFIRMED_DO_NOT_RETRY');
 return{installed:true,changed_nodes:changed,activation_unchanged:true,put_reconciled:putUnconfirmed};
}
async function main(){
 assert(process.argv.includes('--apply-local'),'LOCAL_INSTALL_SCOPE_REQUIRED');
 const keyFile=['.local/n8n-api-key','.local/n8n-api-key.txt'].find(file=>fs.existsSync(file));assert(keyFile,'N8N_API_KEY_SETUP_REQUIRED');const key=fs.readFileSync(keyFile,'utf8').trim();assert(key&&!/[\r\n]/.test(key),'INVALID_LOCAL_API_KEY');
 const{localPool}=require('../dashboard/start-local-auth.cjs'),db=localPool();let dir;
 try{
  const state=async()=>(await db.query(`SELECT jsonb_build_object('controls',(SELECT jsonb_agg(to_jsonb(c)) FROM strategy_controls c),'ai_controls',(SELECT jsonb_agg(to_jsonb(c) ORDER BY org_id) FROM strategy_ai_controls c),'jobs',(SELECT md5(coalesce(jsonb_agg(to_jsonb(j) ORDER BY id)::text,'')) FROM strategy_jobs j),'requests',(SELECT md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY lease)::text,'')) FROM strategy_ai_requests r),'plans',(SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY id)::text,'')) FROM strategy_plans p),'other_workflows',(SELECT md5(jsonb_agg(jsonb_build_object('id',id,'active',active,'nodes',nodes,'connections',connections,'settings',settings) ORDER BY id)::text) FROM workflow_entity WHERE id<>'${id}')) result`)).rows[0].result;
  assert.equal((await db.query('SELECT enabled FROM strategy_controls WHERE id')).rows[0].enabled,false,'PROCESSING_MUST_REMAIN_PAUSED');
  assert.equal((await db.query("SELECT count(*)::integer n FROM strategy_jobs WHERE status IN ('pending','processing')")).rows[0].n,0,'STRATEGY_QUEUE_NOT_EMPTY');
  const runtime=cp.spawnSync('docker',['exec','n8n','node','-e',"console.log(JSON.stringify({enabled:process.env.STRATEGY_DRAFT_REVIEW_ENABLED==='true'}))"],{encoding:'utf8',timeout:30000});assert.equal(runtime.status,0);assert.equal(JSON.parse(runtime.stdout).enabled,false,'REVIEW_SWITCH_MUST_REMAIN_OFF');
  const baseline=await state(),desired=JSON.parse(fs.readFileSync('workflows/06C_outreach_strategy_generator.json','utf8'));
  const request=async(method,body)=>{const r=await fetch('http://127.0.0.1:5678/api/v1/workflows/'+id,{method,redirect:'error',headers:{'X-N8N-API-KEY':key,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});if(r.status!==200)throw Error('N8N_API_STATUS_'+r.status);return r.json();};
  const result=await update({request,desired,checkpoint:async value=>{
   assert.deepEqual(await state(),baseline,'STATE_CHANGED_BEFORE_UPDATE');
   dir='.local/strategy-api-install-'+Date.now();fs.mkdirSync(dir,{recursive:true});assert.equal(cp.spawnSync('git',['check-ignore',dir+'/before.json'],{stdio:'ignore'}).status,0);
   for(const name of ['before','rollback','candidate'])fs.writeFileSync(dir+'/'+name+'.json',JSON.stringify(value[name],null,2));
   fs.writeFileSync(dir+'/phase.txt','updating');
  }});
  assert.deepEqual(await state(),baseline,'CONTROL_OR_BUSINESS_STATE_CHANGED');
  Object.assign(result,{processing_paused:true,review_flag_off:true,container_restarted:false,other_workflows_unchanged:true,model_calls:0,outreach_sent:0,report_directory:dir||null});
  if(dir){fs.writeFileSync(dir+'/result.json',JSON.stringify(result,null,2));fs.writeFileSync(dir+'/phase.txt','verified');}console.log(JSON.stringify(result));
 }catch(e){if(dir)fs.writeFileSync(dir+'/failure.json',JSON.stringify({error:e.message,retry_put:false}));throw e;}finally{await db.end();}
}
module.exports={update,payload};
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
