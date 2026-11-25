'use strict';
// Firebase-authenticated management with optional trusted signup/check adapters.
// No direct credential/provider access, retention job or message dispatch.
const {publicItems}=require('../whatsapp/inbox-service.cjs');
const quote=v=>"'"+String(v).replace(/'/g,"''")+"'";
const json=v=>quote(JSON.stringify(v))+'::jsonb';
const positive=v=>Number.isSafeInteger(v)&&v>0&&v<=2147483647;
function input(value,fields,read=false){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['org_id',...fields].includes(k)))throw Error('INVALID_FILTER');
 const p={...value};
 for(const k of ['org_id','activity_id','expected_revision','expected_version','campaign_id','limit','before_id'])if(p[k]!==undefined){
  if(read&&typeof p[k]==='string'&&/^[1-9][0-9]{0,9}$/.test(p[k]))p[k]=Number(p[k]);
  if(!positive(p[k]))throw Error('INVALID_FILTER');
 }
 if(!positive(p.org_id))throw Error('INVALID_FILTER');return p;
}
function service({identity,pool,execute,signup,checkSender}){
 const manual=require('./whatsapp-manual.cjs').service({identity,pool});
 async function actor(token,p,admin=false){
  const a=await identity.principal(token,p.org_id);
  if(a?.active!==true||a.org_id!==p.org_id||!/^[a-f0-9]{64}$/.test(a.subject||'')||!['owner','admin','member'].includes(a.role))throw Error('MEMBERSHIP_REQUIRED');
  if(admin&&!['owner','admin'].includes(a.role))throw Error('ROLE_REQUIRED');return a;
 }
 async function call(fn,a,p,write=false){
  const {org_id,...payload}=p;
  const sql=`SELECT ${fn}(${org_id},${quote(a.subject)},${json(payload)}) AS result`;
  const r=(await (write?execute(sql):pool.query(sql))).rows[0]?.result;
  if(!r||typeof r!=='object')throw Error(write?'WHATSAPP_WRITE_UNCONFIRMED':'WHATSAPP_READ_UNAVAILABLE');
  return r;
 }
 return {
  manualContext:manual.context,
  prepareManual:manual.prepare,
  async beginSignup(token,p,origin){if(!signup)throw Error('WHATSAPP_SIGNUP_SETUP_REQUIRED');return signup.begin(token,p,origin);},
  async completeSignup(token,p,origin){if(!signup)throw Error('WHATSAPP_SIGNUP_SETUP_REQUIRED');return signup.complete(token,p,origin);},
  async check(token,p){if(!checkSender)throw Error('WHATSAPP_CHECK_UNAVAILABLE');return checkSender(token,p);},
  async status(token,value){
   const p=input(value,[],true);await actor(token,p);
   const r=(await pool.query("SELECT to_regprocedure('sender_whatsapp_manage(integer,text,jsonb)') IS NOT NULL AND to_regprocedure('sender_whatsapp_bind(integer,text,text,bigint,integer)') IS NOT NULL AND to_regprocedure('outreach_whatsapp_inbox_read(integer,text,jsonb)') IS NOT NULL AND to_regprocedure('outreach_whatsapp_inbox_manage(integer,text,jsonb)') IS NOT NULL AS ready")).rows[0];
   return {available:r?.ready===true,customer_signup_available:signup?.ready()===true,provider_check_available:typeof checkSender==='function',execution_authorized:false};
  },
  async senders(token,value){
   const p=input(value,[],true),a=await actor(token,p);
   const r=await pool.query(`SELECT connection_id,sharing,version,CASE WHEN state='ready' THEN 'identity_checked' ELSE state END AS state,checked_at,channel_metadata->>'phone_number_id' AS phone_number_id,channel_metadata->>'waba_id' AS waba_id,channel_metadata->>'api_version' AS api_version,daily_limit AS daily_messages,mailbox_rolling_limit AS rolling_24h_messages,min_interval_seconds FROM sender_connections WHERE org_id=${p.org_id} AND provider='whatsapp' AND (sharing='team' OR owner_subject=${quote(a.subject)} OR ${quote(a.role)} IN ('owner','admin')) ORDER BY connection_id LIMIT 101`);
   return {senders:r.rows.slice(0,100).map(s=>({...s,sending_verified:false})),truncated:r.rows.length>100,execution_authorized:false};
  },
  async inbox(token,value){
   const p=input(value,['limit','before_id'],true);if(p.limit>100)throw Error('INVALID_FILTER');
   const a=await actor(token,p),r=await call('outreach_whatsapp_inbox_read',a,p);
   if(r.state!=='read_only'||!Array.isArray(r.items))throw Error('WHATSAPP_READ_UNAVAILABLE');
   return {...publicItems(r),execution_authorized:false};
  },
  async review(token,value){
   const p=input(value,['activity_id','expected_revision','action','request_id']);
   if(!positive(p.activity_id)||!positive(p.expected_revision)||p.activity_id>999999999||p.expected_revision>999999999||!['acknowledge','archive','redact'].includes(p.action)||!/^[A-Za-z0-9_-]{8,80}$/.test(p.request_id||''))throw Error('INVALID_FILTER');
   const a=await actor(token,p,true),r=await call('outreach_whatsapp_inbox_manage',a,p,true);
   if(r.saved===false)throw Error('WHATSAPP_ACTION_REJECTED');
   if(r.saved!==true||r.execution_authorized!==false||!(r.idempotent===true||r.revision===p.expected_revision+1&&r.sending_resumed===false))throw Error('WHATSAPP_WRITE_UNCONFIRMED');
   return {saved:true,idempotent:r.idempotent===true,...(r.revision?{revision:r.revision}:{}),sending_resumed:false,execution_authorized:false};
  },
  async manage(token,value){
   const p=input(value,['connection_id','expected_version','action']);
   if(!/^[A-Za-z0-9_-]{1,120}$/.test(p.connection_id||'')||!positive(p.expected_version)||!['pause','disconnect','recheck'].includes(p.action))throw Error('INVALID_FILTER');
   const a=await actor(token,p),r=await call('sender_whatsapp_manage',a,p,true);
   if(r.error)throw Error('WHATSAPP_ACTION_REJECTED');
   const state={pause:'disabled',disconnect:'disconnected',recheck:'pending_check'}[p.action];
   if(r.org_id!==p.org_id||r.connection_id!==p.connection_id||r.version!==p.expected_version+1||r.state!==state||r.execution_authorized!==false)throw Error('WHATSAPP_WRITE_UNCONFIRMED');
   return {org_id:r.org_id,connection_id:r.connection_id,version:r.version,state:r.state,provider_check_performed:false,execution_authorized:false};
  }
 };
}
module.exports={service};
