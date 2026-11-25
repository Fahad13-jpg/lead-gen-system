'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const key=fs.readFileSync('.local/gathering-api-key','utf8').trim();
 const get=async(org,lead,auth=true)=>{
  const r=await fetch('http://127.0.0.1:5678/webhook/enrichment-report?org_id='+org+'&lead_id='+lead,{headers:auth?{'X-Lead-Gathering-Key':key}:{},signal:AbortSignal.timeout(10000)});
  let body;try{body=await r.json();}catch{}return {status:r.status,body};
 };
 const summaries=[];
 for(const id of [159,162,165]){
  const {status,body}=await get(1,id);assert.equal(status,200);assert.equal(body.lead_id,id);
  const trust=body.trust;assert.equal(trust.version,'lead_trust_v1');assert.equal(trust.fully_verified,false);assert.equal(trust.usable_for.automatic_outreach,false);
  if(!trust.freshness.website_current||!trust.freshness.research_current||trust.conflicts.length)assert.deepEqual(body.outreach_context,[]);
  summaries.push({lead_id:id,status:trust.overall_status,identity:trust.identity.status,emails:trust.fields.emails.map(e=>e.status)});
 }
 assert.equal((await get(999999,159)).status,404);assert.equal((await get('bad',159)).status,400);
 assert([401,403].includes((await get(1,159,false)).status));
 console.log('PASS live read-only trust API: three existing leads, stale-context gate, no automatic promotion, tenant scope and authentication.');
 console.log(JSON.stringify(summaries));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
