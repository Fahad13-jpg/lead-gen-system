'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const before=JSON.parse(fs.readFileSync('documentation/STRATEGY_SAMPLE_PLANS.json'));
const after=JSON.parse(fs.readFileSync('documentation/STRATEGY_SAMPLE_PLANS_AFTER.json'));
assert.equal(after.results.length,5);assert.deepEqual(after.campaign,before.campaign);
for(const r of after.results){
 const prior=before.results.find(v=>v.lead_id===r.lead_id);assert(prior);
 const p=r.plan,email=p.messages.find(m=>m.channel==='email'),call=p.messages.find(m=>m.channel==='call');
 assert.deepEqual(p.scores,prior.plan.scores);assert.equal(p.execution_authorized,false);assert.deepEqual(p.validation_errors,[]);
 assert(email.body.includes('Reply STOP'));assert(!email.warning_codes.includes('opt_out_instructions_required'));
 assert.notEqual(call.body,p.messages.find(m=>m.channel==='linkedin').body);assert(p.call_brief.permission_question);
 assert.equal(call.plan_role,'blocked_alternative_not_scheduled');
 assert.equal(p.generation.method,'deterministic_template');
 if(r.lead_id===449){assert.equal(email.evidence_ids.length,1);const e=p.evidence.find(e=>e.id===email.evidence_ids[0]);assert(e);assert(email.body.includes(e.quote));}
 else assert.deepEqual(email.evidence_ids,[]);
}
console.log('PASS five real-lead sample plans: opt-out wording, sourced personalization where supported, distinct calling opening, alternative labels, unchanged scores and zero authorization.');
