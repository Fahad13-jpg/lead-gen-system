'use strict';
const assert=require('node:assert/strict'),c=require('../../scripts/lead-strategy/v2/contract.cjs');
const {generate}=require('../../scripts/lead-strategy/v2/provider.cjs'),native=require('../../scripts/lead-strategy/v2/native.cjs');
async function run(){
 for(const id of [167,449]){
  const f=require('./fixtures/quality-live-'+id+'.json');
  const p={brief:f.brief,qualification:{absence_wording:null}};
  const r=c.validate(f.output,p);
  if(id===167){assert(r.errors.includes('MISSING_THIN_EVIDENCE_FLAG'));assert(r.errors.includes('ANGLE_BENEFIT_MISSING'));}
  else{assert(r.ok);assert.deepEqual(f.output.followups,[]);assert.equal(f.output.fit,'weak');}
 }
 const f=require('./fixtures/quality-live-445.json'),p={brief:f.brief,qualification:{absence_wording:null},prompt:c.prompt,schema:c.schema,prompt_version:'strategy_v2.6',input_hash:c.hash(f.brief)};
 let calls=0;
 const plan=await generate(p,{mocked:true,gate:()=>true,operation:{lease:'offline',reservation:'offline',fingerprint:p.input_hash,lease_expires_at:Date.now()+60000},transport:async()=>{calls++;return{error:f.provider_error};}});
 assert.equal(calls,1);assert.equal(plan.generation.failure_reason,'PROVIDER_RATE_LIMITED');assert.equal(plan.generation.usage_complete,false);assert.equal(plan.strategy,null);
 const assembled=native.assemble({id:1,org_id:1,lease:'offline',mode:'ai',prepared:p,request:{model:'mock'}},{statusCode:429,body:{error:f.provider_error}}).plan;
 assert.equal(assembled.generation.failure_reason,'PROVIDER_RATE_LIMITED');assert.equal(assembled.execution_authorized,false);
 console.log('PASS: saved strong/weak responses replayed; rate limit classified without retries or fallback in provider and native paths.');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
