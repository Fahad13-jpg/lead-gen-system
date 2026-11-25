'use strict';
// Non-mutating API checks: malformed requests fail before database writes.
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const key=fs.readFileSync('.local/gathering-api-key','utf8').trim();
 const call=async(path,body,auth=true)=>{
  const r=await fetch('http://127.0.0.1:5678/webhook/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(auth?{'X-Lead-Gathering-Key':key}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});
  let data;try{data=await r.json();}catch{}return {status:r.status,data};
 };
 let unauthorized;
 for(let attempt=0;attempt<45;attempt++){
  try{unauthorized=await call('strategy-report?org_id=1&job_id=1',null,false);if([401,403].includes(unauthorized.status))break;}catch{}
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
 assert(unauthorized,'Live webhook unavailable');
 assert([401,403].includes(unauthorized.status),'Expected auth rejection, received HTTP '+unauthorized.status);
 assert.equal((await call('strategy-report?org_id=0&job_id=1')).status,400);
 assert.equal((await call('strategy-report?org_id=1&job_id=9007199254740991')).status,404);
 assert.equal((await call('strategy-campaign',{org_id:1,config:{}})).status,400);
 assert.equal((await call('strategy-preview',{org_id:true,campaign_id:1,lead_id:1})).status,400);
 assert.equal((await call('strategy-batch',{org_id:1,campaign_id:1,lead_ids:[],request_id:'invalid-batch'})).status,400);
 assert.equal((await call('strategy-approval',{org_id:1})).status,400);
 const config={name:'Validation only',channels:['email'],timezone:'Asia/Karachi',sender:{name:'Test',company:'Test'},offer:{name:'Test',description:'Test'},cta:{text:'Test'},expiry_days:1.5};
 const expiry=await call('strategy-campaign',{org_id:1,config});assert.equal(expiry.status,400);assert.equal(expiry.data.error,'INVALID_EXPIRY');
 console.log('PASS live 06C APIs: authentication, invalid IDs/config/batch/approval, fractional expiry rejection, unknown-job 404. No jobs or campaigns created.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
