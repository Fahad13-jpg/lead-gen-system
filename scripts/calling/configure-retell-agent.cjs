'use strict';
// Explicit account setup only. No calls, model inference, publishing or DB writes.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),https=require('node:https'),assert=require('node:assert/strict');
const {isDeepStrictEqual}=require('node:util');
const agentId='agent_8ad1ab3a505d9b818a8035558e';
const directory=path.resolve(__dirname,'../../.local/calling-retell');
const toolsMatch=(actual,expected)=>Array.isArray(actual)&&actual.length===expected.length&&expected.every((tool,i)=>Object.entries(tool).every(([k,v])=>isDeepStrictEqual(actual[i]?.[k],v)));
function keyFromFile(){
 const file=path.join(os.homedir(),'Desktop','retell.txt');
 let value=fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'').trim();
 const assigned=/^(?:RETELL_API_KEY|API_KEY)\s*=\s*["']?([^\s"']+)["']?$/i.exec(value);
 if(assigned)value=assigned[1];
 if(!value||/[\s\r\n]/.test(value)||value.length>1024)throw Error('KEY_FILE_FORMAT_INVALID');
 return value;
}
async function request(method,route,key,body){
 const readOrUpdate=['GET','PATCH'].includes(method)&&/^\/(get-agent|update-agent|get-retell-llm|update-retell-llm)(\/|\?|$)/.test(route);
 const listOnly=method==='POST'&&/^\/v2\/list-agents(?:\?|$)/.test(route);
 if(!readOrUpdate&&!listOnly)throw Error('SETUP_ROUTE_FORBIDDEN');
 return new Promise((resolve,reject)=>{
  const payload=body===undefined?undefined:JSON.stringify(body);
  const req=https.request({hostname:'api.retellai.com',path:route,method,family:4,timeout:20000,
   headers:{Authorization:'Bearer '+key,...(payload?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}:{})}},res=>{
   let raw='';res.setEncoding('utf8');res.on('data',chunk=>{raw+=chunk;if(raw.length>2e6)req.destroy(Error('RESPONSE_TOO_LARGE'));});
   res.on('error',()=>reject(Error('RETELL_RESPONSE_INTERRUPTED')));
   res.on('end',()=>{if(res.statusCode<200||res.statusCode>=300){
    fs.mkdirSync(directory,{recursive:true});
    let message='';try{const parsed=JSON.parse(raw);message=typeof parsed.message==='string'?parsed.message:typeof parsed.error==='string'?parsed.error:'No validation message';}catch{}
    if(!message||message==='No validation message')message=raw;
    message=message.split(key).join('[REDACTED]').replace(/key_[A-Za-z0-9_-]+/g,'[REDACTED]').slice(0,1000);
    fs.writeFileSync(path.join(directory,'last-api-error.json'),JSON.stringify({method,route,status:res.statusCode,message},null,2)+'\n');
    return reject(Error('RETELL_HTTP_'+res.statusCode+'_'+method+'_'+route.split('/').filter(Boolean).slice(0,2).join('_').split('?')[0]));
   }
    try{resolve(JSON.parse(raw));}catch{reject(Error('RETELL_RESPONSE_INVALID'));}});
  });
  req.on('timeout',()=>req.destroy(Error('RETELL_TIMEOUT')));
  // Never emit errors containing request objects, headers, response text or the key.
  req.on('error',e=>reject(Error(['ETIMEDOUT','ECONNRESET','ENOTFOUND','EAI_AGAIN','ECONNREFUSED'].includes(e.code)?e.code:'RETELL_REQUEST_FAILED')));
  req.end(payload);
 });
}
function summary(agent,llm){return {agent_id:agent.agent_id,agent_name:agent.agent_name,version:agent.version,is_published:agent.is_published,
 language:agent.language,voice_id:agent.voice_id,max_call_duration_ms:agent.max_call_duration_ms,
 voicemail_action:agent.voicemail_option?.action?.type,ivr_action:agent.ivr_option?.action?.type,
 response_engine:agent.response_engine,webhook_configured:!!agent.webhook_url,
 llm:llm?{llm_id:llm.llm_id,version:llm.version,is_published:llm.is_published,model:llm.model,model_config:llm.model_config,
 prompt_characters:typeof llm.general_prompt==='string'?llm.general_prompt.length:0,
 tools:Array.isArray(llm.general_tools)?llm.general_tools.map(t=>({type:t.type,name:t.name})):[]}:null};}
async function inspect(key){
 const agent=await request('GET','/get-agent/'+agentId,key);assert.equal(agent.agent_id,agentId);
 let llm=null;
 if(agent.response_engine?.type==='retell-llm'&&/^[A-Za-z0-9_-]+$/.test(agent.response_engine.llm_id||'')){
  const v=agent.response_engine.version;
  llm=await request('GET','/get-retell-llm/'+agent.response_engine.llm_id+(Number.isSafeInteger(v)?'?version='+v:''),key);
 }
 return {agent,llm};
}
async function main(){
  const mode=process.argv[2]||'inspect';if(!['inspect','configure','verify'].includes(mode))throw Error('INSPECT_OR_CONFIGURE_REQUIRED');
 const key=keyFromFile();const current=await inspect(key);
 fs.mkdirSync(directory,{recursive:true});
 if(mode==='verify'){
  const proposed=require('./prepare-retell-draft.cjs').build().requests[0].body;
  const checks={unpublished_agent:current.agent.is_published===false,unpublished_llm:current.llm?.is_published===false,
   exact_prompt:current.llm?.general_prompt===proposed.general_prompt,agent_speaks_first:current.llm?.start_speaker==='agent',
   dynamic_opening:current.llm?.begin_message==null,
   english:current.agent.language==='en-US',duration_60_seconds:current.agent.max_call_duration_ms===60000,
   silence_10_seconds:current.agent.end_call_after_silence_ms===10000,dnc_detection:current.agent.enable_dnc_detection===true,
   voicemail_hangup:current.agent.voicemail_option?.action?.type==='hangup',ivr_hangup:current.agent.ivr_option?.action?.type==='hangup',
   end_call_tool:toolsMatch(current.llm?.general_tools,proposed.general_tools)};
  const backups=fs.readdirSync(directory).filter(f=>/^draft-[0-9]+-before\.json$/.test(f)).sort();
  if(!backups.length)throw Error('RETELL_BEFORE_BACKUP_REQUIRED');
  const before=JSON.parse(fs.readFileSync(path.join(directory,backups.at(-1)),'utf8'));
  checks.same_agent_version=current.agent.version===before.agent.version;
  checks.same_llm_version=current.llm.version===before.llm.version;
  checks.voice_preserved=current.agent.voice_id===before.agent.voice_id;
  checks.model_preserved=isDeepStrictEqual(current.llm.model_config,before.llm.model_config);
  const report={agent_id:agentId,version:current.agent.version,llm_id:current.llm.llm_id,verified_at:new Date().toISOString(),verified:Object.values(checks).every(Boolean),checks,calls_placed:0,published:false};
  fs.writeFileSync(path.join(directory,'verification.json'),JSON.stringify(report,null,2)+'\n');
  if(report.verified){
   const file=path.join(directory,backups.at(-1).replace('-before.json','-journal.json'));
   const journal=JSON.parse(fs.readFileSync(file,'utf8'));delete journal.error;journal.phase='verified_draft_configured';
   fs.writeFileSync(file,JSON.stringify(journal,null,2)+'\n');
  }
  console.log(JSON.stringify(report));if(!report.verified)process.exitCode=1;return;
 }
 if(mode==='inspect'){
  fs.writeFileSync(path.join(directory,'inspection.json'),JSON.stringify(summary(current.agent,current.llm),null,2)+'\n');
  console.log(JSON.stringify(summary(current.agent,current.llm)));return;
 }
 assert.equal(current.agent.is_published,false);assert.equal(current.llm?.is_published,false);
 assert.equal(current.agent.response_engine.type,'retell-llm');
 assert.ok(Number.isSafeInteger(current.agent.version)&&Number.isSafeInteger(current.llm.version));
 // Never alter a response engine shared with another agent.
 // Optional filter omitted: the documented example failed live validation
 // (the service requires an additional `type` property). Do not guess its schema.
 const listed=await request('POST','/v2/list-agents?limit=1000',key,{});
 const agents=Array.isArray(listed)?listed:listed?.items;
 if(!Array.isArray(agents)||listed?.has_more===true)throw Error('RETELL_COMPLETE_AGENT_LIST_REQUIRED');
 for(const entry of agents){
  if(entry.agent_id===agentId)continue;
  if(entry.channel&&entry.channel!=='voice')continue;
  if(!/^[A-Za-z0-9_-]+$/.test(entry.agent_id||''))throw Error('RETELL_AGENT_LIST_UNVERIFIED');
  const other=await request('GET','/get-agent/'+entry.agent_id,key);
  if(other.response_engine?.llm_id===current.llm.llm_id)throw Error('RETELL_SHARED_LLM_REQUIRES_REVIEW');
 }
 if((current.llm.general_prompt||'').trim()||
  (current.llm.general_tools||[]).some(t=>t.type!=='end_call'))throw Error('RETELL_NONEMPTY_DRAFT_REQUIRES_REVIEW');
 const proposed=require('./prepare-retell-draft.cjs').build().requests[0].body;
 const llmPatch={general_prompt:proposed.general_prompt,start_speaker:'agent',begin_message:null,general_tools:proposed.general_tools};
 const agentPatch={language:'en-US',max_call_duration_ms:60000,end_call_after_silence_ms:10000,enable_dnc_detection:true,
  voicemail_option:{action:{type:'hangup'}},ivr_option:{action:{type:'hangup'}}};
 const stem='draft-'+Date.now();
 const journal={agent_id:agentId,version:current.agent.version,llm_id:current.llm.llm_id,llm_version:current.llm.version,
  phase:'backed_up',published:false,calls_placed:0};
 fs.writeFileSync(path.join(directory,stem+'-before.json'),JSON.stringify(current,null,2)+'\n',{flag:'wx'});
 fs.writeFileSync(path.join(directory,stem+'-proposed.json'),JSON.stringify({agentPatch,llmPatch},null,2)+'\n',{flag:'wx'});
 const save=()=>fs.writeFileSync(path.join(directory,stem+'-journal.json'),JSON.stringify(journal,null,2)+'\n');save();
 try{
  journal.phase='agent_patch_attempted';save();
  const updatedAgent=await request('PATCH','/update-agent/'+agentId+'?version='+current.agent.version,key,agentPatch);
  assert.equal(updatedAgent.is_published,false);assert.equal(updatedAgent.version,current.agent.version);
  journal.phase='agent_patch_confirmed';save();
  journal.phase='llm_patch_attempted';save();
  const updatedLlm=await request('PATCH','/update-retell-llm/'+current.llm.llm_id+'?version='+current.llm.version,key,llmPatch);
  assert.equal(updatedLlm.is_published,false);assert.equal(updatedLlm.version,current.llm.version);
  journal.phase='llm_patch_confirmed';save();
  const after=await inspect(key);
  assert.equal(after.agent.version,current.agent.version);assert.equal(after.agent.is_published,false);
  assert.equal(after.agent.language,'en-US');assert.equal(after.agent.max_call_duration_ms,60000);
  assert.equal(after.agent.enable_dnc_detection,true);assert.equal(after.agent.end_call_after_silence_ms,10000);
  assert.equal(after.agent.voice_id,current.agent.voice_id);
  assert.equal(after.agent.voicemail_option?.action?.type,'hangup');assert.equal(after.agent.ivr_option?.action?.type,'hangup');
  assert.equal(after.llm.general_prompt,llmPatch.general_prompt);assert.equal(after.llm.is_published,false);
  assert.equal(after.llm.start_speaker,'agent');assert.ok(after.llm.begin_message==null);
  assert.ok(toolsMatch(after.llm.general_tools,llmPatch.general_tools));
  assert.deepEqual(after.llm.model_config,current.llm.model_config);
  fs.writeFileSync(path.join(directory,stem+'-after.json'),JSON.stringify(after,null,2)+'\n');
  journal.phase='verified_draft_configured';save();
  console.log(JSON.stringify({configured:true,verified_by_readback:true,...summary(after.agent,after.llm),calls_placed:0,published:false,
   remaining:['calendar_tool_connection','authenticated_opt_out_tool','number_binding','billing_verification','approved_live_test']}));
 }catch(error){journal.error='configuration_unverified_no_automatic_retry';save();throw error;}
}
if(require.main===module)main().catch(e=>{console.error(/^(RETELL_|KEY_|E[A-Z_]+$|CONFIGURATION_)/.test(e.message)?e.message:'RETELL_SETUP_FAILED');process.exitCode=1;});
module.exports={summary,request};
