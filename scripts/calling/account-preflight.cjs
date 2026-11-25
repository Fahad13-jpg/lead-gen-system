'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{isDeepStrictEqual}=require('node:util');
const contract=require('./tool-contract.json');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function prompt(){return fs.readFileSync(path.join(__dirname,'AGENT_PROMPT.md'),'utf8').split('Setup note:')[0].replace(/^#.*\r?\n/,'').trim().replace(/\r\n/g,'\n');}
function assess(account,snapshot){
 const {agent:a,llm:l,number:n}=snapshot||{},expected=prompt(),e=a?.response_engine;
 const checks={
  published_agent:a?.agent_id===account.agent_id&&a?.version===account.agent_version&&a?.is_published===true,
  published_engine:!!l&&e?.type==='retell-llm'&&e.llm_id===l.llm_id&&e.version===l.version&&l.is_published===true,
  english_and_duration:a?.language==='en-US'&&a.max_call_duration_ms===60000&&a.end_call_after_silence_ms===10000,
  voicemail_and_ivr:a?.voicemail_option?.action?.type==='hangup'&&a?.ivr_option?.action?.type==='hangup',
  prompt_matches_reviewed_template:typeof l?.general_prompt==='string'&&l.general_prompt.trim().replace(/\r\n/g,'\n')===expected&&l.start_speaker==='agent'&&!l.begin_message&&(l.states==null||Array.isArray(l.states)&&!l.states.length),
  tools_match_contract:false,
  number_access:typeof account.from_number==='string'&&n?.phone_number===account.from_number,
  us_destination_allowed:false
 };
 const list=n?.allowed_outbound_country_list;
 checks.us_destination_allowed=checks.number_access&&(list==null||Array.isArray(list)&&(!list.length||list.includes('US')));
 const tools=l?.general_tools,names=['end_call',...contract.tools.map(t=>t.name)];
 if(Array.isArray(tools)&&tools.length===names.length&&new Set(tools.map(t=>t.name)).size===names.length&&tools.some(t=>t.name==='end_call'&&t.type==='end_call')){
  checks.tools_match_contract=contract.tools.every(spec=>{
   const t=tools.find(t=>t.name===spec.name);let url;try{url=new URL(t?.url);}catch{return false;}
   const schema=JSON.parse(JSON.stringify(spec.parameters,(k,v)=>k==='format'?undefined:v));
   return t.type==='custom'&&t.method==='POST'&&url.protocol==='https:'&&!url.username&&!url.password&&!url.hash&&t.max_retry===0&&t.args_at_root===false&&t.parameter_type==='json'&&t.speak_during_execution===false&&t.timeout_ms===(['opt_out','record_outcome'].includes(t.name)?10000:20000)&&isDeepStrictEqual(t.parameters,schema);
  });
 }
 // Passing API/config checks is not a route, authenticated tool backend, voice or funding proof.
 return{checks,provider_checks_passed:Object.values(checks).every(v=>v===true),template_hash:hash(expected),snapshot_hash:hash(JSON.stringify(snapshot)),execution_authorized:false};
}
module.exports={assess,prompt,hash};
