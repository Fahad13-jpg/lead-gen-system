'use strict';
// Normalized internal event contract, NOT a guessed Retell webhook schema.
// A real adapter must verify signature and map actual provider events first.
function reduce(current,event){
 if(!current||!event||event.authenticated!==true||event.org_id!==current.org_id||
 !Number.isSafeInteger(current.org_id)||current.org_id<=0||!current.provider_call_id||
 event.provider_call_id!==current.provider_call_id||!event.id)return {accepted:false,reason:'event_binding_invalid'};
 const seen=Array.isArray(current.event_ids)?current.event_ids:[];
 if(seen.includes(event.id))return {accepted:true,replayed:true,record:current};
 if(!['connected','ended','cost_final','analysis'].includes(event.type))return {accepted:false,reason:'event_type_unknown'};
 const next=structuredClone(current);next.event_ids=[...seen,event.id];
 if(event.type==='connected')next.connected=true;
 if(event.type==='ended')next.ended=true;
 if(event.type==='cost_final'){
  if(!Number.isSafeInteger(event.total_micro_usd)||event.total_micro_usd<0)return {accepted:false,reason:'invalid_cost'};
  if(next.actual_micro_usd!==undefined&&next.actual_micro_usd!==event.total_micro_usd)
   return {accepted:false,reason:'conflicting_final_cost',reconciliation_required:true};
  next.actual_micro_usd=event.total_micro_usd;
 }
 if(event.type==='analysis'){
  // Analysis cannot confirm booking, consent, payment or permission to retry.
  next.analysis={outcome:['interested','busy','not_interested','opt_out','unknown'].includes(event.outcome)?event.outcome:'unknown',
   review_required:true};
  if(event.outcome==='opt_out')next.suppression_required=true;
 }
 // A normalized event is not proof of complete carrier + AI billing. Only the
 // durable settlement gate can release funds after all receipts are verified.
 next.state=next.ended?'awaiting_final_cost':'active';
 next.budget_release_allowed=false;
 next.automatic_redial_allowed=false;
 return {accepted:true,record:next};
}
module.exports={reduce};
