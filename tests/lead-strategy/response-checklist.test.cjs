'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const c=require('../../scripts/lead-strategy/v2/contract.cjs');
const {benchmarks}=require('../../scripts/lead-strategy/v2/fixtures.cjs');
test('benchmark prompts explicitly constrain angles and required review flags without relaxing validation',async()=>{
 for(const {id,input} of await benchmarks()){
  const p=c.build(input),out=c.template(p);
  assert.equal(p.prompt_version,'strategy_v2.9');
  const requirements=JSON.parse(p.prompt.split('MANDATORY RESPONSE CHECKLIST (trusted application constraints):\n')[1]);
  assert.equal(requirements.fit,p.brief.qualifier.fit);
  assert.deepEqual(requirements.channel_plan,[]);assert.equal(requirements.step1,null);
  assert.equal(requirements.personalization_level,'category_level');
  assert(c.validate(out,p).ok,'Valid blocked plan for '+id);
  for(const flag of requirements.review_flags_must_include){
   assert(out.review_flags.includes(flag));
   const bad=structuredClone(out);bad.review_flags=bad.review_flags.filter(x=>x!==flag);
   assert(!c.validate(bad,p).ok,'Missing required flag still rejected: '+flag);
  }
  const angles=p.brief.qualifier.candidate_angles.map(a=>a.id);
  assert.deepEqual(p.schema.properties.angle_id,angles.length?{enum:angles}:{type:'null'});
  if(angles.length){assert.deepEqual(requirements.angle_id.choose_exactly_one_id,angles);const bad=structuredClone(out);bad.angle_id=null;assert(c.validate(bad,p).errors.includes('UNKNOWN_ANGLE'));}
  else assert.equal(requirements.angle_id,null);
 }
});
