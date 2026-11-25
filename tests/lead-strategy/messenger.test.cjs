'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const rt=require('../../scripts/lead-strategy/runtime.cjs'),native=require('../../scripts/lead-strategy/v2/native.cjs'),contract=require('../../scripts/lead-strategy/v2/contract.cjs'),manual=require('../../scripts/lead-strategy/v2/messenger.cjs');
function input(){
 const config=rt.campaign({org_id:1,config:{name:'Messenger demo',mode:'ai',channels:['messenger'],sequence:[{channel:'messenger',delay_days:0}],language:'en',timezone:'Asia/Karachi',sender:{name:'Fahad',company:'Example Studio'},offer:{name:'Website demo',description:'A website demonstration.',approved_points:['The demonstration presents services online.'],prohibited_claims:[]},cta:{text:'Would a short demo be useful?'}}}).config;
 return {org_id:1,lead:{id:3,org_id:1,company_name:'Example shop',category:'Shop'},campaign:{id:1,version:1,config},report:{trust:{conflicts:[],freshness:{},assessment_status:'assessed'}},suppressed:false,replied:false,facebook_pages:[{page_url:'https://www.facebook.com/example.shop/',observed_at:new Date().toISOString()}]};
}
test('Messenger strategy uses the native validated draft and produces an approval-required manual artifact',()=>{
 const i=input(),p=native.prepare({id:7,org_id:1,lease:'mock',input:i},{hasKey:true});assert.equal(p.wants_ai,true);assert.deepEqual(p.prepared.brief.permitted_channels.map(c=>c.channel),['messenger']);
 const output=contract.template(p.prepared);assert.equal(output.step1.channel,'messenger');assert.equal(output.followups.length,0);
 const r=native.assemble(p,{statusCode:200,body:{choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}}});
 assert.equal(r.plan.state,'ai_completed');assert.deepEqual(r.plan.blocking_reasons,[]);assert.equal(r.plan.execution_authorized,false);assert.equal(r.plan.approval_required,true);assert.equal(r.plan.artifacts.messenger_manual.target.page_url,i.facebook_pages[0].page_url);assert.equal(r.plan.artifacts.messenger_manual.message,output.step1.parts.map(p=>p.text).join('\n\n'));
});
test('ambiguous, stale, missing or stopped Facebook targets cannot obtain a ready manual draft',()=>{
 for(const patch of [{facebook_pages:[]},{facebook_pages:[{page_url:'https://www.facebook.com/old/',observed_at:'2020-01-01'}]},{facebook_pages:[{page_url:'https://www.facebook.com/one/',observed_at:new Date().toISOString()},{page_url:'https://www.facebook.com/two/',observed_at:new Date().toISOString()}]},{suppressed:true},{replied:true}]){const i={...input(),...patch};assert.equal(manual.readiness(i).status,'blocked');const p=native.prepare({id:1,input:i},{hasKey:true});assert.equal(p.prepared.brief.permitted_channels.length,0);}
 const i=input();for(const patch of [{mode:'template'},{channels:['messenger','email']},{sequence:[{channel:'messenger',delay_days:0},{channel:'messenger',delay_days:3}]}])assert.throws(()=>rt.campaign({org_id:1,config:{...i.campaign.config,...patch}}),/MESSENGER_SINGLE_STEP_AI_REQUIRED/);
});
test('failed AI output is not replaced with a template or made copyable',()=>{
 const p=native.prepare({id:7,org_id:1,lease:'mock',input:input()},{hasKey:true}),r=native.assemble(p,{statusCode:500});assert.equal(r.plan.state,'ai_failed');assert.equal(r.plan.artifacts.messenger_manual,undefined);assert(r.plan.blocking_reasons.length);
});
test('embedded n8n Code nodes support Messenger generation and assembly without network calls',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),w=JSON.parse(fs.readFileSync('workflows/06C_outreach_strategy_generator.json','utf8'));
 const execute=(name,json,prepared)=>JSON.parse(JSON.stringify(vm.runInNewContext('(function(){'+w.nodes.find(n=>n.name===name).parameters.jsCode+'})()',{$json:json,$env:{STRATEGY_CONTRACT_VERSION:'strategy_v2',GROQ_API_KEY:'MOCK_ONLY'},$:()=>({item:{json:prepared}}),Buffer,require:id=>{assert.equal(id,'crypto');return require('node:crypto');}},{timeout:5000})));
 const p=execute('Prepare Strategy',{id:7,org_id:1,lease:'mock',input:input()}),output=contract.template(p.prepared);
 const r=execute('Validate and Assemble Draft',{statusCode:200,body:{choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]}},p);
 assert.equal(r.plan.artifacts.messenger_manual.execution_mode,'manual_only');assert.deepEqual(r.plan.blocking_reasons,[]);
});
