'use strict';
const assert=require('assert/strict'),d=require('../../scripts/lead-strategy/v2/dispatch.cjs');
(async()=>{
 const plan={org_id:1,plan_id:2,content_hash:'a'.repeat(32)};const original=JSON.stringify(plan);let calls=0;
 const deps={executeQuery:async sql=>{calls++;assert(sql.includes('outreach_dispatch_reserve'));assert(sql.includes('"org_id":1'));return {reserved:true,lease:'b'.repeat(32),execution_authorized:true};}};
 const r=await d.reserve(plan,deps);assert.equal(r.execution_authorized,false);assert.equal(calls,1);assert.equal(JSON.stringify(plan),original);
 assert.throws(()=>d.payload({...plan,org_id:0}));assert.throws(()=>d.payload(plan,2));assert.throws(()=>d.payload({...plan,content_hash:'local-sha256'}));
 assert.throws(()=>d.query('unexpected',{}));assert(d.query('outreach_dispatch_check',{test:"O'Brien"}).includes("O''Brien"));
 await assert.rejects(()=>d.recheck(plan,'invalid',deps));
 const denied=await d.recheck(plan,'b'.repeat(32),{executeQuery:async()=>({ready:false,reason:'approval_required'})});assert.equal(denied.ready,false);assert.equal(denied.execution_authorized,false);
 console.log('PASS: org/hash identity, first-step-only, escaping, lease validation, no implicit execution authority or plan mutation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
