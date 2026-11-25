'use strict';
const core=require('./core.cjs'),{prepareTransport}=require('./transport.cjs'),{execute}=require('./executor.cjs');

// Offline integration of the real gate/claim/finish contracts and transport port.
// Nothing installs this runner in n8n or supplies a live network/credential port.
async function run(candidate,ports){
 if(ports?.mode!=='mock'&&!(ports?.mode==='live'&&ports.liveEnabled===true))throw Error('LIVE_WHATSAPP_NOT_CONNECTED');
 if(typeof ports.executeQuery!=='function')throw Error('DATABASE_PORT_REQUIRED');
 let gate=await ports.executeQuery(core.query('outreach_whatsapp_gate',candidate)),rechecked=false;
 if(gate?.allowed!==true&&ports.recheckEnabled===true&&typeof ports.recheck==='function'&&candidate.step>1&&['sender_not_ready','template_changed_or_unapproved','provider_recheck_required'].includes(gate?.reason)){
  const input=await ports.executeQuery(core.query('outreach_whatsapp_recheck_input',candidate));
  if(input?.ready===true){
   const task=input.task;
   if(task?.org_id!==candidate.org_id||String(task.plan_id)!==String(candidate.plan_id)||task.step!==candidate.step||task.content_hash!==candidate.content_hash)return {state:'blocked',reason:'recheck_task_binding_invalid',submitted:false};
   rechecked=true;
   try{const observation=await ports.recheck(task),saved=await ports.executeQuery(core.query('outreach_whatsapp_recheck_store',observation));if(saved?.saved!==true)throw Error('UNCONFIRMED');}
   catch{return {state:'blocked',reason:'recheck_persistence_unconfirmed',submitted:false,rechecked};}
   gate=await ports.executeQuery(core.query('outreach_whatsapp_gate',candidate));
  }
 }
 if(gate?.allowed!==true)return {state:'blocked',reason:gate?.reason||'gate_unconfirmed',submitted:false,rechecked};
 const artifact=gate.artifact;
 if(artifact?.org_id!==candidate.org_id||artifact.execution_authorized!==false)return {state:'blocked',reason:'artifact_binding_invalid',submitted:false};
 const snapshot=core.hash(artifact);
 let submit;
 try{submit=await prepareTransport(artifact,ports);}
 catch{return {state:'blocked',reason:'credential_preflight_required',submitted:false};}
 // Resolve/check credentials BEFORE creating a budget reservation. The SQL claim
 // rechecks all mutable gates atomically. An artifact changed between these calls
 // must not use the prepared credential, and its claim stays quarantined.
 let submitted=false;
 const result=await execute(candidate,{mode:ports.mode,liveEnabled:ports.liveEnabled,executeQuery:ports.executeQuery,request:async(request,claimed)=>{
  if(core.hash(claimed)!==snapshot)throw Error('CLAIMED_ARTIFACT_CHANGED');
  submitted=true;
  return submit(request,claimed);
 }});
 return {...result,submitted,delivery_verified:false};
}
async function tick(orgId,ports){
 if(ports?.mode!=='mock'&&!(ports?.mode==='live'&&ports.liveEnabled===true))throw Error('LIVE_WHATSAPP_NOT_CONNECTED');
 const queue=await ports.executeQuery(core.query('outreach_whatsapp_queue',{org_id:orgId}));
 if(!Array.isArray(queue?.items))return {state:'blocked',reason:'queue_unconfirmed',processed:0};
 if(!queue.items.length)return {state:'idle',processed:0};
 // Skip at most ten preflight-blocked candidates so a missing approval cannot
 // starve later leads. Stop after the first claim attempt or transport call.
 let examined=0;
 for(const candidate of queue.items.slice(0,10)){
  if(candidate?.org_id!==orgId)return {state:'blocked',reason:'queue_org_mismatch',processed:0,examined};
  examined++;
  const result=await run(candidate,ports);
  if(result.state==='blocked'&&result.submitted===false){if(result.rechecked)return {state:'blocked',reason:result.reason,processed:0,examined,result};continue;}
  return {state:'processed',processed:1,examined,result};
 }
 return {state:'blocked',reason:'checked_candidates_not_ready',processed:0,examined};
}
module.exports={run,tick};
