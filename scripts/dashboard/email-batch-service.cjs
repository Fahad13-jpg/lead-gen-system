'use strict';
const controller=require('../sender-connections/email-batch-release.cjs');
function service({identity,store,startEnabled=()=>false,now=Date.now}){
 async function actor(token,org){if(!Number.isSafeInteger(org)||org<1||org>2147483647)throw Error('INVALID_FILTER');const p=await identity.principal(token,org);if(p.org_id!==org||!['owner','admin'].includes(p.role)||!/^[a-f0-9]{64}$/.test(p.subject||''))throw Error('ROLE_REQUIRED');return p;}
 async function load(p,batch,digest){const entry=await store.load(batch);if(!entry||entry.grant.org_id!==p.org_id||entry.grant.subject!==p.subject)throw Error('EMAIL_BATCH_NOT_AVAILABLE');if(entry.grant.digest!==digest||entry.bundle.digest!==digest)throw Error('EMAIL_BATCH_CHANGED');return entry;}
 function publicBatch(entry,state){const b=entry.bundle;return{...state,target_step:b.packet.kind==='email_followup_batch_review_v1'?2:1,digest:b.digest,campaign_id:String(b.packet.campaign_id),campaign_version:b.packet.campaign_version,sender_connection_id:b.packet.sender_connection_id,expires_at:b.release.expires_at,expired:Date.parse(b.release.expires_at)<=now(),plans:b.release.plans.map(p=>({plan_id:p.plan_id,recipient:p.recipient,content_hash:p.content_hash,max_step:p.max_step})),start_enabled:startEnabled()===true,execution_authorized:false,observed_at:new Date(now()).toISOString()};}
 return{
 async listEmailBatches(token,p){
  if(!p||Object.keys(p).some(k=>!['org_id','campaign_id'].includes(k))||!/^[1-9][0-9]*$/.test(String(p.campaign_id))||!Number.isSafeInteger(Number(p.campaign_id)))throw Error('INVALID_FILTER');
  const principal=await actor(token,Number(p.org_id)),entries=await store.list(principal.org_id,principal.subject,Number(p.campaign_id)),batches=[];
  for(const item of entries){const entry=await load(principal,item.batch_id,item.digest),ports=await store.ports(entry,()=>actor(token,principal.org_id));const state=await controller.status(entry.bundle,ports);batches.push(publicBatch(entry,state));}
  return{batches,start_enabled:startEnabled()===true,execution_authorized:false,observed_at:new Date(now()).toISOString()};
 },
 async controlEmailBatch(token,p){
  if(!p||Object.keys(p).some(k=>!['org_id','batch_id','digest','action','acknowledge_exact_batch'].includes(k))||!/^[a-f0-9]{20}$/.test(p.batch_id||'')||!/^[a-f0-9]{64}$/.test(p.digest||'')||!['start','pause'].includes(p.action)||p.acknowledge_exact_batch!==true)throw Error('INVALID_FILTER');
  const principal=await actor(token,p.org_id),entry=await load(principal,p.batch_id,p.digest);
  if(p.action==='start'&&startEnabled()!==true)throw Error('EMAIL_BATCH_START_DISABLED');
  if(p.action==='start'&&Date.parse(entry.bundle.release.expires_at)<=now())throw Error('EMAIL_BATCH_EXPIRED');
  // Shared filesystem lock also fences the operator CLI. Unknown outcomes remain
  // in the existing controller journal; requests are never automatically replayed.
  return store.lock(entry,async()=>{
   const authorize=async()=>{const current=await actor(token,principal.org_id);if(current.subject!==principal.subject)throw Error('ROLE_REQUIRED');await load(current,p.batch_id,p.digest);};
   const ports=await store.ports(entry,authorize);
   try{await controller[p.action](entry.bundle,ports,now());const state=await controller.status(entry.bundle,ports);return publicBatch(entry,state);}
   catch{throw Error('EMAIL_BATCH_CONTROL_UNCONFIRMED');}
  });
 }
 };
}
module.exports={service};
