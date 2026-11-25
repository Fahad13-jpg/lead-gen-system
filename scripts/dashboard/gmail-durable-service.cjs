'use strict';
const{onboarding}=require('../sender-connections/gmail-onboarding.cjs');
const{gmailRecovery}=require('./status-summary.cjs');
function durableService(deps){
 const store=deps.oauthStore,core=onboarding({...deps,sessions:store});
 function validate(p,keys){if(!p||Object.keys(p).some(k=>!keys.includes(k))||!Number.isSafeInteger(p.org_id)||p.org_id<1||!/^[A-Za-z0-9_-]{43}$/.test(p.state||''))throw Error('INVALID_FILTER');}
 return{origin:deps.config.origin,
 async status(token,p){if(Object.keys(p).some(k=>k!=='org_id'))throw Error('INVALID_FILTER');await deps.principal(token,Number(p.org_id));return{available:core.ready()};},
 beginGmail:(token,p)=>core.begin(token,p),beginReconnectGmail:(token,p)=>core.beginReconnect(token,p),capture:params=>store.capture(params),
 async finishGmail(token,p){validate(p,['org_id','state']);const owner=await deps.principal(token,p.org_id),r=await store.get(p.state,owner);
  if(r?.phase==='completed'&&r.receipt)return r.receipt;
  if(r?.phase==='denied')throw Error('GMAIL_CONSENT_DENIED');
  if(!r||!r.fresh||r.phase!=='callback')throw Error(r?.phase==='claimed'?'GMAIL_CONNECTION_UNCONFIRMED':'GMAIL_CALLBACK_NOT_READY');
  try{const result=await core.finish(token,{...p,code:r.code});await store.complete(p.state,owner,result);return result;}
  catch(error){if(['GMAIL_RECONNECT_FORBIDDEN','GMAIL_RECONNECT_VERSION_CONFLICT','GMAIL_RECONNECT_ACCOUNT_MISMATCH','GMAIL_RECONNECT_IDENTITY_REVIEW_REQUIRED'].includes(error.message))await store.retire(p.state,owner,{definitive:true});throw error;}
 },
 async reconcileGmail(token,p){validate(p,['org_id','state','connection_id']);if(p.connection_id!==undefined&&!/^gmail_[a-f0-9]{32}$/.test(p.connection_id))throw Error('INVALID_FILTER');const owner=await deps.principal(token,p.org_id),r=await store.get(p.state,owner);
  if(r&&p.connection_id!==undefined&&r.reconnect_id!==p.connection_id)throw Error('INVALID_FILTER');
  if(r?.phase==='completed'&&r.receipt)return{confirmed:true,...r.receipt,safe_to_restart:false,recovery:gmailRecovery('confirmed')};
  // Claim survives process death. Neither TTL nor a retry can unlock an exchange.
  if(r?.phase==='claimed'){const receipt=await store.reconcile(p.state,owner);return receipt?{confirmed:true,...receipt,safe_to_restart:false,recovery:gmailRecovery('confirmed')}:{safe_to_restart:false,recovery:gmailRecovery('needs_review')};}
  if(!r){return{safe_to_restart:false,recovery:gmailRecovery('unavailable')};}
  const retired=await store.retire(p.state,owner);
  if(retired.receipt)return{confirmed:true,...retired.receipt,safe_to_restart:false,recovery:gmailRecovery('confirmed')};
  return{safe_to_restart:retired.retired===true,outcome_confirmed:false,recovery:gmailRecovery(retired.retired?'restart_available':'needs_review')};
 }
 };
}
module.exports={durableService};
