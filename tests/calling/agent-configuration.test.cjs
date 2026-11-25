'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {build,verify}=require('../../scripts/calling/improve-retell-agent.cjs');
function fixture(){return {agent:{agent_id:'fixture',version:1,is_published:false,voice_id:'keep',response_engine:{type:'retell-llm',llm_id:'fixture',version:1}},llm:{llm_id:'fixture',version:1,is_published:false,model_config:{type:'cascading',primary:{model:'keep',tier:'standard'}},general_tools:[{type:'end_call',name:'end_call'},...require('../../scripts/calling/tool-contract.json').tools.map(t=>({...t,type:'custom',url:'https://fixture.invalid/tools',headers:{secret:'keep'}}))]}};}
test('draft improvement preserves tool identity and primary model and cannot publish',()=>{
 const before=fixture(),patch=build(before),after={agent:{...before.agent,...patch.agentPatch},llm:{...before.llm,...patch.llmPatch}};
 verify(before,after,patch);
 delete after.agent.ambient_sound;verify(before,after,patch);
 assert.equal(patch.agentPatch.enable_dnc_detection,false);
 assert.deepEqual(patch.agentPatch.contact_memory_config,{enable_read:false,enable_update:false});
 assert.equal(patch.agentPatch.max_call_duration_ms,60000);
 for(const tool of patch.llmPatch.general_tools.filter(t=>t.type==='custom')){
  assert.equal(tool.max_retry,0);assert.equal(tool.speak_during_execution,false);
  assert.equal(tool.url,'https://fixture.invalid/tools');assert.deepEqual(tool.headers,{secret:'keep'});
 }
 assert.equal(patch.llmPatch.general_tools.find(t=>t.name==='opt_out').timeout_ms,10000);
});
test('published resources and unexpected tools require review',()=>{
 for(const target of ['agent','llm']){const f=fixture();f[target].is_published=true;assert.throws(()=>build(f));}
 const f=fixture();f.llm.general_tools.push({type:'transfer_call',name:'unexpected'});assert.throws(()=>build(f));
});
test('readback detects lost opt-out protection and modified tool credentials',()=>{
 const before=fixture(),patch=build(before),after={agent:{...before.agent,...patch.agentPatch},llm:{...before.llm,...patch.llmPatch}};
 after.agent.enable_dnc_detection=true;assert.throws(()=>verify(before,after,patch));
 after.agent.enable_dnc_detection=false;after.llm=structuredClone(after.llm);
 after.llm.general_tools.find(t=>t.name==='opt_out').headers.secret='changed';assert.throws(()=>verify(before,after,patch));
});
