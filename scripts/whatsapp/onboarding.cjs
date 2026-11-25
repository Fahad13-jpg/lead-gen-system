'use strict';
// Private orchestration; no HTTP route, default provider client or token store.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const id=v=>typeof v==='string'&&/^[0-9]{5,30}$/.test(v);
function memorySessions({now=Date.now,limit=1000}={}){
 const sessions=new Map();
 return {
  async issue(binding){for(const [k,v]of sessions)if(v.expires_at<=now())sessions.delete(k);assert(sessions.size<limit,'SIGNUP_CAPACITY');const nonce=crypto.randomBytes(32).toString('hex');sessions.set(nonce,{...binding,expires_at:now()+300000});return nonce;},
  async consume(nonce,binding){const value=sessions.get(nonce);if(!value||value.expires_at<=now())return null;if(['org_id','subject','origin','configuration_id'].some(k=>value[k]!==binding[k]))return null;sessions.delete(nonce);return value;}
 };
}
function onboarding(deps){
 const config=deps.config,now=deps.now||Date.now;
 function ready(){return config?.enabled===true&&id(config.app_id)&&id(config.configuration_id)&&/^v[0-9]{1,3}\.[0-9]$/.test(config.api_version||'')&&new URL(config.https_origin).protocol==='https:'&&new URL(config.https_origin).origin===config.https_origin&&['principal','exchangeCode','inspectToken','accountPhones','provisionCredential','registerSender','quarantineCredential'].every(k=>typeof deps[k]==='function')&&typeof deps.sessions?.issue==='function'&&typeof deps.sessions?.consume==='function';}
 function status(){let enabled=false;try{enabled=ready();}catch{}return {enabled,reason:enabled?'authenticated_signup_available':'organization_signin_and_connector_required',execution_authorized:false};}
 async function binding(authToken,org,origin){assert(Number.isSafeInteger(org)&&org>0&&origin===config.https_origin,'INVALID_SIGNUP_BINDING');const p=await deps.principal(authToken,org);assert(p?.org_id===org&&p.active===true&&/^[a-f0-9]{64}$/.test(p.subject||''),'MEMBERSHIP_REQUIRED');return {org_id:org,subject:p.subject,origin,configuration_id:config.configuration_id};}
 return {
  status,
  async begin(authToken,{org_id,origin}){assert(status().enabled,'SIGNUP_NOT_CONFIGURED');const b=await binding(authToken,org_id,origin),nonce=await deps.sessions.issue(b);return {state:nonce,app_id:config.app_id,configuration_id:config.configuration_id,api_version:config.api_version,expires_in:300,execution_authorized:false};},
  async complete(authToken,input){
   assert(status().enabled,'SIGNUP_NOT_CONFIGURED');assert(input&&Object.keys(input).every(k=>['org_id','origin','state','code','waba_id','phone_number_id','connection_id','sharing','limits'].includes(k)),'UNSUPPORTED_SIGNUP_FIELD');
   const b=await binding(authToken,input.org_id,input.origin);
   if(input.sharing==='team'){const p=await deps.principal(authToken,input.org_id);assert(['owner','admin'].includes(p.role),'TEAM_SENDER_ADMIN_REQUIRED');}
   assert(/^[A-Za-z0-9_-]{1,120}$/.test(input.connection_id||'')&&['private','team'].includes(input.sharing),'INVALID_SENDER_SELECTION');
   const limits=input.limits;assert(limits&&Object.keys(limits).sort().join(',')==='daily_messages,min_interval_seconds,rolling_24h_messages'&&['daily_messages','rolling_24h_messages'].every(k=>Number.isInteger(limits[k])&&limits[k]>0&&limits[k]<=1000)&&Number.isInteger(limits.min_interval_seconds)&&limits.min_interval_seconds>0&&limits.min_interval_seconds<=99999,'INVALID_SENDER_LIMITS');
   assert(/^[a-f0-9]{64}$/.test(input.state||'')&&typeof input.code==='string'&&input.code.length>0&&input.code.length<=4096&&!/[\p{Cc}\p{Cf}]/u.test(input.code)&&id(input.waba_id)&&id(input.phone_number_id),'INVALID_SIGNUP_RESULT');
   assert(await deps.sessions.consume(input.state,b),'SIGNUP_EXPIRED_OR_CONSUMED');
   // Consume before provider I/O: an ambiguous exchange is never replayed.
   let credentialRef;
   try{
    const exchange=await deps.exchangeCode({code:input.code,app_id:config.app_id,configuration_id:config.configuration_id,origin:b.origin});
    assert(typeof exchange?.access_token==='string'&&exchange.access_token.length>0&&exchange.access_token.length<=8192&&!/\s/.test(exchange.access_token));
    const token=exchange.access_token,proof=await deps.inspectToken({access_token:token});
    assert(proof?.is_valid===true&&proof.app_id===config.app_id&&Array.isArray(proof.scopes)&&['whatsapp_business_management','whatsapp_business_messaging'].every(s=>proof.scopes.includes(s)));
    // A "never" token still requires a server-approved rotation deadline.
    const deadline=Date.parse(config.credential_rotation_deadline);assert(Number.isFinite(deadline)&&deadline>now());
    const expiries=[deadline];for(const field of ['expires_at','data_access_expires_at']){assert(Number.isSafeInteger(proof[field])&&proof[field]>=0);if(proof[field]>0)expiries.push(proof[field]*1000);}const expiry=Math.min(...expiries);assert(expiry>now()+30000);
    const account=await deps.accountPhones({access_token:token,waba_id:input.waba_id});
    assert(Array.isArray(account?.data)&&account.data.length<=100&&account.data.filter(p=>p?.id===input.phone_number_id).length===1);
    const stored=await deps.provisionCredential({org_id:b.org_id,owner_subject:b.subject,connection_id:input.connection_id,phone_number_id:input.phone_number_id,api_version:config.api_version,access_token:token,waba_id:input.waba_id,credential_expires_at:new Date(expiry).toISOString()});
    assert(typeof stored?.credential_ref==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(stored.credential_ref));credentialRef=stored.credential_ref;
    // This port uses the existing sender service and trusted catalog. It never
    // accepts provider approval/capabilities from the browser or enables sending.
    const result=await deps.registerSender(authToken,{org_id:b.org_id,provider:'whatsapp',connection_id:input.connection_id,credential_ref:credentialRef,sharing:input.sharing,limits:input.limits,whatsapp:{waba_id:input.waba_id,phone_number_id:input.phone_number_id,api_version:config.api_version}});
    assert(result?.state==='pending_check'&&result.org_id===b.org_id&&result.connection_id===input.connection_id);
    return {state:'pending_check',org_id:b.org_id,connection_id:result.connection_id,execution_authorized:false};
   }catch{if(credentialRef){try{await deps.quarantineCredential({org_id:b.org_id,credential_ref:credentialRef,reason:'registration_unconfirmed'});}catch{}}return {state:'setup_unconfirmed',restart_required:true,execution_authorized:false};}
  }
 };
}
module.exports={memorySessions,onboarding};
