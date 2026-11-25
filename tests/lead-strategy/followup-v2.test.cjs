'use strict';
const assert=require('node:assert/strict');
const c=require('../../scripts/lead-strategy/v2/contract.cjs');
const q=require('../../scripts/lead-strategy/v2/quality.cjs');
const saved=require('./fixtures/live-449-followup.json');
const p={brief:saved.brief,qualification:{absence_wording:null}};
assert(c.validate(saved.output,p).errors.includes('FOLLOWUP_ASSET_UNAVAILABLE'));
const conditional=structuredClone(saved.output);
conditional.followups=[{channel:'whatsapp',intent:'After confirmed sending, if no reply or opt-out, ask whether the offer is relevant.'}];
assert(c.validate(conditional,p).errors.includes('WEAK_FIT_FOLLOWUP_REQUIRES_REVIEW'));
const checks=q.followupReview(p.brief,conditional).items[0];
assert(checks.required_checks.includes('previous_confirmed_send'));
assert(checks.required_checks.includes('weak_fit_human_review'));
assert.equal(checks.checks_performed,false);assert.equal(checks.execution_authorized,false);
const configured=structuredClone(p);configured.brief.campaign.cta.url='https://example.org/demo';configured.brief.url_allowlist=['https://example.org/demo'];
assert(c.validate(saved.output,configured).errors.includes('WEAK_FIT_FOLLOWUP_REQUIRES_REVIEW'));
assert(q.followupReview(configured.brief,saved.output).items[0].required_checks.includes('asset_in_previous_confirmed_send'));
configured.brief.url_allowlist=[];assert(q.followupReview(configured.brief,saved.output).errors.includes('FOLLOWUP_ASSET_UNAVAILABLE'));
for(const intent of ['Ask about the demonstration URL.','Ask about the link to the demo.','Ask about the product link.']){
 const o=structuredClone(saved.output);o.followups[0].intent=intent;
 assert(c.validate(o,p).errors.includes('FOLLOWUP_ASSET_UNAVAILABLE'));
}
const noFollowups=structuredClone(saved.output);noFollowups.followups=[];
assert(c.validate(noFollowups,p).ok);assert.deepEqual(q.followupReview(p.brief,noFollowups).items,[]);
console.log('PASS: missing-link intent rejected; weak-fit routine followups rejected even with conditional wording; configured URL never proves sending; no-followup path valid.');
