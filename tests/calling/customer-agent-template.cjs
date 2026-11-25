'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{prepare}=require('../../scripts/calling/customer-agent-template.cjs');
function fixture(){return{org_id:7,package_snapshot:{features:{calling:true}},account:{org_id:7,version:2,key_fingerprint:'a'.repeat(64),agent_id:'agent_source',agent_version:1},source:{agent:{agent_id:'agent_source',version:1,is_published:true,voice_id:'voice_verified',response_engine:{type:'retell-llm',llm_id:'llm_source',version:1}},llm:{llm_id:'llm_source',version:1,is_published:true,model_config:{type:'cascading',model:'gpt-4.1'},general_tools:[{headers:{'X-Source-Secret':'must-not-copy'}}]}},tools:{org_id:7,verified:true,account_key_fingerprint:'a'.repeat(64),endpoint:'https://tools.example.test/calling/7',token:'b'.repeat(64)}};}
test('customer draft inherits reviewed prompt/settings without changing the source agent',()=>{
 const input=fixture(),before=structuredClone(input),x=prepare(input),llm=x.llmRequest(),agent=x.agentRequest({llm_id:'llm_new',version:0,is_published:false});
 assert.deepEqual(input,before);assert.equal(llm.path,'/create-retell-llm');assert.equal(agent.path,'/create-agent');assert.equal(agent.body.max_call_duration_ms,60000);assert.equal(agent.body.voice_id,'voice_verified');assert.equal(agent.body.voicemail_option.action.type,'hangup');assert.equal(agent.body.ivr_option.action.type,'hangup');assert.equal(agent.body.response_engine.llm_id,'llm_new');assert(llm.body.general_prompt.includes('{{approved_call_brief}}'));assert.equal(llm.body.model_config.model,'gpt-4.1');assert(!JSON.stringify(llm).includes('must-not-copy'));
 for(const tool of llm.body.general_tools.filter(t=>t.type==='custom')){assert.equal(tool.max_retry,0);assert.equal(tool.headers['X-Call-Tool-Token'],'b'.repeat(64));}
 assert.equal(x.review.phone_calls_enabled,false);assert.equal(x.review.publishing_enabled,false);assert(!JSON.stringify(x.review).includes('b'.repeat(64)));
});
test('Free and cross-organization tool/account bindings fail before producing requests',()=>{
 for(const mutate of [x=>{x.package_snapshot.features.calling=false;},x=>{x.account.org_id=9;},x=>{x.tools.org_id=9;},x=>{x.tools.account_key_fingerprint='c'.repeat(64);},x=>{x.tools.verified=false;}]){const x=fixture();mutate(x);assert.throws(()=>prepare(x));}
});
test('unverified sources and nonpublic tool addresses are rejected',()=>{
 for(const mutate of [x=>{x.source.agent.is_published=false;},x=>{x.source.llm.is_published=false;},x=>{x.source.agent.version=3;},x=>{x.tools.endpoint='http://localhost/tools';},x=>{x.tools.endpoint='https://127.0.0.1/tools';}]){const x=fixture();mutate(x);assert.throws(()=>prepare(x));}
});
test('a returned engine must be a verified unpublished draft and review hashes bind tool credentials',()=>{
 const first=prepare(fixture());assert.throws(()=>first.agentRequest({llm_id:'llm_new',version:0,is_published:true}));assert.throws(()=>first.agentRequest({llm_id:'',version:0,is_published:false}));
 const changed=fixture();changed.tools.token='c'.repeat(64);assert.notEqual(first.review.template_hash,prepare(changed).review.template_hash);
});
