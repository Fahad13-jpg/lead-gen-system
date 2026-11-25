'use strict';
// Draft configuration only: no calls, publishing, tool invocation or database writes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {isDeepStrictEqual}=require('node:util');
const {request}=require('./configure-retell-agent.cjs');
const root=path.resolve(__dirname,'../..');
const configFile=path.join(root,'.local/calling-tools-20261028/private.json');
function prompt(){return fs.readFileSync(path.join(__dirname,'AGENT_PROMPT.md'),'utf8').split('Setup note:')[0].replace(/^#.*\r?\n/,'').trim();}
function build(current){
 const {agent:a,llm:l}=current;
 assert.equal(a.is_published,false,'PUBLISHED_AGENT_BLOCKED');
 assert.equal(l.is_published,false,'PUBLISHED_LLM_BLOCKED');
 assert.equal(a.response_engine.type,'retell-llm');
 assert.equal(a.response_engine.llm_id,l.llm_id);
 assert.equal(a.response_engine.version,l.version);
 assert.ok(Number.isSafeInteger(a.version)&&Number.isSafeInteger(l.version));
 assert.equal(l.model_config?.type,'cascading','EXISTING_CASCADING_MODEL_REQUIRED');
 const names=['end_call',...require('./tool-contract.json').tools.map(t=>t.name)];
 assert.deepEqual(l.general_tools.map(t=>t.name).sort(),names.sort(),'UNEXPECTED_TOOLS_REVIEW_REQUIRED');
 assert.ok(!l.states?.length,'STATE_PROMPTS_REQUIRE_REVIEW');
 const descriptions={
  end_call:'End promptly after the closing, a refusal, wrong person or opt-out. Do not ask an additional question.',
  opt_out:'Immediately record an explicit stop-contact request without asking for confirmation. Use event_id recipient-opt-out. Then end_call even if persistence fails. Never claim removal without a saved receipt.'
 };
 const general_tools=l.general_tools.map(t=>{
  if(t.type==='end_call')return {...t,description:descriptions.end_call};
  assert.equal(t.type,'custom');
  assert.equal(new URL(t.url).protocol,'https:');
  // Preserve URLs, authentication and schemas; a config update cannot repair ingress.
  const urgent=['opt_out','record_outcome'].includes(t.name);
  return {...t,...(descriptions[t.name]?{description:descriptions[t.name]}:{}),
   timeout_ms:urgent?10000:20000,max_retry:0,
   speak_during_execution:false,speak_after_execution:true};
 });
 return {
  agentPatch:{language:'en-US',responsiveness:0.7,interruption_sensitivity:0.85,
   enable_dynamic_responsiveness:false,enable_dynamic_voice_speed:false,
   voice_speed:1,enable_backchannel:false,ambient_sound:null,
   stt_mode:'accurate',vocab_specialization:'general',denoising_mode:'noise-cancellation',
   reminder_trigger_ms:6000,reminder_max_count:1,end_call_after_silence_ms:10000,
   max_call_duration_ms:60000,ring_duration_ms:30000,allow_user_dtmf:false,
   // Native DNC adds a confirmation turn. The authenticated opt_out tool owns persistence.
   enable_dnc_detection:false,
   contact_memory_config:{enable_read:false,enable_update:false},
   handbook_config:{...a.handbook_config,ai_disclosure:true,default_personality:true,
    conversational_personality:false,natural_filler_words:false,scope_boundaries:true,
    speech_normalization:true,echo_verification:false},
   voicemail_option:{action:{type:'hangup'}},ivr_option:{action:{type:'hangup'}}},
  llmPatch:{general_prompt:prompt(),general_tools,start_speaker:'agent',begin_message:null,
   model_config:{...l.model_config,temperature:0.2}}
 };
}
async function inspect(c){
 const agent=await request('GET','/get-agent/'+c.agent_id,c.retell_key);
 assert.equal(agent.agent_id,c.agent_id);
 const e=agent.response_engine;
 assert.ok(/^[A-Za-z0-9_-]+$/.test(e?.llm_id||'')&&Number.isSafeInteger(e.version));
 const llm=await request('GET','/get-retell-llm/'+e.llm_id+'?version='+e.version,c.retell_key);
 return {agent,llm};
}
function verify(before,after,patch){
 for(const [k,v] of Object.entries(patch.agentPatch)){
  // Retell omits cleared ambient_sound rather than returning explicit null.
  if(k==='ambient_sound'&&v===null){assert.ok(after.agent[k]==null);continue;}
  assert.ok(isDeepStrictEqual(after.agent[k],v),'AGENT_READBACK_'+k);
 }
 for(const [k,v] of Object.entries(patch.llmPatch)){
  if(k==='begin_message'&&v===null){assert.ok(after.llm[k]==null);continue;}
  if(k==='general_tools'){
   assert.equal(after.llm[k].length,v.length);
   for(const expected of v){const actual=after.llm[k].find(t=>t.name===expected.name);
    for(const [field,value] of Object.entries(expected))assert.ok(isDeepStrictEqual(actual?.[field],value),'TOOL_READBACK_'+expected.name+'_'+field);}
  }else assert.ok(isDeepStrictEqual(after.llm[k],v),'LLM_READBACK_'+k);
 }
 for(const k of ['agent_id','version','is_published','voice_id','response_engine','data_storage_setting','pii_config','post_call_analysis_model'])
  assert.ok(isDeepStrictEqual(after.agent[k],before.agent[k]),'PRESERVED_AGENT_'+k);
 for(const k of ['llm_id','version','is_published','knowledge_base_ids','default_dynamic_variables'])
  assert.ok(isDeepStrictEqual(after.llm[k],before.llm[k]),'PRESERVED_LLM_'+k);
 assert.deepEqual(after.llm.model_config.primary,before.llm.model_config.primary);
 assert.deepEqual(after.llm.model_config.backup,before.llm.model_config.backup);
}
async function main(){
 const mode=process.argv[2]||'inspect';assert.ok(['inspect','apply'].includes(mode));
 const c=JSON.parse(fs.readFileSync(configFile,'utf8')),before=await inspect(c),patch=build(before);
 if(mode==='inspect'){console.log(JSON.stringify({draft_version:before.agent.version,backend_pinned_version:c.agent_version,proposed_agent_settings:patch.agentPatch,prompt_characters:patch.llmPatch.general_prompt.length,tools:patch.llmPatch.general_tools.map(t=>({name:t.name,timeout_ms:t.timeout_ms,max_retry:t.max_retry})),calls:0}));return;}
 const listed=await request('POST','/v2/list-agents?limit=1000',c.retell_key,{});
 const agents=Array.isArray(listed)?listed:listed.items;
 assert.ok(Array.isArray(agents)&&listed.has_more!==true,'COMPLETE_LIST_REQUIRED');
 for(const entry of agents){
  if(entry.agent_id===c.agent_id||entry.channel&&entry.channel!=='voice')continue;
  assert.ok(/^[A-Za-z0-9_-]+$/.test(entry.agent_id));
  const other=await request('GET','/get-agent/'+entry.agent_id,c.retell_key);
  assert.notEqual(other.response_engine?.llm_id,before.llm.llm_id,'SHARED_LLM_BLOCKED');
 }
 const dir=path.join(root,'.local','retell-improvement-'+Date.now());fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'before-private.json'),JSON.stringify(before,null,2),{flag:'wx'});
 fs.writeFileSync(path.join(dir,'proposed-private.json'),JSON.stringify(patch,null,2),{flag:'wx'});
 const journal={phase:'backed_up',calls_placed:0,published:false,backup_directory:dir};
 const save=()=>fs.writeFileSync(path.join(dir,'journal.json'),JSON.stringify(journal,null,2));save();
 // Refuse an intervening dashboard edit before starting the two ordered patches.
 const fresh=await inspect(c);assert.deepEqual(fresh,before,'CONCURRENT_EDIT_BLOCKED');
 try{
  // Install explicit opt-out instructions before disabling the native confirmation layer.
  journal.phase='llm_patch_attempted';save();
  await request('PATCH','/update-retell-llm/'+before.llm.llm_id+'?version='+before.llm.version,c.retell_key,patch.llmPatch);
  journal.phase='agent_patch_attempted';save();
  await request('PATCH','/update-agent/'+c.agent_id+'?version='+before.agent.version,c.retell_key,patch.agentPatch);
  const after=await inspect(c);fs.writeFileSync(path.join(dir,'after-private.json'),JSON.stringify(after,null,2));
  verify(before,after,patch);journal.phase='verified';
  journal.draft_version=after.agent.version;journal.backend_pinned_version=c.agent_version;
  save();console.log(JSON.stringify(journal));
 }catch{journal.phase='readback_required_no_automatic_retry';save();throw Error('REMOTE_CONFIGURATION_REQUIRES_READBACK');}
}
if(require.main===module)main().catch(e=>{console.error(/^(RETELL_|REMOTE_|PUBLISHED_|CONCURRENT_|SHARED_)/.test(e.message)?e.message:'AGENT_IMPROVEMENT_FAILED');process.exitCode=1;});
module.exports={build,verify,prompt};
