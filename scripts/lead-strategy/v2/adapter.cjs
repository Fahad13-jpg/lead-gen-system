'use strict';
// Local orchestration seam. All persistence/transport dependencies must be injected.
const contract=require('./contract.cjs'),provider=require('./provider.cjs');
function sqlCall(name,payload){
 if(!['strategy_ai_gate','strategy_reservation_context','strategy_finish','strategy_approval'].includes(name))throw Error('UNKNOWN_SQL_CALL');
 return "SELECT "+name+"('"+JSON.stringify(payload).replace(/'/g,"''")+"'::jsonb) AS result";
}
async function runClaim(claim,deps,options={}){
 if(!Number.isSafeInteger(claim.org_id)||claim.org_id!==claim.input?.lead?.org_id||!Number.isSafeInteger(claim.id)||!claim.lease||!claim.input.fingerprint)throw Error('INVALID_CLAIM');
 const prepared=contract.build(claim.input,options.briefOptions);
 const mode=options.mode||claim.input.campaign.config.mode;
 if(!['ai','template','fallback'].includes(mode))throw Error('V2_MODE_REQUIRES_EXPLICIT_SELECTION');
 let plan;
 if(mode==='ai'){
  const reservation=await deps.reserve({id:claim.id,org_id:claim.org_id,lease:claim.lease,wants_ai:true});
  if(reservation?.allowed!==true)plan=await provider.generate(prepared);
  else{
   const args={id:claim.id,org_id:claim.org_id,lease:claim.lease,fingerprint:claim.input.fingerprint};
   const state=await deps.recheck(args);
   const operation={lease:claim.lease,reservation:state?.reservation,lease_expires_at:Date.parse(state?.lease_until),fingerprint:prepared.input_hash};
   plan=await provider.generate(prepared,{...options.provider,mode:'ai',allowRepair:false,operation,
    transport:deps.transport,gate:async()=>{const s=await deps.recheck(args);return s?.allowed===true&&s.reservation===operation.reservation&&Date.parse(s.lease_until)===operation.lease_expires_at;}});
  }
 }else plan=await provider.generate(prepared,{mode,explicitFallback:options.explicitFallback});
 // Existing database fingerprint and local brief hash are different identities; never substitute one for the other.
 const payload={id:claim.id,org_id:claim.org_id,lease:claim.lease,plan,ai_status:plan.state,usage:{prompt_tokens:plan.generation.tokens.prompt,completion_tokens:plan.generation.tokens.completion,total_tokens:plan.generation.tokens.total,usage_complete:plan.generation.usage_complete??true}};
 return {payload,result:await deps.finish(payload)};
}
module.exports={runClaim,sqlCall};
