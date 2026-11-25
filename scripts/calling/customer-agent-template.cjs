'use strict';
// Server-side template preparation only. Never creates, publishes, binds or calls an agent.
const crypto=require('node:crypto'),{isIP}=require('node:net');
const tested=require('./improve-retell-agent.cjs'),contract=require('./tool-contract.json');
const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v);
function prepare({org_id,package_snapshot,account,source,tools}){
 if(!Number.isSafeInteger(org_id)||org_id<1||account?.org_id!==org_id)throw Error('CALLING_TEMPLATE_ORGANIZATION_MISMATCH');
 if(package_snapshot?.features?.calling!==true)throw Error('PLUS_REQUIRED');
 if(!Number.isSafeInteger(account.version)||account.version<1||!/^[a-f0-9]{64}$/.test(account.key_fingerprint||''))throw Error('CALLING_ACCOUNT_NOT_READY');
 const a=source?.agent,l=source?.llm;
 if(!a||!l||a.agent_id!==account.agent_id||a.version!==account.agent_version||a.is_published!==true||
  !id(a.voice_id)||a.response_engine?.type!=='retell-llm'||a.response_engine.llm_id!==l.llm_id||a.response_engine.version!==l.version||l.is_published!==true||l.model_config?.type!=='cascading')throw Error('CALLING_SOURCE_NOT_VERIFIED');
 if(tools?.org_id!==org_id||tools.account_key_fingerprint!==account.key_fingerprint||tools.verified!==true||!/^[a-f0-9]{64}$/.test(tools.token||''))throw Error('CALLING_CUSTOMER_TOOLS_NOT_READY');
 let endpoint;try{endpoint=new URL(tools.endpoint);}catch{throw Error('CALLING_CUSTOMER_TOOLS_NOT_READY');}
 if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||isIP(endpoint.hostname.replace(/^\[|\]$/g,''))||endpoint.hostname==='localhost'||endpoint.hostname.endsWith('.localhost')||endpoint.hostname.endsWith('.local'))throw Error('CALLING_CUSTOMER_TOOLS_NOT_READY');
 const general_tools=[{type:'end_call',name:'end_call',description:'End promptly after the closing, a refusal, wrong person or opt-out.'},...contract.tools.map(spec=>({type:'custom',...spec,parameters:JSON.parse(JSON.stringify(spec.parameters,(k,v)=>k==='format'?undefined:v)),url:endpoint.href,method:'POST',headers:{'X-Call-Tool-Token':tools.token},args_at_root:false,parameter_type:'json',timeout_ms:['opt_out','record_outcome'].includes(spec.name)?10000:20000,max_retry:0,speak_during_execution:false,speak_after_execution:true}))];
 // Derive NEW draft settings from the reviewed implementation. The published source is not modified.
 const patch=tested.build({agent:{...a,is_published:false,handbook_config:{}},llm:{...l,is_published:false,general_tools,states:null}});
 const llmBody=patch.llmPatch;
 const baseAgent={...patch.agentPatch,agent_name:`Workspace ${org_id} calling draft`,voice_id:a.voice_id};
 const review={org_id,account_version:account.version,source_agent_id:a.agent_id,source_agent_version:a.version,
  language:'en-US',max_call_duration_ms:60000,voice_id:a.voice_id,model_config:structuredClone(llmBody.model_config),
  tool_names:general_tools.map(t=>t.name),prompt:llmBody.general_prompt,tool_origin:endpoint.origin,
  creates_new_draft:true,publishing_enabled:false,phone_calls_enabled:false,replaces_existing_agent:false};
 const template_hash=digest(JSON.stringify({review,agent:baseAgent,llm:{...llmBody,general_tools:llmBody.general_tools.map(t=>({...t,headers:t.headers?{'X-Call-Tool-Token':digest(tools.token)}:undefined}))}}));
 return {review:{...review,template_hash},
  llmRequest:()=>({method:'POST',path:'/create-retell-llm',body:structuredClone(llmBody)}),
  agentRequest:created=>{if(!id(created?.llm_id)||!Number.isSafeInteger(created.version)||created.version<0||created.is_published!==false)throw Error('CALLING_CREATED_ENGINE_UNVERIFIED');return{method:'POST',path:'/create-agent',body:{...structuredClone(baseAgent),response_engine:{type:'retell-llm',llm_id:created.llm_id,version:created.version}}};}
 };
}
module.exports={prepare};
