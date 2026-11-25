'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {build,verify}=require('../../scripts/organization-policy/customer-plan.cjs');
const handoff=require('../../scripts/lead-strategy/v2/email-handoff.cjs');
const contract=require('../../scripts/lead-strategy/v2/contract.cjs');
const sample=require('../../documentation/strategy-contract-v2/customer-template-preview-example.json');
function claim(){const x=structuredClone(sample.input);return {id:99,org_id:1,lease:'offline-fixture-lease',input:{...x,
 campaign:{...x.campaign,id:2,version:1},lead:{...x.lead,id:7},fingerprint:'a'.repeat(32),suppressed:false,replied:false,
 report:{trust:{assessment_status:'not_assessed',conflicts:[]}}}};}
test('customer adapter preserves exact initial/follow-up artifacts and existing handoff shape',()=>{
 const c=claim(),before=structuredClone(c),p=build(c);assert.deepEqual(c,before);
 assert.equal(p.plan.version,'strategy_v2');assert.equal(p.plan.validation_profile,'customer_email_v1');
 assert.equal(p.plan.generation.tokens.total,0);assert.equal(p.plan.generation.model,null);
 for(const step of [1,2]){
  // Fixture database identity only: no actual SQL plan/hash/approval exists.
  const draft=handoff.draft({body:p.plan,org_id:1,plan_id:10,content_hash:'b'.repeat(32),email:c.input.lead.email,step});
  assert.equal(draft.email_body,sample.output.draft.steps[step-1].body);
  assert.equal(draft.subject_line,sample.output.draft.steps[step-1].subject);
  assert.equal(draft.execution_authorized,false);
 }
 assert.equal(p.plan.artifacts.followup_drafts[0].delay_days,3);
 assert(p.plan.artifacts.schedule.sequence[1].stop_on.includes('reply'));
});
test('existing local approval preflight does not authorize this offline adapter',()=>{
 const c=claim(),p=build(c),v=verify(c,p);assert(v.ok);assert.equal(v.approval.ok,false);
 assert.equal(v.approval.reason,'EXISTING_APPROVAL_GATES_REQUIRED_OFFLINE_ONLY');
 assert(p.plan.blocking_reasons.includes('customer_template_integration_offline_only'));
});
test('changed content, recipient, campaign version or cleared blockers require a new reviewed package',()=>{
 for(const mutate of [p=>p.plan.artifacts.email_draft.body+='changed',p=>p.plan.customer_review.recipient='other@example.org',p=>p.plan.blocking_reasons=[]]){
  const c=claim(),p=build(c);mutate(p);const {content_hash,...body}=p.plan;p.plan.content_hash=contract.hash(body);
  assert.equal(verify(c,p).ok,false);
 }
 const c=claim(),p=build(c);c.input.campaign.version++;assert.equal(verify(c,p).ok,false);
});
test('cross-organization and malformed claims are rejected',()=>{
 const c=claim();c.input.lead.org_id=2;assert.throws(()=>build(c),/ORG_MISMATCH/);
 const foreign=claim();foreign.input.campaign.org_id=2;assert.throws(()=>build(foreign),/CAMPAIGN_ORG_MISMATCH/);
 const d=claim();d.input.fingerprint='guessed';assert.throws(()=>build(d),/DATABASE_FINGERPRINT_REQUIRED/);
});
test('replied and suppressed leads retain blockers rather than customer mode bypassing them',()=>{
 const c=claim();c.input.replied=true;c.input.suppressed=true;const p=build(c);
 assert(p.plan.blocking_reasons.includes('reply_check_required'));assert(p.plan.blocking_reasons.includes('suppression_check_required'));
});
test('customer assertions are not promoted into existing AI observed/offer/copy schema',()=>{
 const p=build(claim());assert.equal(p.plan.strategy.step1.parts[0].type,'customer_supplied');
 assert.equal(p.plan.customer_review.claim_provenance,'customer_supplied_not_independently_verified');
 const result=contract.validate(p.plan.strategy,{});assert.equal(result.ok,false);assert.equal(result.kind,'schema');
});
