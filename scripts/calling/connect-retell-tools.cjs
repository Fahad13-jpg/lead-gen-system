'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{isDeepStrictEqual}=require('node:util');
const setup=require('./configure-retell-agent.cjs'),{dir}=require('./deploy-tools.cjs');
// Verified live: Retell drops JSON Schema `format: date-time` on readback.
// Keep strict RFC3339/timezone/confirmation checks in the tool and SQL backend.
const providerSchema=p=>JSON.parse(JSON.stringify(p,(k,v)=>k==='format'?undefined:v));
async function main(){
 const config=JSON.parse(fs.readFileSync(path.join(dir,'private.json'),'utf8'));
 const tunnel=JSON.parse(fs.readFileSync(path.join(dir,'tunnel.json'),'utf8'));assert(/^https:\/\/[a-z0-9-]+\.trycloudflare\.com\/tools$/.test(tunnel.url));
 const agent=await setup.request('GET','/get-agent/'+config.agent_id,config.retell_key);assert.equal(agent.is_published,false);assert.equal(agent.version,config.agent_version);
 const engine=agent.response_engine;assert.equal(engine.type,'retell-llm');
 const llm=await setup.request('GET','/get-retell-llm/'+engine.llm_id+'?version='+engine.version,config.retell_key);assert.equal(llm.is_published,false);
 const listed=await setup.request('POST','/v2/list-agents?limit=1000',config.retell_key,{});assert(Array.isArray(listed.items)&&!listed.has_more);
 for(const entry of listed.items){if(entry.agent_id===config.agent_id||entry.channel&&entry.channel!=='voice')continue;const other=await setup.request('GET','/get-agent/'+entry.agent_id,config.retell_key);assert.notEqual(other.response_engine?.llm_id,engine.llm_id,'SHARED_ENGINE_BLOCKED');}
 const tools=[{type:'end_call',name:'end_call',description:'End the call politely.'},...require('./tool-contract.json').tools.map(t=>({...t,parameters:providerSchema(t.parameters),type:'custom',url:tunnel.url,method:'POST',headers:{'X-Call-Tool-Token':config.token},args_at_root:false,parameter_type:'json',timeout_ms:45000,max_retry:0,speak_during_execution:true,speak_after_execution:true}))];
 const prompt=fs.readFileSync(path.join(__dirname,'AGENT_PROMPT.md'),'utf8').split('Setup note:')[0].replace(/^#.*\r?\n/,'').trim();
 const patch={general_prompt:prompt,general_tools:tools,start_speaker:'agent',begin_message:null};
 const verifyOnly=process.argv[2]==='verify';
 const backup=path.join(dir,'retell-tools-before.json');
 if(!verifyOnly){assert(!fs.existsSync(backup),'EXISTING_REMOTE_BACKUP_INSPECT_BEFORE_REPLAY');fs.writeFileSync(backup,JSON.stringify({agent,llm},null,2));
 await setup.request('PATCH','/update-retell-llm/'+engine.llm_id+'?version='+engine.version,config.retell_key,patch);}
 const before=JSON.parse(fs.readFileSync(backup,'utf8'));assert(isDeepStrictEqual(agent.response_engine,before.agent.response_engine));assert.equal(agent.voice_id,before.agent.voice_id);assert(isDeepStrictEqual(llm.model_config,before.llm.model_config));
 const after=await setup.request('GET','/get-retell-llm/'+engine.llm_id+'?version='+engine.version,config.retell_key);
 assert.equal(after.general_prompt,prompt);assert.equal(after.is_published,false);assert(isDeepStrictEqual(after.model_config,llm.model_config));
 for(const expected of tools){const actual=after.general_tools.find(t=>t.name===expected.name);assert(actual);for(const [k,v] of Object.entries(expected))assert(isDeepStrictEqual(actual[k],v),'READBACK_MISMATCH:'+expected.name+':'+k);}
 const report={verified_at:new Date().toISOString(),agent_id:agent.agent_id,version:agent.version,published:false,tool_names:tools.map(t=>t.name),model_preserved:true,phone_calls_placed:0,tool_url:tunnel.url,calendar_event_written:false};fs.writeFileSync(path.join(dir,'retell-tools-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e.message.startsWith('RETELL_')?e.message:'RETELL_TOOLS_SETUP_UNVERIFIED:'+e.message.replace(/key_[A-Za-z0-9_-]+/g,'[REDACTED]').slice(0,140));process.exitCode=1;});
