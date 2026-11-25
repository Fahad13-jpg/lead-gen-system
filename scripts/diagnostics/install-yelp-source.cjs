'use strict';
// Authorized local source installation. No committed test job or paid actor start.
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const rt=require('../lead-gathering/runtime.cjs');
const dir='.local/yelp-source-20261117',mainId='7jPOsS56m3qNOkrI',googleId='Tz2ITCKb2ut8J2ue';
const payload=w=>({name:w.name,nodes:w.nodes,connections:w.connections,settings:w.settings});
async function main(){
 assert(process.argv.includes('--apply-local'),'EXPLICIT_LOCAL_INSTALL_REQUIRED');fs.mkdirSync(dir,{recursive:true});
 assert(!fs.existsSync(dir+'/attempt.json'),'RECONCILE_EXISTING_ATTEMPT');
 const pool=require('../dashboard/start-local-auth.cjs').localPool({registryWrite:true});
 const key=fs.readFileSync(['.local/n8n-api-key','.local/n8n-api-key.txt'].find(p=>fs.existsSync(p)),'utf8').trim();
 const api=async(path,method='GET',body)=>{const r=await fetch('http://127.0.0.1:5678/api/v1/workflows'+path,{method,headers:{'X-N8N-API-KEY':key,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(20000)});assert(r.status>=200&&r.status<300,'N8N_INSTALL_UNCONFIRMED');return r.json();};
 const migration=fs.readFileSync('database/migrations/068_yelp_gathering_source.sql','utf8');
 try{
  assert.equal((await pool.query("SELECT count(*)::int n FROM scraping_jobs WHERE source='yelp'")).rows[0].n,0,'EXISTING_YELP_WORK_REQUIRES_REVIEW');
  const before=(await pool.query("SELECT pg_get_functiondef(oid) source,proowner,proacl::text FROM pg_proc WHERE oid='gathering_enqueue_v3(jsonb)'::regprocedure")).rows[0];
  fs.writeFileSync(dir+'/rollback.sql',before.source);
  const db=await pool.connect();try{
   await db.query('BEGIN');await db.query(migration.replace(/^BEGIN;\r?$/m,'').replace(/^COMMIT;\r?$/m,''));
   const sample={org_id:1,source:'yelp',country_code:'US',job_name:'Rolled-back Yelp admission',search_query:'Plumbers',location:'Austin, Texas, USA',max_results:5,candidate_limit:15,max_cost_usd:.05,max_customer_cost_usd:0,billing_mode:'byok',result_mode:'new',request_id:'yelp_admission_rollback_20261117'};
   const result=(await db.query('SELECT gathering_enqueue_v3($1::jsonb) result',[JSON.stringify(sample)])).rows[0].result;assert(result.job_id&&!result.error,'YELP_ADMISSION_REJECTED');
   for(const patch of [{country_code:'PK'},{country_code:null},{max_results:51},{candidate_limit:151},{max_cost_usd:.51}]){
    await db.query('SAVEPOINT scope_probe');let rejected=false;try{await db.query('SELECT gathering_enqueue_v3($1::jsonb)',[JSON.stringify({...sample,...patch,request_id:sample.request_id+'_invalid'})]);}catch{rejected=true;await db.query('ROLLBACK TO SAVEPOINT scope_probe');}assert(rejected,'YELP_SCOPE_NOT_ENFORCED');
   }
   await db.query('ROLLBACK');fs.writeFileSync(dir+'/admission-probe.json',JSON.stringify({passed:true,rolled_back:true,cases:6,paid_starts:0}));
  }finally{await db.query('ROLLBACK').catch(()=>{});db.release();}
  const live=await api('/'+mainId),google=await api('/'+googleId);assert(live.active&&google.active,'EXISTING_WORKFLOW_NOT_ACTIVE');
  fs.writeFileSync(dir+'/main-before.json',JSON.stringify(payload(live)));
  const worker=structuredClone(google);worker.name='3C - Yelp Scraper';
  const hook=worker.nodes.find(n=>n.name==='Webhook');hook.parameters.path='scrape-yelp';hook.webhookId=crypto.randomUUID();
  const claim=worker.nodes.find(n=>n.name==='Claim Job');assert(claim.parameters.query.includes("'google_maps'"));claim.parameters.query=claim.parameters.query.replace("'google_maps'","'yelp'");
  worker.nodes.find(n=>n.name==='Prepare Actor').parameters.jsCode=`return (${rt.prepareActor.toString()})();`;
  worker.nodes.find(n=>n.name==='Transform Results').parameters.jsCode=`return (${rt.transformResults.toString()})();`;
  assert(!worker.nodes.find(n=>n.name==='Start Apify Actor').retryOnFail);
  const wanted=structuredClone(live),source=JSON.parse(fs.readFileSync('workflows/02_main_orchestrator.json','utf8'));
  assert.equal(wanted.connections['Facebook Pages?'].main[1][0].node,'Dispatch Yellow Pages');
  for(const name of ['Validate Request','Validate Preview'])wanted.nodes.find(n=>n.name===name).parameters.jsCode=`return (${rt.validateRequest.toString()})();`;
  for(const name of ['Yelp?','Dispatch Yelp']){assert(!wanted.nodes.some(n=>n.name===name));wanted.nodes.push(structuredClone(source.nodes.find(n=>n.name===name)));wanted.connections[name]=structuredClone(source.connections[name]);}
  wanted.connections['Facebook Pages?'].main[1][0].node='Yelp?';
  fs.writeFileSync(dir+'/attempt.json',JSON.stringify({phase:'creating_worker',at:new Date().toISOString()}),{flag:'wx'});
  const created=await api('','POST',payload(worker));assert(created.id);fs.writeFileSync(dir+'/worker-created.json',JSON.stringify({id:created.id}));
  await api('/'+created.id+'/activate','POST');assert.equal((await api('/'+created.id)).active,true);
  await pool.query(migration);
  const after=(await pool.query("SELECT proowner,proacl::text FROM pg_proc WHERE oid='gathering_enqueue_v3(jsonb)'::regprocedure")).rows[0];assert.equal(after.proowner,before.proowner);assert.equal(after.proacl,before.proacl);
  let uncertain=false;try{await api('/'+mainId,'PUT',payload(wanted));}catch{uncertain=true;}
  const installed=await api('/'+mainId);assert(installed.active);assert.deepEqual(payload(installed),payload(wanted));
  const actualWorker=await api('/'+created.id);assert.deepEqual(payload(actualWorker),payload(worker));assert(actualWorker.active);
  assert.equal((await pool.query("SELECT count(*)::int n FROM scraping_jobs WHERE source='yelp'")).rows[0].n,0,'UNEXPECTED_YELP_JOB');
  const result={installed:true,worker_id:created.id,scope:'US',admission_checks:6,owner_and_grants_preserved:true,put_reconciled:uncertain,paid_starts:0,messages_sent:0,live_result_quality_verified:false};
  fs.writeFileSync(dir+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await pool.end();}
}
main().catch(e=>{console.error(e.code||e.message?.slice(0,150)||'YELP_INSTALL_UNCONFIRMED');process.exitCode=1;});
