'use strict';
const{decide}=require('./campaign-authority.cjs'),slice=require('./campaign-slice.cjs');
async function tick({org_id,campaign_id,enabled=false},ports){
 if(!enabled)return{state:'disabled',issued:0,provider_requests:0};
 if(![org_id,campaign_id].every(v=>Number.isSafeInteger(v)&&v>0))throw Error('INVALID_CAMPAIGN');
 const claim=await ports.claim({org_id,campaign_id});if(claim?.claimed!==true)return{state:'idle',issued:0};
 if(claim.org_id!==org_id||claim.campaign_id!==campaign_id||!/^[a-f0-9]{32}$/.test(claim.lease||'')||!/^[a-f0-9]{32}$/.test(claim.scope_hash||'')||!Number.isSafeInteger(claim.revision))return{state:'claim_unconfirmed',issued:0};
 let issued=0,state='complete';const decisions=[];
 try{
  const snapshot=await ports.load(claim);
  for(const plan of snapshot.authority?.scope?.plans||[]){
   const current=await ports.load(claim),decision=decide(current.authority,current,plan.plan_id,{enabled:true,now:ports.now()});
   if(!decision.renew){decisions.push({plan_id:plan.plan_id,reason:decision.reason});continue;}
   if(decision.authority_revision!==claim.revision||decision.authority_hash!==claim.scope_hash){state='authority_changed';break;}
   // Publish is lease/revision fenced in SQL. A timeout is not retried here.
   let published;try{published=await ports.publish(claim,decision);}catch{state='publication_unconfirmed';break;}
   if(!published?.slice){state='publication_denied';break;}
   slice.validate(published.slice,ports.now());
   const grant=published.slice;
   if(grant.binding.org_id!==org_id||grant.plan.plan_id!==plan.plan_id||grant.authority.campaign_id!==campaign_id||grant.authority.campaign_version!==decision.campaign_version||grant.authority.revision!==claim.revision||grant.authority.scope_hash!==claim.scope_hash||Date.parse(grant.expires_at)>Date.parse(decision.expires_at)){state='publication_scope_mismatch';break;}
   // Installer owns its existing create/activation reconciliation journal.
   // Always check again after publication and immediately before activation.
   const fresh=await ports.load(claim),check=decide(fresh.authority,fresh,plan.plan_id,{enabled:true,now:ports.now()});
   if(!check.renew||check.authority_revision!==claim.revision||check.authority_hash!==claim.scope_hash||check.target_step!==published.slice.target_step||check.content_hash!==published.slice.plan.content_hash||check.recipient!==published.slice.plan.recipient||published.slice.binding.email!==fresh.sender_binding.email||published.slice.binding.credential_ref!==fresh.sender_binding.credential_ref){state='authority_changed';break;}
   try{const result=await ports.installAndStart(published.slice,claim);if(result?.confirmed!==true){state='installation_unconfirmed';break;}}catch{state='installation_unconfirmed';break;}
   issued++;
  }
 }catch{state='renewal_unconfirmed';}finally{try{if((await ports.finish(claim,{state,issued}))?.finished!==true)state='lease_finish_unconfirmed';}catch{state='lease_finish_unconfirmed';}}
 return{state,issued,decisions};
}
module.exports={tick};
