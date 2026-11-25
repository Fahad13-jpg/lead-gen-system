'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const c=require('../../scripts/lead-strategy/v2/contract.cjs'),f=require('../../scripts/lead-strategy/v2/fixtures.cjs');
test('campaign timing is saved and hash-bound without granting follow-up authority',async()=>{
 const input=(await f.benchmarks())[0].input;
 const p=c.build(input,{now:'2026-10-12T00:00:00Z',readinessSnapshot:f.syntheticReadiness});
 const out=c.template(p),plan=c.plan(p,out,'template_completed'),s=plan.artifacts.schedule;
 assert.equal(s.timezone,'Asia/Karachi');assert.deepEqual(s.sequence.map(x=>x.delay_days),[0,3,4]);
 assert.equal(s.execution_authorized,false);assert.equal(s.timing_enforced,false);
 assert.equal(s.followup_intents[0].delay_days,3);assert.equal(s.followup_intents[0].status,'awaiting_approved_message_and_execution_checks');
 const altered=structuredClone(input);altered.campaign.config.sending_window={start_hour:10,end_hour:16,weekdays:[1,2,3,4,5]};
 const changed=c.build(altered,{now:'2026-10-12T00:00:00Z',readinessSnapshot:f.syntheticReadiness});assert.notEqual(c.plan(changed,c.template(changed),'template_completed').content_hash,plan.content_hash);
 const {content_hash,...body}=plan;body.artifacts.schedule.timezone='UTC';assert.notEqual(c.hash(body),content_hash);
});
test('AI follow-up channel cannot silently replace the campaign sequence',async()=>{
 const input=(await f.benchmarks())[0].input;
 const p=c.build(input,{now:'2026-10-12T00:00:00Z',readinessSnapshot:f.syntheticReadiness});const out=c.template(p);
 out.channel_plan.push({channel:'call',reason:'Permitted mock channel'});out.followups=[{channel:'call',intent:'Ask whether the offer is relevant.'}];
 const plan=c.plan(p,out,'template_completed');assert.equal(plan.artifacts.schedule.followup_intents[0].delay_days,null);
 assert.equal(plan.artifacts.schedule.followup_intents[0].status,'campaign_sequence_review_required');
});
