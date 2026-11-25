'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const rt=require('../../scripts/lead-gathering/runtime.cjs'),{projectJob}=require('../../scripts/dashboard/status-summary.cjs');
const parse=job=>new Function('$input','$',`return (${rt.parseStart.toString()})();`)({first:()=>({json:{}})},()=>({first:()=>({json:job})}));
test('every worker routes any saved provider evidence away from a fresh paid start',()=>{
 for(const f of ['03_google_maps_scraper.json','03a_yellow_pages_scraper.json','03b_facebook_pages_scraper.json','03c_yelp_scraper.json']){
  const w=JSON.parse(fs.readFileSync('workflows/'+f,'utf8')),expression=w.nodes.find(n=>n.name==='Saved Run?').parameters.conditions.conditions[0].leftValue;
  const evaluate=new Function('$json','return '+expression.replace(/^=\{\{\s*/,'').replace(/\s*\}\}$/,''));
  for(const job of [{apify_actor_run_id:'run'},{dataset_id:'dataset'},{apify_actor_run_id:''},{apify_actor_run_id:'run',dataset_id:'dataset'}])assert.equal(evaluate(job),true,f);
  assert.equal(evaluate({apify_actor_run_id:null,dataset_id:null}),false);assert.equal(w.connections['Saved Run?'].main[0][0].node,'Parse Run');assert(!w.nodes.find(n=>n.name==='Start Apify Actor').retryOnFail);
 }
});
test('incomplete or malformed saved references are rejected, while a complete pair resumes that exact run',()=>{
 for(const job of [{apify_actor_run_id:'run'},{dataset_id:'dataset'},{apify_actor_run_id:'',dataset_id:''},{apify_actor_run_id:{id:'run'},dataset_id:'dataset'}])assert.throws(()=>parse(job),/REFERENCE_INCOMPLETE/);
 assert.deepEqual(parse({id:1,org_id:7,apify_actor_run_id:'old_run',dataset_id:'old_dataset'}),{job_id:1,org_id:7,run_id:'old_run',dataset_id:'old_dataset'});
});
test('job summaries flag partial references and missing terminal cost without leaking IDs or raw internals',()=>{
 const j={id:1,status:'completed',provider_run_recorded:true,provider_dataset_recorded:false,provider_actual:null};
 const r=projectJob(j);assert.equal(r.lifecycle.status,'needs_attention');assert.equal(r.lifecycle.automatic_retry_allowed,false);assert.equal(r.billing.recorded_provider_cost_usd,null);assert(!Object.hasOwn(r,'provider_run_recorded'));
 assert.equal(projectJob({...j,provider_dataset_recorded:true,provider_references_valid:true}).lifecycle.reason,'provider_cost_unsettled');
});
test('recorded zero cost is distinct from unknown, and source completion never claims assessment or live balance verification',()=>{
 const r=projectJob({status:'completed',provider_cost_recorded:true,provider_actual:0,platform_actual:0,provider_ceiling:.5,billing_mode:'byok'});
 assert.equal(r.lifecycle.label,'Gathering complete');assert.equal(r.billing.recorded_provider_cost_usd,0);assert.equal(r.billing.live_balance_verified,false);
 for(const v of [null,undefined,'',NaN,-1])assert.equal(projectJob({provider_actual:v}).billing.recorded_provider_cost_usd,null);
});
test('stale/missing worker heartbeat is a review case, never an invitation to repeat paid work',()=>{
 const now=Date.parse('2026-11-17T10:00:00+05:00');
 const r=projectJob({status:'running',started_recorded:true,heartbeat_at:new Date(now-1200001).toISOString()},{now});assert.equal(r.lifecycle.reason,'worker_heartbeat_unconfirmed');assert.equal(r.lifecycle.execution_authorized,false);
 assert.equal(projectJob({status:'pending',started_recorded:false,heartbeat_at:new Date(now).toISOString()},{now}).lifecycle.status,'scheduled');
});
