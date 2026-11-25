'use strict';
const{onboarding}=require('../sender-connections/gmail-onboarding.cjs');
const{gmailRecovery}=require('./status-summary.cjs');
function gmailService(deps){
 if(deps.oauthStore)return require('./gmail-durable-service.cjs').durableService(deps);
 const core=onboarding(deps),returns=new Map(),starts=new Set(),now=deps.now||Date.now;let active=0,epoch=0;
 function clean(){for(const[k,v]of returns)if(v.expires<=now())returns.delete(k);}
 return{origin:deps.config.origin,
  async status(token,p){if(Object.keys(p).some(k=>k!=='org_id'))throw Error('INVALID_FILTER');await deps.principal(token,Number(p.org_id));return{available:core.ready()};},
  async beginGmail(token,p){clean();if(returns.size>=100)throw Error('GMAIL_SIGNUP_BUSY');const result=await core.begin(token,p);const state=new URL(result.authorization_url).searchParams.get('state');const owner=await deps.principal(token,p.org_id);returns.set(state,{expires:now()+300000,org_id:owner.org_id,subject:owner.subject});return result;},
  async beginReconnectGmail(token,p){
   clean();const owner=await deps.principal(token,p?.org_id),key=`${owner.org_id}:${p?.connection_id}`;
   if(returns.size>=100||starts.has(key)||[...returns.values()].some(r=>r.org_id===owner.org_id&&r.reconnect?.connection_id===p?.connection_id&&!r.receipt))throw Error('GMAIL_SIGNUP_BUSY');
   starts.add(key);try{const result=await core.beginReconnect(token,p),state=new URL(result.authorization_url).searchParams.get('state');returns.set(state,{expires:now()+300000,org_id:owner.org_id,subject:owner.subject,reconnect:{connection_id:p.connection_id,expected_version:p.expected_version}});return result;}finally{starts.delete(key);}
  },
  capture(params){clean();const state=params.get('state'),r=returns.get(state);if(!r||r.received)return false;const code=params.get('code');r.received=true;if(params.has('error')){r.denied=true;return true;}if(typeof code!=='string'||!code||code.length>8192||/[\x00-\x20]/.test(code))return false;r.code=code;return true;},
  async reconcileGmail(token,p){
   if(!p||Object.keys(p).some(k=>!['org_id','state','connection_id'].includes(k))||!Number.isSafeInteger(p.org_id)||!/^[A-Za-z0-9_-]{43}$/.test(p.state||'')||p.connection_id!==undefined&&!/^gmail_[a-f0-9]{32}$/.test(p.connection_id))throw Error('INVALID_FILTER');
   const owner=await deps.principal(token,p.org_id),existing=returns.get(p.state);if(existing&&(existing.org_id!==owner.org_id||existing.subject!==owner.subject))throw Error('MEMBERSHIP_REQUIRED');const version=epoch;
   if(p.connection_id!==undefined){
    if(existing&&existing.reconnect?.connection_id!==p.connection_id)throw Error('INVALID_FILTER');
    if(active)return{safe_to_restart:false,recovery:gmailRecovery('in_progress')};
    if(typeof deps.reconnectStatus!=='function')return{safe_to_restart:false,recovery:gmailRecovery('unavailable')};
    const current=await deps.reconnectStatus(token,{org_id:p.org_id,connection_id:p.connection_id});
    if(active||epoch!==version)return{safe_to_restart:false,recovery:gmailRecovery('in_progress')};
    if(existing?.receipt)return{confirmed:true,...existing.receipt,safe_to_restart:false,recovery:gmailRecovery('confirmed')};
    // Reconnect updates one existing row atomically; unlike new enrollment it
    // creates no orphan credential. Retire the old callback before permitting
    // explicit fresh consent. Never claim the earlier outcome was successful.
    returns.delete(p.state);return{safe_to_restart:true,outcome_confirmed:false,connection_id:current.connection_id,version:current.version,state:current.state,recovery:gmailRecovery('restart_available')};
   }
   if(active)return{safe_to_restart:false,recovery:gmailRecovery('in_progress')};
   if(typeof deps.canRestartGmail!=='function')return{safe_to_restart:false,recovery:gmailRecovery('unavailable')};
   const empty=await deps.canRestartGmail();
   if(active||epoch!==version)return{safe_to_restart:false,recovery:gmailRecovery('in_progress')};
   if(!empty)return{safe_to_restart:false,recovery:gmailRecovery('needs_review')};
   returns.delete(p.state);return{safe_to_restart:true,recovery:gmailRecovery('restart_available')};
  },
  async finishGmail(token,p){
   if(!p||Object.keys(p).some(k=>!['org_id','state'].includes(k))||typeof p.state!=='string')throw Error('INVALID_FILTER');const owner=await deps.principal(token,p.org_id);
   clean();const r=returns.get(p.state);if(!r||!r.received)throw Error('GMAIL_CALLBACK_NOT_READY');
   if(r.org_id!==owner.org_id||r.subject!==owner.subject)throw Error('MEMBERSHIP_REQUIRED');if(r.denied){returns.delete(p.state);throw Error('GMAIL_CONSENT_DENIED');}
   if(r.reconnect&&r.receipt)return r.receipt;if(r.reconnect&&r.attempted)throw Error('GMAIL_STATE_EXPIRED');if(r.reconnect)r.attempted=true;
   active++;epoch++;
   try{const result=await core.finish(token,{...p,code:r.code});if(r.reconnect){r.receipt=result;delete r.code;r.expires=now()+300000;}else returns.delete(p.state);return result;}
   catch(error){if(r.reconnect&&['GMAIL_RECONNECT_FORBIDDEN','GMAIL_RECONNECT_VERSION_CONFLICT','GMAIL_RECONNECT_ACCOUNT_MISMATCH','GMAIL_RECONNECT_IDENTITY_REVIEW_REQUIRED'].includes(error.message))returns.delete(p.state);throw error;}
   finally{if(r.reconnect)delete r.code;active--;epoch++;}
  }
 };
}
module.exports={gmailService};
