'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {benchmarks,mockReply}=require('../../scripts/lead-strategy/v2/fixtures.cjs');
const native=require('../../scripts/lead-strategy/v2/native.cjs'),c=require('../../scripts/lead-strategy/v2/contract.cjs');
async function sample(){
 const input=structuredClone((await benchmarks()).find(f=>f.id===167).input);
 input.report.basic.services=[{source_url:'https://example.org',text:'Dental cleaning',observed_at:'2026-10-01T00:00:00Z'}];
 const p=native.prepare({id:99,org_id:input.lead.org_id,lease:'offline',input},{hasKey:true,briefOptions:{now:'2026-10-12T00:00:00Z',readinessSnapshot:{whatsapp:{status:'ready',reasons:[]}}}});
 const out=c.template(p.prepared),fact=p.prepared.brief.facts.find(f=>f.polarity==='present');assert(fact);
 out.step1.parts.splice(1,0,{type:'observed',ref:fact.id,text:fact.outgoing_text});out.personalization_level='lead_specific';out.review_flags=out.review_flags.filter(f=>!['weak_offer_fit','offer_relevance_unproven'].includes(f));
 return {p,out};
}
test('application adds only computed review warnings, retaining exact content and approval requirements',async()=>{
 const {p,out}=await sample(),before=structuredClone(out),validation=c.validate(out,p.prepared);
 assert(!validation.ok);assert(validation.errors.every(e=>e.startsWith('MISSING_QUALITY_FLAG:')));
 const result=native.assemble(p,{statusCode:200,body:mockReply(out)}),plan=result.plan;
 assert.equal(plan.state,'ai_completed');assert(c.validate(plan.strategy,p.prepared).ok);
 assert.deepEqual(plan.strategy.step1,before.step1);assert.deepEqual(plan.strategy.followups,before.followups);assert.deepEqual(out,before);
 assert(plan.strategy.review_flags.includes('offer_relevance_unproven'));
 assert.equal(plan.generation.application_review_flags.source,'deterministic_validator');
 assert.equal(plan.generation.attempts,1);assert.equal(plan.approval_required,true);assert.equal(plan.execution_authorized,false);
 const {content_hash,...body}=plan;assert.equal(content_hash,c.hash(body));
});
test('missing warning plus any content or schema defect remains failed without a replacement plan',async()=>{
 for(const mutate of [o=>{o.step1.parts[1].text='Invented claim';},o=>{o.fit='weak';},o=>{o.followups=[{channel:'email',intent:'Follow up',parts:o.step1.parts}];},o=>{o.review_flags='invalid';}]){
  const {p,out}=await sample();mutate(out);const plan=native.assemble(p,{statusCode:200,body:mockReply(out)}).plan;
  assert.equal(plan.state,'ai_failed');assert.equal(plan.strategy,null);assert.equal(plan.generation.application_review_flags,undefined);assert.equal(plan.execution_authorized,false);
 }
});
