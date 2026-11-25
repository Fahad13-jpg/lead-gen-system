'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {localPool}=require('../dashboard/start-local-auth.cjs'),rt=require('../lead-gathering/runtime.cjs');
const dir='.local/job-recovery-20261117',ids=['Tz2ITCKb2ut8J2ue','RY8gsLPbZm4R3zti','CCedag31c0pmbdAL','fF3AIsbTVvj5I2PD'];
const desiredExpression='={{ $json.apify_actor_run_id != null || $json.dataset_id != null }}';
const payload=w=>({name:w.name,nodes:w.nodes,connections:w.connections,settings:w.settings});
const norm=s=>s.replace(/\r\n/g,'\n').trim();
async function main(){
 assert(process.argv.includes('--apply-local'),'EXPLICIT_LOCAL_INSTALL_REQUIRED');fs.mkdirSync(dir,{recursive:true});assert(!fs.existsSync(dir+'/attempt.json'),'RECONCILE_EXISTING_ATTEMPT');
 const pool=localPool({registryWrite:true}),key=fs.readFileSync(['.local/n8n-api-key','.local/n8n-api-key.txt'].find(p=>fs.existsSync(p)),'utf8').trim();
 const api=async(id,method='GET',body)=>{const r=await fetch('http://127.0.0.1:5678/api/v1/workflows/'+id,{method,headers:{'X-N8N-API-KEY':key,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200,'WORKFLOW_OPERATION_UNCONFIRMED');return r.json();};
 const migration=fs.readFileSync('database/migrations/069_gathering_recovery_provider_evidence.sql','utf8');
 const assertIdle=async()=>assert.equal((await pool.query("SELECT count(*)::int n FROM scraping_jobs WHERE billing_mode IS NOT NULL AND status IN ('pending','running')")).rows[0].n,0,'ACTIVE_GATHERING_WORK_REQUIRES_REVIEW');
 try{
  await assertIdle();const before=(await pool.query("SELECT pg_get_functiondef(oid) source,proowner,proacl::text FROM pg_proc WHERE oid='gathering_recover_v3()'::regprocedure")).rows[0];fs.writeFileSync(dir+'/rollback.sql',before.source);
  const db=await pool.connect();try{
   await db.query('BEGIN');await db.query(migration.replace(/^BEGIN;\r?$/m,'').replace(/^COMMIT;\r?$/m,''));
   const account=(await db.query("SELECT id,org_id FROM gathering_accounts WHERE mode='byok' AND org_id=1")).rows[0];assert(account,'FIXTURE_ACCOUNT_REQUIRED');
   const stamp=Date.parse((await db.query('SELECT now() t')).rows[0].t),ago=ms=>new Date(stamp-ms),batch=crypto.randomUUID();
   const cases=[
    {name:'pending_unstarted',status:'pending',heartbeat:ago(180000),expected:'queued'},
    {name:'partial_reference',status:'pending',heartbeat:ago(180000),run:'offline_partial',expected:'needs_review'},
    {name:'old_started_queue',status:'queued',created:ago(172800000),heartbeat:ago(172800000),started:ago(172800000),run:'offline_run',dataset:'offline_dataset',expected:'needs_review'},
    {name:'old_unstarted_queue',status:'queued',created:ago(172800000),heartbeat:ago(172800000),expected:'cancelled',zero:true},
    {name:'missing_heartbeat',status:'running',started:ago(1260000),heartbeat:null,expected:'needs_review'},
    {name:'saved_resume',status:'pending',started:ago(3600000),heartbeat:ago(0),run:'offline_resume',dataset:'offline_resume_dataset',expected:'pending'},
    {name:'fresh_worker',status:'running',started:ago(120000),heartbeat:ago(0),expected:'running'},
    {name:'legacy_untouched',status:'pending',legacy:true,created:ago(172800000),heartbeat:ago(172800000),expected:'pending'}
   ];
   for(const c of cases){const r=await db.query(`INSERT INTO scraping_jobs(org_id,provider_account_id,source,status,billing_mode,gathering_version,job_name,request_id,max_results,candidate_limit,max_cost_usd,customer_reserved_usd,result_mode,created_at,heartbeat_at,started_at,dispatched_at,apify_actor_run_id,dataset_id)
    VALUES($1,$2,'google_maps',$3,$4,$5,'Rollback-only recovery fixture',$6,5,15,0.5,0,'new',$7::timestamptz,$8::timestamptz,$9::timestamptz,$7::timestamptz,$10,$11) RETURNING id`,[account.org_id,account.id,c.status,c.legacy?null:'byok',c.legacy?0:1,batch+'_'+c.name,c.created||ago(3600000),c.heartbeat,c.started||null,c.run||null,c.dataset||null]);c.id=r.rows[0].id;}
   await db.query('SELECT gathering_recover_v3()');
   for(const c of cases){const r=(await db.query('SELECT status,actual_cost,max_cost_usd,apify_actor_run_id,dataset_id FROM scraping_jobs WHERE id=$1',[c.id])).rows[0];assert.equal(r.status,c.expected,c.name);assert.equal(Number(r.max_cost_usd),.5);assert.equal(r.apify_actor_run_id,c.run||null);assert.equal(r.dataset_id,c.dataset||null);if(c.zero)assert.equal(Number(r.actual_cost),0);else assert.equal(r.actual_cost,null,c.name+' must retain unknown cost');}
   await db.query('ROLLBACK');fs.writeFileSync(dir+'/scratch.json',JSON.stringify({cases:8,passed:true,rolled_back:true,provider_requests:0}));
  }finally{await db.query('ROLLBACK').catch(()=>{});db.release();}
  const beforeParse=`return (${fs.readFileSync(dir+'/parse-start-before.txt','utf8')})();`,afterParse=`return (${rt.parseStart.toString()})();`;
  const edits=[];
  for(const id of ids){const live=await api(id);assert(live.active);const next=structuredClone(live),guard=next.nodes.find(n=>n.name==='Saved Run?'),parse=next.nodes.find(n=>n.name==='Parse Run');
   assert([norm(beforeParse),norm(afterParse)].includes(norm(parse.parameters.jsCode)),'SCRAPER_PARSE_BASELINE_CHANGED');
   assert(['={{ !!$json.apify_actor_run_id && !!$json.dataset_id }}',desiredExpression].includes(guard.parameters.conditions.conditions[0].leftValue),'SCRAPER_BRANCH_BASELINE_CHANGED');
   assert(!next.nodes.find(n=>n.name==='Start Apify Actor').retryOnFail);guard.parameters.conditions.conditions[0].leftValue=desiredExpression;parse.parameters.jsCode=afterParse;
   fs.writeFileSync(dir+'/worker-'+id+'-before.json',JSON.stringify(payload(live)));edits.push({id,next});
  }
  await assertIdle();fs.writeFileSync(dir+'/attempt.json',JSON.stringify({phase:'applying',at:new Date().toISOString()}),{flag:'wx'});
  await pool.query(migration);const after=(await pool.query("SELECT proowner,proacl::text FROM pg_proc WHERE oid='gathering_recover_v3()'::regprocedure")).rows[0];assert.equal(after.proowner,before.proowner);assert.equal(after.proacl,before.proacl);
  for(const {id,next}of edits){try{await api(id,'PUT',payload(next));}catch{/* Reconcile an uncertain write by GET; never repeat PUT. */}const actual=await api(id);assert(actual.active);assert.deepEqual(payload(actual),payload(next));}
  const result={installed:true,workers:4,database_cases:8,legacy_jobs_unchanged:true,owner_and_grants_preserved:true,provider_requests:0,new_jobs_committed:0,outreach_sent:0};fs.writeFileSync(dir+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await pool.end();}
}
main().catch(e=>{console.error(e.code||e.message?.slice(0,120)||'RECOVERY_INSTALL_UNCONFIRMED');process.exitCode=1;});
