'use strict';
const assert=require('node:assert/strict');
const key=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(v);
function catalogCredential(catalog,org,ref,waba,now=Date.now()){
 assert(Array.isArray(catalog),'TRUSTED_CATALOG_REQUIRED');const matches=catalog.filter(c=>c.id===ref&&c.org_id===org&&c.type==='whatsAppApi'&&c.active===true&&c.waba_id===waba);
 assert(matches.length===1,'CREDENTIAL_OWNERSHIP_REQUIRED');const c=matches[0];assert(typeof c.credential_expires_at==='string'&&Number.isFinite(Date.parse(c.credential_expires_at))&&Date.parse(c.credential_expires_at)>now,'CREDENTIAL_EXPIRY_REQUIRED');return c;
}
function create(input,principal,catalog,now=Date.now()){
 assert(input&&typeof input==='object'&&!Array.isArray(input)&&Object.keys(input).every(k=>['org_id','connection_id','provider','credential_ref','sharing','limits','whatsapp'].includes(k)),'UNSUPPORTED_CONNECTION_FIELD');
 assert(Number.isSafeInteger(input.org_id)&&input.org_id>0&&principal?.org_id===input.org_id&&principal.active===true&&/^[a-f0-9]{64}$/.test(principal.subject||'')&&['owner','admin','member'].includes(principal.role),'MEMBERSHIP_REQUIRED');
 assert(input.provider==='whatsapp'&&key(input.connection_id)&&key(input.credential_ref),'INVALID_CONNECTION');assert(['private','team'].includes(input.sharing),'INVALID_SHARING');
 if(input.sharing==='team')assert(['owner','admin'].includes(principal.role),'TEAM_SENDER_ADMIN_REQUIRED');
 const w=input.whatsapp;assert(w&&typeof w==='object'&&!Array.isArray(w)&&Object.keys(w).sort().join(',')==='api_version,phone_number_id,waba_id'&&/^\d{5,30}$/.test(w.waba_id||'')&&/^\d{5,30}$/.test(w.phone_number_id||'')&&typeof w.waba_id==='string'&&typeof w.phone_number_id==='string'&&/^v\d{1,3}\.\d$/.test(w.api_version||''),'INVALID_WHATSAPP_METADATA');
 const limits=input.limits;assert(limits&&Object.keys(limits).sort().join(',')==='daily_messages,min_interval_seconds,rolling_24h_messages','INVALID_LIMITS');
 for(const k of ['daily_messages','rolling_24h_messages'])assert(Number.isSafeInteger(limits[k])&&limits[k]>0&&limits[k]<=1000,'INVALID_LIMITS');assert(Number.isSafeInteger(limits.min_interval_seconds)&&limits.min_interval_seconds>0&&limits.min_interval_seconds<=99999,'INVALID_LIMITS');
 const credential=catalogCredential(catalog,input.org_id,input.credential_ref,w.waba_id,now);
 return {...input,action:'create',whatsapp:{...w,credential_expires_at:credential.credential_expires_at,identity_verified:false}};
}
module.exports={create,catalogCredential};
