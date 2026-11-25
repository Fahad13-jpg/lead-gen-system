'use strict';
const {select}=require('./policy.cjs');
async function uncertain(deps,binding){
 try{await deps.markUncertain(binding);}catch{return {state:'reconciliation_required',reason:'uncertain_state_commit_unknown',retry_allowed:false};}
 return {state:'reconciliation_required',retry_allowed:false};
}
// Offline port contract. No production adapter or network client is installed.
// reserveAndBegin MUST atomically recheck all gates, hash, global concurrency and
// shared/org budgets, retaining the same lease through finish/reconciliation.
async function tick(queue,deps,{mock_only=true}={}){
 if(!mock_only||deps.mode!=='mock')throw Error('LIVE_CALLING_NOT_IMPLEMENTED');
 const picked=select(queue,deps.now());
 if(!picked.job)return {state:'idle',deferred:picked.deferred};
 const job=picked.job;
 if(!job.plan_hash||!job.call_brief||!job.call_brief.opening||!job.call_brief.permission_question)
  return {state:'blocked',reason:'approved_call_brief_required'};
 let begin;
 try{begin=await deps.reserveAndBegin({job_id:job.id,org_id:job.policy.org_id,plan_hash:job.plan_hash,
  reserve_micro_usd:picked.policy.reserve_micro_usd,max_connected_seconds:60});}
 catch{return {state:'reconciliation_required',reason:'begin_commit_unknown',retry_allowed:false};}
 if(begin?.authorized!==true||!begin.lease)return {state:'blocked',reason:'reservation_denied'};
 const binding={job_id:job.id,org_id:job.policy.org_id,lease:begin.lease,plan_hash:job.plan_hash};
 let call;
 try{call=await deps.createCall({...binding,call_brief:job.call_brief,language:job.policy.language,
  max_connected_seconds:60});}
 catch{return uncertain(deps,binding);}
 if(typeof call?.id!=='string'||!call.id)return uncertain(deps,binding);
 try{if((await deps.recordAccepted({...binding,provider_call_id:call.id}))?.saved!==true)throw Error('UNSAVED');}
 catch{return {state:'reconciliation_required',provider_call_id:call.id,retry_allowed:false};}
 return {state:'provider_accepted',provider_call_id:call.id,completed:false};
}
module.exports={tick};
