'use strict';
const crypto=require('node:crypto');
const hash=key=>crypto.createHash('sha256').update(key.trim()).digest('hex');
function recovery({secret,read,now=Date.now}){
 if(!Buffer.isBuffer(secret)||secret.length<32||typeof read!=='function')throw Error('APIFY_RECOVERY_UNAVAILABLE');
 const sign=payload=>crypto.createHmac('sha256',secret).update('apify-recovery-v1\0').update(payload).digest('base64url');
 function verify(token,org,subject){
  if(typeof token!=='string'||token.length>2048)throw Error('APIFY_RECOVERY_INVALID');
  const parts=token.split('.');if(parts.length!==2)throw Error('APIFY_RECOVERY_INVALID');
  const expected=Buffer.from(sign(parts[0])),actual=Buffer.from(parts[1]);
  if(expected.length!==actual.length||!crypto.timingSafeEqual(expected,actual))throw Error('APIFY_RECOVERY_INVALID');
  let p;try{p=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));}catch{throw Error('APIFY_RECOVERY_INVALID');}
  if(p?.version!==1||p.org_id!==org||p.subject!==subject||!/^[a-f0-9]{64}$/.test(p.key_hash||'')||!/^[a-f0-9]{32}$/.test(p.nonce||'')||!Number.isSafeInteger(p.issued_at)||!Number.isSafeInteger(p.expires_at)||p.issued_at>now()||p.expires_at-p.issued_at!==86400000)throw Error('APIFY_RECOVERY_INVALID');
  if(p.expires_at<=now())throw Error('APIFY_RECOVERY_EXPIRED');
  return p;
 }
 return{
  prepare(org,subject,key){
   if(!Number.isSafeInteger(org)||org<1||typeof subject!=='string'||!subject||subject.length>128||typeof key!=='string'||key.length>300||!/^apify_api_[A-Za-z0-9]+$/.test(key.trim()))throw Error('INVALID_FILTER');
   const issued_at=now(),p={version:1,org_id:org,subject,key_hash:hash(key),nonce:crypto.randomBytes(16).toString('hex'),issued_at,expires_at:issued_at+86400000};
   const payload=Buffer.from(JSON.stringify(p)).toString('base64url');
   return{recovery_token:payload+'.'+sign(payload),expires_at:new Date(p.expires_at).toISOString(),provider_requests:0};
  },
  verifyKey(token,org,subject,key){if(verify(token,org,subject).key_hash!==hash(key))throw Error('APIFY_RECOVERY_INVALID');},
  async reconcile(token,org,subject){
   const p=verify(token,org,subject),current=await read(org,p.key_hash);
   if(!current||typeof current.found!=='boolean'||typeof current.matches!=='boolean')throw Error('APIFY_RECOVERY_UNAVAILABLE');
   const matched=current.found&&current.matches;
   return{state:matched?'configuration_saved':'unconfirmed',configuration_matches:matched,enabled:matched?current.enabled===true:null,
    provider_verification_confirmed:false,automatic_retry_allowed:false,execution_authorized:false,
    next_action:matched?'refresh_saved_configuration':'review_connection',observed_at:new Date(now()).toISOString()};
  }
 };
}
function loader(pool){return async(org,fingerprint)=>{
 const r=(await pool.query("SELECT enabled,encode(sha256(convert_to(api_key,'UTF8')),'hex')=$2 AS matches FROM gathering_accounts WHERE mode='byok' AND org_id=$1",[org,fingerprint])).rows[0];
 return{found:!!r,matches:r?.matches===true,enabled:r?.enabled===true};
};}
module.exports={recovery,loader};
