'use strict';
function worker({store,provider,vault,now=Date.now,onError=()=>{}}){
 let running=false;
 async function tick(){
  if(running)return{busy:true};running=true;let sends=0;
  try{
   for(const d of await store.reconcile()){
    try{const secrets=vault.open(d.org_id,d.device_id,d.secrets),r=await provider.status(secrets,d.client_id);
     if(r?.id!==d.client_id||!Array.isArray(r.recipients)||r.recipients.length!==1||'+'+String(r.recipients[0].phoneNumber).replace(/^\+/,'')!==d.recipient)continue;
     const state=r.recipients[0].state;
     if(state==='Delivered')await store.outcome(d.id,'delivered',state);
     else if(state==='Sent')await store.outcome(d.id,'sent',state);
     else if(['Failed','Cancelled'].includes(state))await store.outcome(d.id,'failed',state);
    }catch{onError('SMS_STATUS_UNCONFIRMED');}
   }
   for(const candidate of await store.candidate()){
    let secrets;try{
     secrets=vault.open(candidate.org_id,candidate.device_id,candidate.secrets);const device=await provider.device(secrets,candidate.device_id,candidate.sim_number);
     const age=now()-Date.parse(device.last_seen);if(!Number.isFinite(age)||age<0||age>180000)continue;
    }catch{continue;}
    const d=await store.admit(candidate.id);if(!d)continue;
    // A durable submitting marker exists before this one provider attempt.
    // Exceptions, timeouts and ambiguous responses are never blindly retried.
    try{const r=await provider.send(secrets,{id:d.client_id,deviceId:d.device_id,simNumber:d.sim_number,recipient:d.recipient,message:d.message,validUntil:d.valid_until});
     if(r?.id!==d.client_id)throw Error('SMS_SUBMISSION_UNCONFIRMED');await store.outcome(d.id,'accepted','Pending');sends++;
    }catch{await store.outcome(d.id,'uncertain');onError('SMS_SUBMISSION_UNCONFIRMED');}
    break;
   }
   return{provider_submissions:sends};
  }finally{running=false;}
 }
 return{tick};
}
module.exports={worker};
