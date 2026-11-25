'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const key=fs.readFileSync('.local/gathering-api-key','utf8').trim(),base='http://127.0.0.1:5678/webhook/contact-status?org_id=';
 const get=async(value,auth=true)=>{const r=await fetch(base+value,{headers:auth?{'X-Lead-Gathering-Key':key}:{},signal:AbortSignal.timeout(5000)});let body;try{body=await r.json();}catch{}return {status:r.status,body};};
 const deadline=Date.now()+180000;let ready;
 while(Date.now()<deadline){try{const r=await get('1');if(r.status===200&&r.body?.org_id===1&&['source_first_v1','contact_evidence_v2'].includes(r.body.strategy)){ready=r;break;}}catch{}await new Promise(r=>setTimeout(r,2000));}
 assert(ready,'Source-first status endpoint did not become ready');assert.equal(ready.body.verification_paused,true);assert.equal(ready.body.paid_discovery_enabled,false);
 assert([401,403].includes((await get('1',false)).status));assert.equal((await get('bad')).status,400);
 console.log('PASS: source-first status API, authentication, input checks and paused verification.');console.log(JSON.stringify(ready.body));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
