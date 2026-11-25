'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {build}=require('../../scripts/organization-policy/customer-plan.cjs');
const {validate}=require('../../scripts/organization-policy/customer-execution.cjs');
const handoff=require('../../scripts/lead-strategy/v2/email-handoff.cjs');
const executor=require('../../scripts/lead-strategy/v2/email-executor.cjs');
const vm=require('node:vm'),fs=require('node:fs');
const sample=require('../../documentation/strategy-contract-v2/customer-template-preview-example.json');
function fixture(){const x=structuredClone(sample.input);const claim={id:99,org_id:1,lease:'fixture',input:{...x,campaign:{...x.campaign,id:2,version:1},lead:{...x.lead,id:7},fingerprint:'a'.repeat(32),suppressed:false,replied:false,report:{trust:{conflicts:[]}}}};
 const body=build(claim).plan;body.blocking_reasons=[]; // Offline acceptance fixture only, never a deployed builder.
 return {org_id:1,plan_id:4,lead_id:7,email:x.lead.email,content_hash:'b'.repeat(32),body,strategy_context:claim.input};}
test('customer execution re-renders first and followup content without granting authority',()=>{
 const row=fixture();assert.equal(validate(row).content_valid,true);
 for(const step of [1,2]){const out=handoff.executionDraft({...row,step});assert.equal(out.email_body,sample.output.draft.steps[step-1].body);assert.equal(out.execution_authorized,false);}
 const reorder=v=>Array.isArray(v)?v.map(reorder):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).reverse().map(k=>[k,reorder(v[k])])):v;
 assert.equal(validate(reorder(row)).content_valid,true);
});
test('current context, recipient, tenant and campaign identity cannot be substituted',()=>{
 for(const mutate of [r=>delete r.strategy_context,r=>r.email='changed@example.org',r=>r.org_id=2,r=>r.strategy_context.campaign.version++,r=>r.strategy_context.lead.id++,r=>r.strategy_context.campaign.config.templates.email.body+='changed']){
  const row=fixture();mutate(row);assert.throws(()=>validate(row),/CUSTOMER_/);
 }
});
test('message, followup and schedule mutations are rejected even with unchanged review metadata',()=>{
 for(const mutate of [r=>r.body.artifacts.email_draft.body+='changed',r=>r.body.artifacts.followup_drafts[0].body+='changed',r=>r.body.artifacts.schedule.sequence[1].delay_days++,r=>r.body.artifacts.followup_drafts[0].intent_index++,r=>r.body.strategy.step1.parts[0].type='observed',r=>r.body.artifacts.schedule.sequence[0].stop_on=[]]){
  const row=fixture();mutate(row);assert.throws(()=>validate(row),/CUSTOMER_/);
 }
});
test('integration blocker, suppression, replies and conflicts remain effective',()=>{
 for(const mutate of [r=>r.body.blocking_reasons=['customer_template_integration_offline_only'],r=>r.strategy_context.suppressed=true,r=>r.strategy_context.replied=true,r=>r.strategy_context.report.trust.conflicts=['conflict']]){
  const row=fixture();mutate(row);assert.throws(()=>validate(row),/CUSTOMER_/);
 }
});
test('executor rejects customer tampering before any database or transport call',async()=>{
 const row=fixture();row.body.artifacts.email_draft.subject='changed';let calls=0;
 await assert.rejects(executor.execute(row,'c'.repeat(32),{executeQuery:()=>calls++,transport:()=>calls++},{enabled:true}),/CUSTOMER_MESSAGE_CHANGED/);assert.equal(calls,0);
});
test('legacy AI plans do not acquire customer validation requirements',()=>{assert.deepEqual(validate({body:{version:'strategy_v2',state:'ai_completed'}}),{applicable:false,execution_authorized:false});});
test('an existing release flag is accepted as data but never grants local sending authority',()=>{
 const row=fixture();row.body.execution_authorized=true;const result=validate(row);
 assert.equal(result.content_valid,true);assert.equal(result.execution_authorized,false);
 row.body.execution_authorized='true';assert.throws(()=>validate(row),/CUSTOMER_PLAN_BLOCKED/);
});
test('actual local executor Code node validates customer content and rejects changes',()=>{
 const w=JSON.parse(fs.readFileSync('workflows/07a_email_outreach_executor.json','utf8'));
 const code=w.nodes.find(n=>n.name==='Prepare Email Content').parameters.jsCode;
 const run=row=>vm.runInNewContext('(function(){'+code+'})()',{$json:row,URL,require:id=>{assert.equal(id,'crypto');return require('node:crypto');}},{timeout:5000});
 const row=fixture();assert.equal(run(row).json.email_body,sample.output.draft.steps[0].body);
 row.body.artifacts.email_draft.subject='changed';assert.throws(()=>run(row),/CUSTOMER_MESSAGE_CHANGED/);
 assert(w.nodes.find(n=>n.name==='Get Email-Ready Leads').parameters.query.includes('AS strategy_context,'));
});
