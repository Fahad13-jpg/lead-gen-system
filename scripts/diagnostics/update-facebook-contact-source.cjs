'use strict';
// Update only request mode and contact parsing. Never starts provider work.
const fs=require('fs'),assert=require('assert/strict');
const dir='.local/facebook-contact-source-20261116',id='CCedag31c0pmbdAL';
async function main(){
 fs.mkdirSync(dir,{recursive:true});assert(!fs.existsSync(dir+'/attempt.json'),'RECONCILE_EXISTING_ATTEMPT');
 const pool=require('../dashboard/start-local-auth.cjs').localPool();
 const key=fs.readFileSync(['.local/n8n-api-key','.local/n8n-api-key.txt'].find(p=>fs.existsSync(p)),'utf8').trim();
 const api=async(method,body)=>{const r=await fetch('http://127.0.0.1:5678/api/v1/workflows/'+id,{method,headers:{'X-N8N-API-KEY':key,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000),redirect:'error'});assert.equal(r.status,200,'WORKFLOW_OPERATION_UNCONFIRMED');return r.json();};
 const payload=w=>({name:w.name,nodes:w.nodes,connections:w.connections,settings:w.settings});
 const norm=s=>s.replace(/\r\n/g,'\n');
 try{
  assert.equal((await pool.query("SELECT count(*)::int n FROM scraping_jobs WHERE source='facebook_pages' AND status IN ('queued','pending','running','needs_review')")).rows[0].n,0,'EXISTING_FACEBOOK_WORK_REQUIRES_REVIEW');
  const live=await api('GET');assert(live.active);const desired=structuredClone(live),source=JSON.parse(fs.readFileSync('workflows/03b_facebook_pages_scraper.json','utf8'));
  for(const name of ['Prepare Actor','Transform Results']){
   const next=source.nodes.find(n=>n.name===name).parameters.jsCode,current=desired.nodes.find(n=>n.name===name);
   if(name==='Prepare Actor')assert.equal(norm(next.replace("searchType:'pages-google'","searchType:'pages'")),norm(current.parameters.jsCode),'UNEXPECTED_PREPARE_CHANGE');
   else{
    const start=next.indexOf('      const external='),end=next.indexOf('\n      const messenger=',start);assert(start>=0&&end>start);
    const old="      const external=[raw.website,...(Array.isArray(raw.websites)?raw.websites:[])].find(v=>typeof v==='string'&&/^https?:\\/\\//i.test(v)&&!/^https?:\\/\\/(?:[^/]+\\.)?(?:facebook\\.com|instagram\\.com|m\\.me)(?:\\/|$)/i.test(v));";
    assert.equal(norm(next.slice(0,start)+old+next.slice(end)),norm(current.parameters.jsCode),'UNEXPECTED_MAPPING_CHANGE');
   }
   current.parameters.jsCode=next;
  }
  assert(!desired.nodes.find(n=>n.name==='Start Apify Actor').retryOnFail);
  fs.writeFileSync(dir+'/rollback-workflow.json',JSON.stringify(payload(live)));fs.writeFileSync(dir+'/attempt.json',JSON.stringify({at:new Date().toISOString()}),{flag:'wx'});
  let uncertain=false;try{await api('PUT',payload(desired));}catch{uncertain=true;}
  const actual=await api('GET');assert(actual.active);assert.deepEqual(payload(actual),payload(desired));
  const result={installed:true,search_mode:'pages-google',one_actor_run:true,existing_routing_settings_credentials_preserved:true,put_reconciled:uncertain,paid_starts:0,ai_requests:0,messages_sent:0,live_contact_yield_verified:false};fs.writeFileSync(dir+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await pool.end();}
}
main().catch(e=>{console.error(e.code||e.message?.slice(0,100)||'FACEBOOK_CONTACT_UPDATE_UNCONFIRMED');process.exitCode=1;});
