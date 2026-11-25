'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Ajv=require('../../dashboard/node_modules/ajv');
const c=require('../../scripts/lead-strategy/v2/contract.cjs'),native=require('../../scripts/lead-strategy/v2/native.cjs');
const {responseFormat}=require('../../scripts/lead-strategy/v2/response-format.cjs');
const {benchmarks}=require('../../scripts/lead-strategy/v2/fixtures.cjs');
test('strict schema accepts a valid draft and rejects wrong channels, empty plans and missing first message',async()=>{
 const input=structuredClone((await benchmarks()).find(f=>f.id===449).input);
 const p=native.prepare({id:1,org_id:input.lead.org_id,lease:'mock',input},{hasKey:true,briefOptions:{now:'2026-10-12T00:00:00Z',readinessSnapshot:{whatsapp:{status:'ready',reasons:[]}}}});
 const format=p.request.response_format;assert.equal(format.type,'json_schema');assert.equal(format.json_schema.strict,true);
 const validate=new Ajv({allErrors:true}).compile(format.json_schema.schema),valid=c.template(p.prepared);
 assert(validate(valid),JSON.stringify(validate.errors));
 for(const mutate of [o=>{o.channel_plan[0].channel='email';},o=>{o.channel_plan=[];},o=>{o.step1=null;},o=>{o.step1.channel='email';},o=>{o.fit='strong';},o=>{o.followups=[{channel:'whatsapp',intent:'Follow up',parts:[]}];}]){
  const bad=structuredClone(valid);mutate(bad);assert.equal(validate(bad),false);
 }
 assert.equal(p.request.max_completion_tokens,6000);assert.equal(p.request.model,'openai/gpt-oss-120b');
 assert(c.validate(valid,p.prepared).ok);assert.equal(c.plan(p.prepared,valid,'ai_completed').execution_authorized,false);
 assert(p.prepared.brief.copy.greeting.includes('If you are considering updating your existing website'));
 const fact=p.prepared.brief.facts.find(f=>f.polarity==='present');
 if(fact){const bad=structuredClone(valid);bad.step1.parts.splice(1,0,{type:'observed',ref:fact.id,text:fact.outgoing_text});bad.personalization_level='lead_specific';assert.equal(validate(bad),false);assert(c.validate(bad,p.prepared).errors.includes('WEAK_FIT_PERSONALIZATION_REQUIRES_REVIEW'));}
});
test('no-channel schema stays blocked and each request gets an isolated schema',async()=>{
 const input=(await benchmarks())[0].input,none=c.build(input,{now:'2026-10-12T00:00:00Z',readinessSnapshot:{}});
 const before=JSON.stringify(none.schema),format=responseFormat(none),validate=new Ajv().compile(format.json_schema.schema);
 assert(validate(c.template(none)));assert.equal(JSON.stringify(none.schema),before);
 const bad=c.template(none);bad.channel_plan=[{channel:'email',reason:'Invented permission'}];assert.equal(validate(bad),false);
 function check(s){if(s.type==='object'){assert.equal(s.additionalProperties,false);assert.deepEqual(s.required,Object.keys(s.properties));Object.values(s.properties).forEach(check);}if(s.items)check(s.items);if(s.anyOf)s.anyOf.forEach(check);}
 check(format.json_schema.schema);
});
