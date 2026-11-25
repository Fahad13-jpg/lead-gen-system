'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const c=require('../../scripts/lead-strategy/v2/contract.cjs'),f=require('../../scripts/lead-strategy/v2/fixtures.cjs'),r=require('../../scripts/lead-strategy/v2/followup-readiness.cjs');
async function setup(){const input=(await f.benchmarks())[0].input;input.campaign.config.channels=['email'];input.campaign.config.sequence=input.campaign.config.sequence.map(s=>({...s,channel:'email'}));const p=c.build(input,{now:'2026-10-12T00:00:00Z',readinessSnapshot:{email:{status:'ready',reasons:[]}}});return {p,out:c.template(p)};}
test('complete template sequence produces hash-bound drafts with delays and explicit method',async()=>{
 const {p,out}=await setup(),plan=c.plan(p,out,'template_completed');assert.equal(plan.artifacts.followup_drafts.length,2);
 assert.deepEqual(plan.artifacts.followup_drafts.map(d=>d.delay_days),[3,4]);
 for(const d of plan.artifacts.followup_drafts){assert(d.body.includes('Reply STOP'));assert.equal(d.method,'template');assert.equal(d.execution_authorized,false);}
 const {content_hash,...b}=plan;b.artifacts.followup_drafts[0].body+=' changed';assert.notEqual(c.hash(b),content_hash);
});
test('missing AI draft remains missing; unsupported claims and missing opt-out reject',async()=>{
 const {p,out}=await setup();delete out.followups[0].parts;
 assert.equal(c.plan(p,out,'ai_completed').artifacts.followup_drafts[0].status,'message_missing');
 const invalid=c.template(p);invalid.followups[0].parts[1].text='Guaranteed growth';assert(!c.validate(invalid,p).ok);
 const noOpt=c.template(p);noOpt.followups[0].parts=noOpt.followups[0].parts.filter(p=>p.ref!=='opt_out');assert(c.validate(noOpt,p).errors.includes('FOLLOWUP_MISSING_OPT_OUT'));
});
test('due check requires confirmed send, elapsed delay, all stop checks and window',async()=>{
 const {p,out}=await setup();const args={plan:c.plan(p,out,'template_completed'),step:2,previous:{identity_matches:true,step:1,state:'provider_accepted',sent_at:'2026-10-12T04:00:00Z'},now:Date.parse('2026-10-15T04:00:00Z'),checks:Object.fromEntries(['approved_hash_current','context_current','not_suppressed','no_reply','no_bounce','no_wrong_person','no_meeting_booked','channel_ready','within_sending_window'].map(k=>[k,true]))};
 assert.equal(r.check(args).ready,true);assert.equal(r.check(args).execution_authorized,false);
 assert.equal(r.check({...args,now:args.now-1}).reason,'delay_not_elapsed');
 for(const k of Object.keys(args.checks)){assert.equal(r.check({...args,checks:{...args.checks,[k]:false}}).ready,false);assert.equal(r.check({...args,checks:{...args.checks,[k]:undefined}}).ready,false);}
 for(const state of ['ambiguous','attempting','reserved'])assert.equal(r.check({...args,previous:{...args.previous,state}}).ready,false);
 assert.equal(r.check({...args,previous:{...args.previous,identity_matches:false}}).ready,false);
 assert.equal(r.check({...args,previous:{...args.previous,step:2}}).ready,false);
 assert.equal(r.check({...args,previous:{...args.previous,sent_at:'2030-01-01'}}).ready,false);
});
