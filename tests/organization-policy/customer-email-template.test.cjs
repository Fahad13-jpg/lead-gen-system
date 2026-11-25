'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {render}=require('../../scripts/organization-policy/customer-email-template.cjs');
function fixture(){return {org_id:1,lead:{org_id:1,company_name:'Sample Dental',city:'Islamabad',email:'owned@example.org'},campaign:{org_id:1,config:{
 mode:'template',channels:['email'],language:'en',sender:{name:'Fahad',company:'Example Studio'},
 offer:{name:'Website proposal',description:'A proposed clinic website.',prohibited_claims:['guaranteed bookings']},
 cta:{text:'Would you like to discuss this?',url:'https://example.org/demo'},
 timezone:'Asia/Karachi',sending_window:{start_hour:9,end_hour:17,weekdays:[1,2,3,4,5]},
 sequence:[{channel:'email',delay_days:0},{channel:'email',delay_days:3}],
 templates:{email:{subject:'Website for {{company_name}}',body:'Hello {{company_name}},\n\n{{offer_description}}\n{{cta}}\n\n{{sender_name}} | {{sender_company}}\nReply STOP to opt out.',followups:['Hello {{company_name}},\nWould you like to discuss this?\n\n{{sender_name}} | {{sender_company}}\nReply STOP to opt out.']}}
}}};}
const error=(x,code)=>{const r=render(x);assert(r.validation_errors.some(e=>e.code===code),JSON.stringify(r.validation_errors));assert.equal(r.draft,null);assert.equal(r.preview_hash,null);};
test('preserves exact customer wording, spacing and sequence without AI or authority',()=>{
 const x=fixture(),before=structuredClone(x),r=render(x);
 assert.equal(r.state,'requires_review');assert.equal(r.ai_calls,0);assert.equal(r.ai_tokens,0);assert.equal(r.execution_authorized,false);
 assert.equal(r.draft.steps[0].body,'Hello Sample Dental,\n\nA proposed clinic website.\nWould you like to discuss this?\n\nFahad | Example Studio\nReply STOP to opt out.');
 assert.equal(r.draft.steps[1].delay_days,3);assert.deepEqual(x,before);assert.match(r.preview_hash,/^[a-f0-9]{64}$/);
});
test('unknown or expression variables never execute',()=>{
 const x=fixture();x.campaign.config.templates.email.body='{{process.exit()}}';error(x,'UNKNOWN_VARIABLE');
});
test('missing values, malformed tokens and nested substitution block the whole sequence',()=>{
 let x=fixture();delete x.lead.company_name;error(x,'MISSING_VARIABLE');
 x=fixture();x.campaign.config.templates.email.body+='\n{{city';error(x,'MALFORMED_VARIABLE');
 x=fixture();x.lead.company_name='{{sender_name}}';error(x,'UNSAFE_VARIABLE');
});
test('headers and hidden control characters are rejected',()=>{
 let x=fixture();x.campaign.config.templates.email.subject='Hi\r\nBcc: stranger@example.org';error(x,'INVALID_SUBJECT');
 x=fixture();x.lead.company_name='Name\nBcc: evil';error(x,'UNSAFE_VARIABLE');
 x=fixture();x.campaign.config.templates.email.body+='\u202e';error(x,'CONTROL_CHARACTERS');
});
test('missing footer and identity block rather than silently rewrite customer text',()=>{
 let x=fixture();x.campaign.config.templates.email.body=x.campaign.config.templates.email.body.replace('Reply STOP to opt out.','');error(x,'OPT_OUT_FOOTER_REQUIRED');
 x=fixture();x.campaign.config.templates.email.followups[0]=x.campaign.config.templates.email.followups[0].replace('{{sender_name}} | {{sender_company}}','');error(x,'SENDER_SIGNATURE_REQUIRED');
});
test('URLs and prohibited claims checked after substitution in subject and body',()=>{
 let x=fixture();x.campaign.config.templates.email.subject='See https://evil.example';error(x,'URL_NOT_ALLOWED');
 x=fixture();x.campaign.config.offer.description='Guaranteed bookings';error(x,'PROHIBITED_CLAIM');
 x=fixture();x.campaign.config.offer.description='See {{demo_url}}';error(x,'UNSAFE_VARIABLE');
 x=fixture();x.campaign.config.templates.email.body=x.campaign.config.templates.email.body.replace('{{offer_description}}','{{demo_url}}');assert.equal(render(x).state,'requires_review');
});
test('limits, tenant boundary and unsupported modes/channels/languages fail closed',()=>{
 let x=fixture();x.lead.org_id=2;error(x,'ORGANIZATION_MISMATCH');
 x=fixture();x.campaign.config.mode='hybrid';error(x,'CUSTOMER_DEFINED_MODE_REQUIRED');
 x=fixture();x.campaign.config.channels.push('sms');error(x,'EMAIL_ONLY_SLICE');
 x=fixture();x.campaign.config.language='ur';error(x,'LANGUAGE_NOT_SUPPORTED_IN_SLICE');
 x=fixture();x.campaign.config.templates.email.body+='x'.repeat(1201);error(x,'EMAIL_TOO_LONG');
});
test('follow-up count/delays and scheduling are not invented',()=>{
 let x=fixture();x.campaign.config.templates.email.followups=[];error(x,'FOLLOWUP_COUNT_MISMATCH');
 x=fixture();x.campaign.config.sequence[1].delay_days=-1;error(x,'INVALID_SEQUENCE_STEP');
 x=fixture();delete x.campaign.config.timezone;error(x,'TIMEZONE_REQUIRED');
 x=fixture();x.campaign.config.sending_window.weekdays=[];error(x,'INVALID_SENDING_WINDOW');
});
test('unscoped website absence is rejected',()=>{
 const x=fixture();x.campaign.config.offer.description="You don't have a website.";error(x,'UNSCOPED_WEBSITE_ABSENCE');
});
test('changed content/recipient changes hash; unchanged inputs are deterministic',()=>{
 const x=fixture(),a=render(x);assert.equal(render(x).preview_hash,a.preview_hash);
 x.lead.email='second@example.org';assert.notEqual(render(x).preview_hash,a.preview_hash);
 const b=render(x).preview_hash;x.campaign.config.sequence[1].delay_days=4;assert.notEqual(render(x).preview_hash,b);
});
test('empty and malformed input cannot create a usable preview',()=>{
 for(const x of [null,{},[],{campaign:{config:{sequence:[null]}}}])assert.equal(render(x).draft,null);
});
