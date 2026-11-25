'use strict';
// Local source installation only: no actor start, message, AI call or committed test job.
const fs=require('fs'),assert=require('assert/strict'),crypto=require('crypto');
const {localPool}=require('../dashboard/start-local-auth.cjs');
const dir='.local/facebook-source-20261115',mainId='7jPOsS56m3qNOkrI',googleId='Tz2ITCKb2ut8J2ue';
async function main(){
 assert(process.argv.includes('--apply-local'),'EXPLICIT_LOCAL_INSTALL_REQUIRED');fs.mkdirSync(dir,{recursive:true});
 assert(!fs.existsSync(dir+'/attempt.json'),'RECONCILE_EXISTING_ATTEMPT');
 const pool=localPool({registryWrite:true});
 const key=fs.readFileSync(['.local/n8n-api-key','.local/n8n-api-key.txt'].find(p=>fs.existsSync(p)),'utf8').trim();
 const api=async(path,method='GET',body)=>{const r=await fetch('http://127.0.0.1:5678/api/v1/workflows'+path,{method,headers:{'X-N8N-API-KEY':key,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(20000)});assert(r.status>=200&&r.status<300,'N8N_INSTALL_UNCONFIRMED');return r.json();};
 const payload=w=>({name:w.name,nodes:w.nodes,connections:w.connections,settings:w.settings});
 try{
  const pending=(await pool.query("SELECT count(*)::int n FROM scraping_jobs WHERE source='facebook_pages' AND status IN ('queued','pending','running','needs_review')")).rows[0].n;assert.equal(pending,0);
  const migration=fs.readFileSync('database/migrations/061_facebook_gathering_source.sql','utf8');
  const before=(await pool.query("SELECT pg_get_functiondef(oid) AS source,proowner,proacl::text FROM pg_proc WHERE oid='gathering_enqueue_v3(jsonb)'::regprocedure")).rows[0];
  fs.writeFileSync(dir+'/rollback.sql',before.source);
  const db=await pool.connect();try{
   await db.query('BEGIN');await db.query(migration.replace(/^BEGIN;\r?$/m,'').replace(/^COMMIT;\r?$/m,''));
   const sample={org_id:1,source:'facebook_pages',job_name:'Rolled-back Facebook admission check',search_query:'Dental clinics',location:'Islamabad, Pakistan',max_results:5,candidate_limit:15,max_cost_usd:0.05,max_customer_cost_usd:0,billing_mode:'byok',result_mode:'new',request_id:'facebook-admission-rollback-20261115'};
   const result=(await db.query('SELECT gathering_enqueue_v3($1::jsonb) result',[JSON.stringify(sample)])).rows[0].result;assert(result.job_id&&!result.error,'FACEBOOK_ADMISSION_REJECTED');
   for(const patch of [{max_results:51,candidate_limit:153},{max_cost_usd:0.51},{candidate_limit:151}]){
    await db.query('SAVEPOINT scope_probe');let rejected=false;try{await db.query('SELECT gathering_enqueue_v3($1::jsonb)',[JSON.stringify({...sample,...patch,request_id:sample.request_id+'-invalid'})]);}catch{rejected=true;await db.query('ROLLBACK TO SAVEPOINT scope_probe');}assert(rejected,'FACEBOOK_SCOPE_NOT_ENFORCED');
   }
   await db.query('ROLLBACK');fs.writeFileSync(dir+'/admission-probe.json',JSON.stringify({passed:true,rolled_back:true,valid_and_overscope_cases:4,provider_requests:0}));
  }finally{await db.query('ROLLBACK').catch(()=>{});db.release();}
  const live=await api('/'+mainId),google=await api('/'+googleId);assert(live.active&&google.active);
  fs.writeFileSync(dir+'/main-before.json',JSON.stringify(live));
  const worker=structuredClone(google);worker.name='3B - Facebook Pages Scraper';
  const source=JSON.parse(fs.readFileSync('workflows/03b_facebook_pages_scraper.json','utf8'));
  const hook=worker.nodes.find(n=>n.name==='Webhook');hook.parameters.path='scrape-facebook-pages';hook.webhookId=crypto.randomUUID();
  const claim=worker.nodes.find(n=>n.name==='Claim Job');assert(claim.parameters.query.includes("'google_maps'"));claim.parameters.query=claim.parameters.query.replace("'google_maps'","'facebook_pages'");
  for(const name of ['Prepare Actor','Transform Results'])worker.nodes.find(n=>n.name===name).parameters.jsCode=source.nodes.find(n=>n.name===name).parameters.jsCode;
  assert(!worker.nodes.find(n=>n.name==='Start Apify Actor').retryOnFail);
  const wanted=structuredClone(live),mainSource=JSON.parse(fs.readFileSync('workflows/02_main_orchestrator.json','utf8'));
  assert.equal(wanted.connections['Google Maps?'].main[1][0].node,'Dispatch Yellow Pages');
  for(const name of ['Validate Request','Validate Preview'])wanted.nodes.find(n=>n.name===name).parameters.jsCode=mainSource.nodes.find(n=>n.name===name).parameters.jsCode;
  for(const name of ['Facebook Pages?','Dispatch Facebook Pages']){assert(!wanted.nodes.some(n=>n.name===name));wanted.nodes.push(structuredClone(mainSource.nodes.find(n=>n.name===name)));wanted.connections[name]=structuredClone(mainSource.connections[name]);}
  wanted.connections['Google Maps?'].main[1][0].node='Facebook Pages?';
  fs.writeFileSync(dir+'/attempt.json',JSON.stringify({at:new Date().toISOString(),phase:'creating_worker'}),{flag:'wx'});
  const created=await api('','POST',payload(worker));assert(created.id);fs.writeFileSync(dir+'/worker-created.json',JSON.stringify({id:created.id}));
  await api('/'+created.id+'/activate','POST');assert.equal((await api('/'+created.id)).active,true);
  await pool.query(migration);
  const after=(await pool.query("SELECT proowner,proacl::text FROM pg_proc WHERE oid='gathering_enqueue_v3(jsonb)'::regprocedure")).rows[0];assert.equal(after.proowner,before.proowner);assert.equal(after.proacl,before.proacl);
  await api('/'+mainId,'PUT',payload(wanted));const installed=await api('/'+mainId);assert(installed.active);assert.deepEqual(payload(installed),payload(wanted));
  const result={installed:true,worker_id:created.id,admission_scope_checked:true,existing_main_settings_preserved:true,paid_starts:0,ai_calls:0,messages_sent:0};fs.writeFileSync(dir+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await pool.end();}
}
main().catch(e=>{console.error((e.code||'')+': '+(e.message?.slice(0,180)||'FACEBOOK_INSTALL_UNCONFIRMED'));process.exitCode=1;});
