'use strict';
// Install query-aware source filters; replay saved results without a provider call.
const fs=require('fs'),assert=require('assert/strict');
const dir='.local/business-category-filters-20261116';
async function main(){
 fs.mkdirSync(dir,{recursive:true});assert(!fs.existsSync(dir+'/attempt.json'),'RECONCILE_EXISTING_ATTEMPT');
 const pool=require('../dashboard/start-local-auth.cjs').localPool();
 const key=fs.readFileSync(['.local/n8n-api-key','.local/n8n-api-key.txt'].find(p=>fs.existsSync(p)),'utf8').trim();
 const api=async(id,method='GET',body)=>{const r=await fetch('http://127.0.0.1:5678/api/v1/workflows/'+id,{method,headers:{'X-N8N-API-KEY':key,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(20000)});assert(r.ok,'WORKFLOW_OPERATION_UNCONFIRMED');return r.json();};
 const payload=w=>({name:w.name,nodes:w.nodes,connections:w.connections,settings:w.settings});
 try{
  assert.equal((await pool.query("SELECT count(*)::int n FROM scraping_jobs WHERE source='facebook_pages' AND status IN ('queued','pending','running','needs_review')")).rows[0].n,0,'FACEBOOK_WORK_IN_PROGRESS');
  const originals=(await pool.query("SELECT s.raw_data FROM gathering_results r JOIN staging_leads s ON s.id=r.lead_id AND s.org_id=r.org_id WHERE r.org_id=1 AND r.job_id=123 AND r.disposition='new' ORDER BY r.ordinal")).rows.map(r=>r.raw_data);
  assert.equal(originals.length,5);
  const job={source:'facebook_pages',search_query:'Dental clinics',max_results:5,candidate_limit:15,request_settings:{require_contact:true,search_terms:['Dental clinics'],exclude_unrelated_page_types:true}};
  const transform=require('../lead-gathering/runtime.cjs').transformResults;
  const replay=new Function('$input','$',`return (${transform.toString()})();`)({first:()=>({json:{body:originals}})},()=>({first:()=>({json:job})}));
  assert.equal(replay.rows.length,2);assert.equal(replay.excluded.length,3);
  fs.writeFileSync(dir+'/saved-result-replay.json',JSON.stringify({kept:replay.rows.map(r=>r.company_name),excluded:replay.excluded.map(r=>({company:r.company_name,reason:r.reason})),database_rows_changed:0,provider_calls:0},null,2));
  const changes=[{id:'CCedag31c0pmbdAL',file:'03b_facebook_pages_scraper.json',names:['Transform Results']},{id:'7jPOsS56m3qNOkrI',file:'02_main_orchestrator.json',names:['Validate Request','Validate Preview','Prepare Preview']}];
  const prepared=[];
  for(const c of changes){const before=await api(c.id);assert(before.active);const next=structuredClone(before),source=JSON.parse(fs.readFileSync('workflows/'+c.file,'utf8'));
   for(const name of c.names){const node=next.nodes.find(n=>n.name===name),desired=source.nodes.find(n=>n.name===name);assert(node?.type==='n8n-nodes-base.code'&&desired?.parameters?.jsCode);node.parameters.jsCode=desired.parameters.jsCode;}
   assert.deepEqual(next.connections,before.connections);assert.deepEqual(next.settings,before.settings);fs.writeFileSync(dir+'/rollback-'+c.id+'.json',JSON.stringify(payload(before)));prepared.push({id:c.id,next});
  }
  fs.writeFileSync(dir+'/attempt.json',JSON.stringify({at:new Date().toISOString()}),{flag:'wx'});
  for(const {id,next}of prepared){let uncertain=false;try{await api(id,'PUT',payload(next));}catch{uncertain=true;}const actual=await api(id);assert(actual.active);assert.deepEqual(payload(actual),payload(next),uncertain?'UNCERTAIN_UPDATE_NOT_RECONCILED':'UPDATE_READBACK_MISMATCH');}
  const result={installed:true,workflows_updated:2,new_tables:0,provider_calls:0,ai_calls:0,existing_leads_changed:0,saved_result_replay:{retained:2,excluded:3}};fs.writeFileSync(dir+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await pool.end();}
}
main().catch(e=>{console.error(e.code||e.message?.slice(0,100)||'CATEGORY_INSTALL_UNCONFIRMED');process.exitCode=1;});
