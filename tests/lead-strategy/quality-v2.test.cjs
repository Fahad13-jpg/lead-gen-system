'use strict';
const assert=require('node:assert/strict');
const c=require('../../scripts/lead-strategy/v2/contract.cjs');
const {benchmarks,syntheticReadiness}=require('../../scripts/lead-strategy/v2/fixtures.cjs');
async function run(){
 const fixtures=await benchmarks();let passed=0;
 const test=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
 const build=i=>c.build(i,{now:'2026-10-12T00:00:00Z',readinessSnapshot:syntheticReadiness});
 test('weak fit has explicit review and no routine template followups',()=>{
  const p=build(fixtures.find(f=>f.id===449).input),o=c.template(p);
  assert(o.review_flags.includes('weak_offer_fit'));assert.deepEqual(o.followups,[]);
  assert(!o.step1.parts.some(p=>p.type==='observed'));assert(c.validate(o,p).ok);
  o.review_flags=o.review_flags.filter(x=>x!=='weak_offer_fit');assert(!c.validate(o,p).ok);
 });
 test('all three uncertain benchmark leads require fit review',()=>{
  for(const id of [445,446,447]){const p=build(fixtures.find(f=>f.id===id).input),o=c.template(p);assert(o.review_flags.includes('fit_not_established'));assert.equal(o.personalization_level,'category_level');assert(c.validate(o,p).ok);}
 });
 function matched(){
  const i=structuredClone(fixtures[0].input);
  i.report.basic.services=[{source_url:'https://example.org/services',text:'Online booking',observed_at:'2026-10-01T00:00:00Z'}];
  i.campaign.config.offer_fit_rules=[{evidence_terms:['online booking'],approved_point_index:0}];
  return i;
 }
 test('approved rule yields relevant quotation without changing fit',()=>{
  const p=build(matched()),o=c.template(p),plan=c.plan(p,o,'template_completed');
  assert.equal(o.personalization_level,'lead_specific');assert(c.validate(o,p).ok);
  assert.equal(plan.quality_review.benefit_relevance,'customer_rule_match_not_confirmed_need');
  assert.equal(plan.quality_review.confirmed_need,false);assert.equal(o.fit,'strong');
 });
 test('same fact without approved rule does not claim offer relevance',()=>{
  const i=matched();i.campaign.config.offer_fit_rules=[];
  const p=build(i),o=c.template(p);assert.equal(o.personalization_level,'category_level');
  const f=p.brief.facts.find(f=>f.polarity==='present');
  o.step1.parts.splice(1,0,{type:'observed',ref:f.id,text:f.outgoing_text});o.personalization_level='lead_specific';
  assert(c.validate(o,p).errors.includes('MISSING_QUALITY_FLAG:offer_relevance_unproven'));
  o.review_flags.push('offer_relevance_unproven');assert(c.validate(o,p).ok);
 });
 test('invalid benefit mapping and blank terms cannot create relevance',()=>{
  const i=matched();i.campaign.config.offer_fit_rules=[{evidence_terms:['online booking'],approved_point_index:99},{evidence_terms:[' '],approved_point_index:0}];
  assert.deepEqual(build(i).brief.relevance.matches,[]);
 });
 test('relevant evidence survives ahead of decorative text and pruned references vanish',()=>{
  const i=matched();i.report.basic.services.unshift(...Array.from({length:6},(_,n)=>({source_url:'https://example.org',text:'Decorative heading '+n,observed_at:'2026-10-01T00:00:00Z'})));
  const p=build(i);assert(p.brief.relevance.matches.length>0);
  assert.equal(p.brief.facts[0].data.text,'Online booking');
  for(const m of p.brief.relevance.matches)assert(p.brief.facts.some(f=>f.id===m.fact_id));
  assert(p.token_estimate.brief_upper_bound<=2500);
 });
 test('later matched benefit selects its corresponding angle and fact',()=>{
  const i=matched();i.campaign.config.offer.approved_points=['Displays clinic information.','Includes an enquiry form.'];
  i.campaign.config.offer_fit_rules=[{evidence_terms:['online booking'],approved_point_index:1}];
  const p=c.build(i,{now:'2026-10-12T00:00:00Z',readinessSnapshot:syntheticReadiness,hardCap:3500});
  const o=c.template(p),plan=c.plan(p,o,'template_completed');
  assert.equal(o.angle_id,'a2');assert(o.step1.parts.some(x=>x.type==='offer'&&x.ref==='b2'));
  assert(!o.step1.parts.some(x=>x.type==='offer'&&x.ref==='b1'));
  assert.equal(plan.quality_review.personalization_status,'supported_personalization');assert.equal(o.fit,'strong');
 });
 test('review distinguishes unused relevant evidence from missing evidence',()=>{
  const p=build(matched()),o=c.template(p);
  o.step1.parts=o.step1.parts.filter(x=>x.type!=='observed');o.personalization_level='category_level';
  assert.equal(c.plan(p,o,'template_completed').quality_review.personalization_status,'relevant_evidence_unused');
  const i=matched();i.campaign.config.offer_fit_rules=[];const q=build(i);
  assert.equal(c.plan(q,c.template(q),'template_completed').quality_review.personalization_status,'no_approved_benefit_match');
  const thin=build(fixtures[0].input);
  assert.equal(c.plan(thin,c.template(thin),'template_completed').quality_review.personalization_status,'insufficient_evidence');
 });
 test('failed and blocked plans cannot appear personalized or ready',()=>{
  const p=build(matched());const failed=c.plan(p,null,'ai_failed');
  assert.equal(failed.quality_review.personalization_status,'no_valid_plan');
  assert(failed.quality_review.next_action.includes('no draft is ready'));
  const blocked=c.build(matched(),{now:'2026-10-12T00:00:00Z',readinessSnapshot:{}});
  const plan=c.plan(blocked,c.template(blocked),'template_completed');
  assert.equal(plan.quality_review.personalization_status,'no_permitted_channel');assert.equal(plan.execution_authorized,false);
 });
 return{passed,scope:'offline relevance rules and draft quality controls; no model evaluation'};
}
if(require.main===module)run().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={run};
