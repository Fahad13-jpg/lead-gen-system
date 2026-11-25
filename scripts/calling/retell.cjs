'use strict';
const {createHash}=require('node:crypto');
const text=(x,max)=>typeof x==='string'&&x.length>0&&x.length<=max&&!/[\x00-\x1f]/.test(x);
// Pure mapping plus mock-only transport. No credentials or network client here.
function prepare(x){
 const b=x?.binding,c=x?.connection;
 if(!Number.isSafeInteger(b?.org_id)||b.org_id<=0||c?.org_id!==b.org_id||
 !text(b.activity_id,32)||!text(b.plan_hash,128)||!text(b.lease,128)||
 !text(c.agent_id,100)||!Number.isSafeInteger(c.agent_version)||c.agent_version<0||
 !/^\+1[0-9]{10}$/.test(c.from_number)||!/^\+1[0-9]{10}$/.test(x.to_number)||
 x.destination!=='US'||x.destination_verified!==true||x.language!=='en'||
 c.caller_id_authorized!==true||c.route_verified!==true)throw Error('CALL_BINDING_INVALID');
 const brief=x.call_brief;
 if(!brief||typeof brief!=='object'||Array.isArray(brief)||!brief.opening||!brief.permission_question)throw Error('CALL_BRIEF_REQUIRED');
 const data=JSON.stringify(brief);
 if(data.length>12000)throw Error('CALL_BRIEF_TOO_LARGE');
 // Keep the approved content intact. Agent prompt must treat this variable as DATA.
 const metadata={org_id:String(b.org_id),activity_id:b.activity_id,plan_hash:b.plan_hash,
  dispatch_key:createHash('sha256').update(JSON.stringify([b.org_id,b.activity_id,b.plan_hash,b.lease])).digest('hex')};
 return {from_number:c.from_number,to_number:x.to_number,override_agent_id:c.agent_id,
  override_agent_version:c.agent_version,agent_override:{agent:{max_call_duration_ms:60000}},
  metadata,retell_llm_dynamic_variables:{approved_call_brief:data,preferred_language:'English'}};
}
function receipt(data,request){
 if(!text(data?.call_id,128)||data.call_type!=='phone_call'||data.agent_id!==request.override_agent_id||
 data.agent_version!==request.override_agent_version||data.from_number!==request.from_number||data.to_number!==request.to_number||
 !['registered','ongoing','ended','error','not_connected'].includes(data.call_status))throw Error('CALL_RECEIPT_UNVERIFIED');
 for(const key of Object.keys(request.metadata))if(data.metadata?.[key]!==request.metadata[key])throw Error('CALL_RECEIPT_BINDING_MISMATCH');
 return {id:data.call_id,status:data.call_status,provider_accepted:true,automatic_redial_allowed:false};
}
async function create(x,deps){
 if(deps?.mode!=='mock')throw Error('LIVE_CALLING_NOT_IMPLEMENTED');
 const request=prepare(x);
 // No retry, including on errors that could have accepted the call remotely.
 const response=await deps.request({method:'POST',url:'https://api.retellai.com/v2/create-phone-call',body:request});
 if(response?.status!==201)throw Error('CALL_CREATE_RECONCILIATION_REQUIRED');
 return receipt(response.data,request);
}
function snapshot(data,request,callId){
 const r=receipt(data,request);
 if(r.id!==callId)throw Error('CALL_ID_MISMATCH');
 return {provider_call_id:r.id,status:r.status,ended:['ended','error','not_connected'].includes(r.status),
  duration_ms:Number.isSafeInteger(data.duration_ms)&&data.duration_ms>=0?data.duration_ms:null,
  // Retell costs alone may exclude a custom carrier. Never finalize all-in billing here.
  cost_settlement_required:true,automatic_redial_allowed:false};
}
module.exports={prepare,receipt,create,snapshot};
