'use strict';
// Reviewed local operating configuration only. Empty queue required throughout;
// no enqueue, model/provider call, approval, sending activation or n8n restart.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {configure}=require('../lead-strategy/v2/operating-controls.cjs');
const id='27W04lgTGdgFMWUx',controls={native_email_review:true,customer_templates:true};
function payload(w){return {name:w.name,nodes:w.nodes,connections:w.connections,settings:w.settings};}
async function main(){
 assert(process.argv.includes('--apply-local'),'EXPLICIT_LOCAL_SCOPE_REQUIRED');
 const dir='.local/strategy-operation-20261115';fs.mkdirSync(dir,{recursive:true});assert(!fs.existsSync(dir+'/attempt.json'),'RECONCILE_EXISTING_ATTEMPT');
 const pool=require('../dashboard/start-local-auth.cjs').localPool({registryWrite:true});
 const keyFile=['.local/n8n-api-key','.local/n8n-api-key.txt'].find(f=>fs.existsSync(f)),key=fs.readFileSync(keyFile,'utf8').trim();assert(key&&!/[\r\n]/.test(key));
 const request=async(method,body)=>{const r=await fetch('http://127.0.0.1:5678/api/v1/workflows/'+id,{method,redirect:'error',headers:{'X-N8N-API-KEY':key,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});assert.equal(r.status,200,'N8N_OPERATION_UNCONFIRMED');return r.json();};
 const snapshot=async()=>{const r=await pool.query("SELECT (SELECT enabled FROM strategy_controls WHERE id) AS enabled,(SELECT count(*)::int FROM strategy_jobs WHERE status IN('pending','processing')) AS queued,(SELECT count(*)::int FROM execution_entity WHERE \"workflowId\"='27W04lgTGdgFMWUx' AND status IN('running','new','waiting')) AS running,(SELECT count(*)::int FROM strategy_ai_requests) AS ai_requests,(SELECT count(*)::int FROM strategy_plans) AS plans");return r.rows[0];};
 try{
  const before=await snapshot();assert.equal(before.enabled,false);assert.equal(before.queued,0);assert.equal(before.running,0);
  const live=await request('GET');assert.equal(live.active,true);const desired=configure(live,controls);
  fs.writeFileSync(dir+'/before-workflow.json',JSON.stringify(live));fs.writeFileSync(dir+'/rollback-workflow.json',JSON.stringify(payload(live)));fs.writeFileSync(dir+'/before-controls.json',JSON.stringify(before));
  fs.writeFileSync(dir+'/attempt.json',JSON.stringify({at:new Date().toISOString(),controls}),{flag:'wx'});
  let uncertain=false;try{await request('PUT',payload(desired));}catch{uncertain=true;}
  const installed=await request('GET');assert.equal(installed.active,true);assert.deepEqual(payload(installed),payload(desired),'UPDATE_UNCONFIRMED_DO_NOT_RETRY');
  assert.deepEqual(await snapshot(),before,'STATE_CHANGED_DURING_INSTALL');
  // Persist only the normal operating switch; no job/request is created here.
  const c=await pool.connect();try{await c.query('BEGIN');assert.equal((await c.query('SELECT enabled FROM strategy_controls WHERE id FOR UPDATE')).rows[0].enabled,false);assert.equal((await c.query("SELECT count(*)::int n FROM strategy_jobs WHERE status IN('pending','processing')")).rows[0].n,0);await c.query('UPDATE strategy_controls SET enabled=true WHERE id');await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  const after=await snapshot();assert.equal(after.enabled,true);assert.equal(after.queued,0);assert.equal(after.ai_requests,before.ai_requests);assert.equal(after.plans,before.plans);
  const file='workflows/06C_outreach_strategy_generator.json',source=JSON.parse(fs.readFileSync(file,'utf8'));fs.writeFileSync(file,JSON.stringify(configure(source,controls),null,2)+'\n');
  const result={processing_enabled:true,operator_controls:controls,planner_activation_unchanged:true,container_restarted:false,put_reconciled:uncertain,queue_empty:true,model_calls:0,plans_created:0,outreach_sent:0};fs.writeFileSync(dir+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await pool.end();}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
