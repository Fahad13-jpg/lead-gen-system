'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {configure}=require('../../scripts/lead-strategy/v2/operating-controls.cjs');
const workflow=structuredClone(require('../../workflows/06C_outreach_strategy_generator.json'));
// Keep the baseline off regardless of the operator's checked-in local checkpoint.
workflow.nodes.find(n=>n.name==='Claim Strategy Jobs').parameters.query=workflow.nodes.find(n=>n.name==='Claim Strategy Jobs').parameters.query.replace(/'operator_controls','\{"native_email_review":(?:true|false),"customer_templates":(?:true|false)\}'::jsonb,/,'');
for(const field of ['native_email_review','customer_templates']){const n=workflow.nodes.find(n=>n.name==='Prepare Strategy');n.parameters.jsCode=n.parameters.jsCode.replace('||$json.operator_controls?.'+field+'===true','');}
const controls={native_email_review:true,customer_templates:true};
test('trusted operating configuration changes only claim metadata and the Prepare branch',()=>{
 const w=configure(workflow,controls);assert.deepEqual(configure(w,controls),w);
 const changed=w.nodes.filter(n=>JSON.stringify(n)!==JSON.stringify(workflow.nodes.find(x=>x.id===n.id))).map(n=>n.name);assert.deepEqual(changed.sort(),['Claim Strategy Jobs','Prepare Strategy']);assert.deepEqual(w.connections,workflow.connections);assert.deepEqual(w.settings,workflow.settings);assert.equal(w.active,workflow.active);
 const q=w.nodes.find(n=>n.name==='Claim Strategy Jobs').parameters.query;assert(q.includes("value||jsonb_build_object('operator_controls','{\"native_email_review\":true,\"customer_templates\":true}'::jsonb"));assert(q.includes('strategy_claim('));assert(!q.includes('strategy_enqueue'));
 const off=configure(w,{native_email_review:false,customer_templates:false});assert(off.nodes.find(n=>n.name==='Claim Strategy Jobs').parameters.query.includes('"native_email_review":false'));assert.throws(()=>configure(w,{native_email_review:true}),/EXPLICIT/);
});
test('claim controls reach native review while nested campaign input cannot enable it',async()=>{
 const input=structuredClone((await require('../../scripts/lead-strategy/v2/fixtures.cjs').benchmarks())[0].input);input.fingerprint='a'.repeat(32);input.campaign.config.native_email_review=true;
 const w=configure(workflow,controls),code=w.nodes.find(n=>n.name==='Prepare Strategy').parameters.jsCode;
 const run=claim=>vm.runInNewContext('(function(){'+code+'})()',{$json:claim,$env:{STRATEGY_CONTRACT_VERSION:'strategy_v2'},Buffer,require:id=>{assert.equal(id,'crypto');return require('node:crypto');}},{timeout:5000});
 const claim={id:7,org_id:1,lease:'b'.repeat(32),input};assert.equal(run(claim).draft_review_enabled,false);
 const prepared=run({...claim,operator_controls:controls});assert.equal(prepared.draft_review_enabled,true);assert.equal(prepared.execution_authorized,undefined);assert.equal(prepared.wants_ai,false);
});
