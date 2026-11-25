'use strict';
const {timingSafeEqual}=require('node:crypto');
const quote=v=>"'"+String(v).replace(/'/g,"''")+"'";
function authorized(headers,secret){
 const value=headers?.['x-call-tool-token'];
 if(typeof secret!=='string'||secret.length<32||typeof value!=='string')return false;
 const a=Buffer.from(value),b=Buffer.from(secret);return a.length===b.length&&timingSafeEqual(a,b);
}
function envelope(body,config){
 if(!body||typeof body!=='object'||Array.isArray(body)||Buffer.byteLength(JSON.stringify(body))>262144)throw Error('INVALID_TOOL_REQUEST');
 const c=body.call;
 const version=c?.call_type==='web_call'?(config.browser_agent_version??config.agent_version):config.agent_version;
 if(!c||!/^call_[A-Za-z0-9_-]{1,150}$/.test(c.call_id||'')||c.agent_id!==config.agent_id||c.agent_version!==version||!['phone_call','web_call'].includes(c.call_type))throw Error('CALL_IDENTITY_INVALID');
 if(!require('./tool-contract.json').tools.some(t=>t.name===body.name))throw Error('UNKNOWN_TOOL');
 return c;
}
async function handle(input,config,deps){
 if(!authorized(input.headers,config.token))return {ok:false,reason:'unauthorized'};
 // Provider-supplied call context is never accepted as authority by itself.
 const incoming=envelope(input.body,config),actual=await deps.getCall(incoming.call_id);
 if(actual.call_id!==incoming.call_id||actual.agent_id!==config.agent_id||actual.agent_version!==incoming.agent_version||actual.call_type!==incoming.call_type||actual.call_status!=='ongoing')return {ok:false,reason:'provider_call_not_active_or_mismatched'};
 if(actual.call_type==='web_call')return deps.browserTest?deps.browserTest(input,actual):{ok:false,reason:'browser_test_has_no_live_lead_binding',simulation:false,action_completed:false};
 const rows=await deps.rows(`SELECT org_id,id::text AS activity_id,dispatch_metadata->>'provider_call_id' AS provider_call_id,dispatch_metadata->>'connection_ref' AS connection_ref,dispatch_metadata->'expected_request' AS expected_request FROM outreach_activities WHERE org_id=${config.org_id} AND channel='call' AND dispatch_metadata->>'version'='calling_v1' AND dispatch_metadata->>'provider_call_id'=${quote(actual.call_id)} AND dispatch_metadata->>'connection_ref'=${quote(config.connection_ref)} LIMIT 2`);
 if(rows.length!==1)return {ok:false,reason:'unique_call_binding_required'};
 const binding=rows[0];
 // Verify the original pinned agent, caller, recipient and dispatch correlation.
 // A provider call ID alone must not promote a mismatched phone request to authority.
 try{const receipt=require('./retell.cjs').receipt(actual,binding.expected_request);
  if(receipt.id!==binding.provider_call_id||binding.org_id!==config.org_id||binding.connection_ref!==config.connection_ref)throw Error();
 }catch{return {ok:false,reason:'original_phone_request_mismatch',action_completed:false,retry_allowed:false};}
 return require('./tools.cjs').create({mode:'connected',transport_verified:true,now:deps.now,authenticate:async()=>binding,executeQuery:deps.executeQuery,calendar:deps.calendar}).invoke(input.body.name,input.body.args,input);
}
module.exports={authorized,envelope,handle};
