'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const runtime=require('../../scripts/lead-strategy/runtime.cjs');
const {render}=require('../../scripts/organization-policy/customer-email-template.cjs');
const sample=require('../../documentation/strategy-contract-v2/customer-template-preview-example.json');
function input(){const x=structuredClone(sample.input);x.campaign.config.name='Customer campaign';return x;}

test('basic planning requires server eligibility and retains other readiness gates',()=>{
 const x=input();x.campaign.config=runtime.campaign({org_id:1,config:x.campaign.config}).config;
 x.campaign.config.email_verification_policy='basic';
 assert(runtime.prepare(x).context.readiness.email.reasons.includes('email_basic_checks_required'));
 x.email_eligibility={allowed:true,classification:'basic_unverified'};
 const reasons=runtime.prepare(x).context.readiness.email.reasons;
 assert(!reasons.includes('email_not_freshly_verified'));
 assert(reasons.includes('executor_not_integrated'));
 x.email_eligibility={allowed:false,reason:'email_known_invalid_risky_or_review'};
 assert(runtime.prepare(x).context.readiness.email.reasons.includes('email_known_invalid_risky_or_review'));
});
test('email verification policy preserves explicit basic mode and strict default',()=>{
 const x=input();assert.equal(runtime.campaign({org_id:1,config:x.campaign.config}).config.email_verification_policy,'provider_required');
 x.campaign.config.email_verification_policy='basic';assert.equal(runtime.campaign({org_id:1,config:x.campaign.config}).config.email_verification_policy,'basic');
 x.campaign.config.email_verification_policy='skip';assert.throws(()=>runtime.campaign({org_id:1,config:x.campaign.config}),/INVALID_EMAIL_VERIFICATION_POLICY/);
});
test('campaign normalization preserves exact customer whitespace and rendered follow-ups',()=>{
 const x=input(),t=x.campaign.config.templates.email;t.subject='  '+t.subject+'  ';t.body='\n  '+t.body+'\n\n';t.followups=t.followups.map(s=>'\n'+s+'\n');
 const expected=render(x),saved=runtime.campaign({org_id:1,config:x.campaign.config});
 assert.deepEqual(saved.config.templates.email,t);
 assert.deepEqual(render({...x,campaign:{org_id:1,config:saved.config}}).draft,expected.draft);
 assert.equal(expected.state,'requires_review');
});
test('email template subject limit agrees with renderer; headers are rejected',()=>{
 const x=input();x.campaign.config.templates.email.subject='x'.repeat(200);
 assert.equal(runtime.campaign({org_id:1,config:x.campaign.config}).config.templates.email.subject.length,200);
 for(const s of ['x'.repeat(201),'hello\r\nBcc: test@example.org','hello\tworld']){
  x.campaign.config.templates.email.subject=s;assert.throws(()=>runtime.campaign({org_id:1,config:x.campaign.config}));
 }
});
test('explicit null/non-object templates cannot silently select generated content',()=>{
 for(const t of [null,false,0,'',[], 'text']){const x=input();x.campaign.config.templates.email=t;assert.throws(()=>runtime.campaign({org_id:1,config:x.campaign.config}),/INVALID_EMAIL_TEMPLATE/);}
});
test('hidden controls and malformed followup containers are rejected at campaign entry',()=>{
 const x=input();x.campaign.config.templates.email.body+='\u200b';assert.throws(()=>runtime.campaign({org_id:1,config:x.campaign.config}),/UNSAFE_TEMPLATE_TEXT/);
 for(const followups of [null,{},'text']){const y=input();y.campaign.config.templates.email.followups=followups;assert.throws(()=>runtime.campaign({org_id:1,config:y.campaign.config}),/INVALID_LIST/);}
});
