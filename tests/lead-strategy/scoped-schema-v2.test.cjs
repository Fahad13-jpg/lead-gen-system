'use strict';
const assert=require('node:assert/strict');
const c=require('../../scripts/lead-strategy/v2/contract.cjs');
const {generate}=require('../../scripts/lead-strategy/v2/provider.cjs');
const {benchmarks,mockReply}=require('../../scripts/lead-strategy/v2/fixtures.cjs');
(async()=>{
 const input=(await benchmarks())[0].input;
 const build=channels=>c.build(input,{now:'2026-10-14T00:00:00Z',readinessSnapshot:Object.fromEntries(channels.map(ch=>[ch,{status:'ready',reasons:[]}]))});
 const both=build(['whatsapp','call']),single=build(['whatsapp']),none=build([]);
 assert.deepEqual(both.schema.properties.followups.items.properties.channel.enum,['whatsapp','call']);
 assert.deepEqual(both.schema.properties.step1.anyOf[0].properties.channel.enum,['whatsapp']);
 assert.deepEqual(single.schema.properties.call_guidance,{type:'null'});
 assert.deepEqual(single.schema.properties.followups.items.properties.channel.enum,['whatsapp']);
 assert.equal(none.schema.properties.followups.maxItems,0);assert.equal(none.schema.properties.channel_plan.maxItems,0);
 assert.deepEqual(none.schema.properties.step1,{type:'null'});
 assert.deepEqual(c.schema.properties.followups.items.properties.channel.enum,['email','sms','whatsapp','linkedin','call']);
 // Independent schema objects and unchanged semantic rejection; never grant permissions via schema.
 single.schema.properties.followups.items.properties.channel.enum.push('email');
 assert.deepEqual(both.schema.properties.followups.items.properties.channel.enum,['whatsapp','call']);
 const bad=c.template(both);bad.followups.push({channel:'email',intent:'Follow up.'});
 assert(c.validate(bad,both).errors.includes('INVALID_FOLLOWUP'));
 assert(c.validate(c.template(none),none).ok);
 let calls=0;const op={lease:'mock',reservation:'mock',fingerprint:both.input_hash,lease_expires_at:Date.now()+60000};
 const plan=await generate(both,{mocked:true,operation:op,gate:()=>true,transport:async req=>{
  calls++;const schema=JSON.parse(req.messages[0].content.split('\nOUTPUT_SCHEMA\n')[1]);
  assert.deepEqual(schema.properties.followups.items.properties.channel.enum,['whatsapp','call']);return mockReply(c.template(both));
 }});
 assert.equal(calls,1);assert.equal(plan.state,'ai_completed');assert(plan.quality_review.campaign_gaps.includes('additional_approved_benefits'));
 const targeted=structuredClone(input);targeted.campaign.config.target_terms=['dental'];
 const p=c.build(targeted,{now:'2026-10-14T00:00:00Z',readinessSnapshot:{},hardCap:3500});
 assert.deepEqual(p.brief.campaign.target_businesses,['dental']);assert(!p.campaign_gaps.includes('target_terms'));
 assert(p.campaign_gaps.includes('evidence_to_benefit_rules'));
 console.log('PASS: scoped schema, first channel, no-call/no-channel shapes, isolation, semantic guard, mocked request, campaign gaps and target context.');
})().catch(e=>{console.error(e);process.exitCode=1;});
