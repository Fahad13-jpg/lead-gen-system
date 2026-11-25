'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const{review}=require('../../scripts/dashboard/plan-review.cjs');
const{dataService}=require('../../scripts/dashboard/data.cjs');
test('manual LinkedIn review exposes exact bounded copy and checked profile without private artifact fields',()=>{
 const p=review({body:{artifacts:{linkedin_manual:{version:'linkedin_manual_v1',secret:'SECRET',target:{profile_url:'https://www.linkedin.com/in/owner/'},steps:[{step:1,delay_days:0,connection_note:'Hello\nthere',message:'Approved text',secret:'SECRET'}]}}}});
 assert.equal(p.linkedin_manual.profile_url,'https://www.linkedin.com/in/owner/');assert.equal(p.linkedin_manual.steps[0].connection_note,'Hello\nthere');assert(!JSON.stringify(p).includes('SECRET'));
 const bad=review({body:{artifacts:{linkedin_manual:{version:'linkedin_manual_v1',target:{profile_url:'javascript:alert(1)'},steps:[{step:1,message:'a'.repeat(501)}]}}}});assert.equal(bad.linkedin_manual.profile_url,null);assert.equal(bad.linkedin_manual.steps[0].message,null);
});
test('plan projection excludes private metadata and bounds message/reference fields',()=>{
 const p=review({id:'1',body:{api_key:'SECRET',generation:{method:'ai',provider_key:'SECRET'},strategy:{step1:{channel:'email',parts:[{type:'observed',ref:'fact_1',text:'Saved observation',secret:'SECRET'}]}}}});
 assert.equal(p.step1.parts[0].ref,'fact_1');assert.ok(!JSON.stringify(p).includes('SECRET'));assert.deepEqual(review({body:{strategy:{followups:null}}}).followups,[]);
});
test('plans require membership and scope campaign, lead and approval queries',async()=>{
 const queries=[];const pool={query:async s=>{queries.push(s);return s.includes('WITH planners AS')?{rows:[{snapshot:null}]}:{rows:[{found:true,total:0,current_version:1,plans:[]}]};}};
 const denied=dataService({pool:{query:async()=>assert.fail()},identity:{principal:async()=>{throw Error('MEMBERSHIP_REQUIRED');}}});
 await assert.rejects(denied.plans('fixture',{org_id:'7',campaign_id:'1'}),/MEMBERSHIP_REQUIRED/);
 const service=dataService({pool,identity:{principal:async()=>{}}});await service.plans('fixture',{org_id:'7',campaign_id:'1'});
 for(const part of ['org_id=7 AND id=1','p.org_id=7','c.org_id=p.org_id','org_id=p.org_id'])assert.ok(queries[0].includes(part));
 assert.equal(queries.length,2);assert(queries[1].includes('org_id=7'));assert(queries[1].includes('c.org_id=7 AND c.id=1'));
 for(const campaign_id of ['1 OR true','9223372036854775808','0'])await assert.rejects(service.plans('fixture',{org_id:'7',campaign_id}),/INVALID_FILTER/);
});
test('failed generation exposes only allowlisted reasons and confirmed bounded usage',()=>{
 const p=review({body:{state:'ai_failed',generation:{failure_reason:'MISSING_QUALITY_FLAG:weak_offer_fit',attempts:1,tokens:{prompt:1791,completion:240,total:2031},usage_complete:true}}});
 assert.equal(p.failure_reason,'MISSING_QUALITY_FLAG:weak_offer_fit');assert.equal(p.generation_details.tokens.total,2031);assert.equal(p.generation_details.attempts,1);
 const unsafe=review({body:{state:'ai_failed',generation:{failure_reason:'private provider response SECRET',attempts:-1,tokens:{total:'2031'},usage_complete:'true'}}});
 assert.equal(unsafe.failure_reason,'GENERATION_FAILED');assert.equal(unsafe.generation_details.attempts,null);assert.equal(unsafe.generation_details.tokens.total,null);assert.equal(unsafe.generation_details.usage_complete,false);assert(!JSON.stringify(unsafe).includes('SECRET'));
 assert.equal(review({body:{state:'ai_completed',generation:{failure_reason:'UNKNOWN_ANGLE'}}}).failure_reason,null);
});
