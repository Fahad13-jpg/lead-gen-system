'use strict';
const crypto=require('node:crypto'),core=require('../sms/core.cjs');
const positive=v=>Number.isSafeInteger(v)&&v>0&&v<=2147483647;
function input(value,keys,read=false){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['org_id',...keys].includes(k)))throw Error('INVALID_FILTER');const p={...value};if(read&&typeof p.org_id==='string'&&/^\d+$/.test(p.org_id))p.org_id=Number(p.org_id);if(!positive(p.org_id))throw Error('INVALID_FILTER');return p;}
function service({identity,pool,transaction,store,provider,vault,callbackBase=null,now=Date.now}){
 if(callbackBase){const u=new URL(callbackBase);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw Error('SMS_CALLBACK_SETUP_REQUIRED');callbackBase=callbackBase.replace(/\/$/,'');}
 async function actor(token,p,admin=false){const a=await identity.principal(token,p.org_id);if(a?.active!==true||a.org_id!==p.org_id)throw Error('MEMBERSHIP_REQUIRED');if(admin&&!['owner','admin'].includes(a.role))throw Error('ROLE_REQUIRED');return a;}
 const callback=s=>callbackBase?callbackBase+'/sms-gate/events/'+s.callback_id:null;
 return{
  async devices(token,value){
   const p=input(value,['username','password']);await actor(token,p,true);
   if(typeof p.username!=='string'||!p.username||p.username.length>150||/[\s:]/.test(p.username)||typeof p.password!=='string'||!p.password||p.password.length>300||/[\p{Cc}\p{Cf}]/u.test(p.password))throw Error('INVALID_FILTER');
   try{return{devices:await provider.devices({username:p.username,password:p.password}),saved:false,messages_sent:0};}catch(e){if(e.message==='SMS_DEVICE_NOT_VERIFIED')throw e;throw Error([401,403].includes(e.status)?'SMS_LOGIN_REJECTED':'SMS_DEVICE_LOOKUP_UNAVAILABLE');}
  },
  async status(token,value){const p=input(value,[],true);await actor(token,p);const s=await store.connection(p.org_id),items=await store.list(p.org_id);return{configured:!!s,callback_setup_available:!!callbackBase,connection:s?{version:s.version,device_id:s.device_id,sender_phone:s.sender_phone,sim_number:s.sim_number,state:s.state,daily_limit:s.daily_limit,daily_segment_limit:s.daily_segment_limit,slot:s.slot,checked_at:s.checked_at,heartbeat_at:s.heartbeat_at,callback_verified_at:s.callback_verified_at,callback_url:callback(s)}:null,items,automatic_followups:false};},
  async connect(token,value){
   const p=input(value,['username','password','device_id','sender_phone','sim_number','signing_key','acknowledge_phone_access']);await actor(token,p,true);
   if(p.acknowledge_phone_access!==true||!/^\+923[0-9]{9}$/.test(p.sender_phone||'')||![1,2].includes(p.sim_number)||typeof p.device_id!=='string'||!/^[A-Za-z0-9_-]{1,120}$/.test(p.device_id)||typeof p.username!=='string'||!p.username||p.username.length>150||/[\s:]/.test(p.username)||typeof p.password!=='string'||!p.password||p.password.length>300||/[\p{Cc}\p{Cf}]/u.test(p.password)||typeof p.signing_key!=='string'||p.signing_key.length<32||p.signing_key.length>256||/[\p{Cc}\p{Cf}]/u.test(p.signing_key))throw Error('INVALID_FILTER');
   if(await store.connection(p.org_id))throw Error('SMS_CONNECTION_EXISTS');
   const secrets={username:p.username,password:p.password,signing_key:p.signing_key};
   // Device verification is a read, before any DB write. Its failure is definitive;
   // database/commit failures below retain the existing uncertain-result behavior.
   try{await provider.device(secrets,p.device_id,p.sim_number);}catch(e){if(e.message==='SMS_DEVICE_NOT_VERIFIED')throw e;throw Error([401,403].includes(e.status)?'SMS_LOGIN_REJECTED':'SMS_DEVICE_LOOKUP_UNAVAILABLE');}
   const slot={timezone:'Asia/Karachi',start_hour:10,end_hour:11,weekdays:[1,2,3,4,5]},cipher=vault.seal(p.org_id,p.device_id,secrets),id=crypto.randomBytes(16).toString('hex');
   await transaction(db=>db.query(`INSERT INTO sms_connections(org_id,device_id,sender_phone,sim_number,secrets,slot,callback_id,checked_at) VALUES($1,$2,$3,$4,$5,$6,$7,now())`,[p.org_id,p.device_id,p.sender_phone,p.sim_number,cipher,slot,id]));
   return{connected:true,paused:true,messages_sent:0};
  },
  async check(token,value){const p=input(value,[]);await actor(token,p,true);const s=await store.connection(p.org_id);if(!s)throw Error('SMS_CONNECTION_NOT_READY');if(!callbackBase)throw Error('SMS_CALLBACK_SETUP_REQUIRED');const secret=vault.open(s.org_id,s.device_id,s.secrets);await provider.device(secret,s.device_id,s.sim_number);await provider.hooks(secret,s.device_id,callback(s));await transaction(db=>db.query('UPDATE sms_connections SET checked_at=now() WHERE org_id=$1 AND version=$2',[p.org_id,s.version]));return{checked:true,messages_sent:0,awaiting_signed_ping:true};},
  async configure(token,value){
   const p=input(value,['expected_version','enabled','daily_limit','daily_segment_limit','slot','acknowledge_limits']);await actor(token,p,true);
   if(!positive(p.expected_version)||typeof p.enabled!=='boolean'||!Number.isInteger(p.daily_limit)||p.daily_limit<1||p.daily_limit>100||!Number.isInteger(p.daily_segment_limit)||p.daily_segment_limit<1||p.daily_segment_limit>200||p.acknowledge_limits!==true||!p.slot||Object.keys(p.slot).some(k=>!['timezone','start_hour','end_hour','weekdays'].includes(k)))throw Error('INVALID_FILTER');core.slot(p.slot,now());
   return transaction(async db=>{const s=(await db.query('SELECT * FROM sms_connections WHERE org_id=$1 FOR UPDATE',[p.org_id])).rows[0];if(!s||s.version!==p.expected_version)throw Error('SMS_CONNECTION_CHANGED');
    if(p.enabled&&(!callbackBase||!s.callback_verified_at||!s.heartbeat_at||now()-Date.parse(s.heartbeat_at)>180000))throw Error('SMS_CALLBACK_NOT_READY');
    await db.query("UPDATE sms_connections SET version=version+1,state=$2,daily_limit=$3,daily_segment_limit=$4,slot=$5,updated_at=now() WHERE org_id=$1",[p.org_id,p.enabled?'ready':'paused',p.daily_limit,p.daily_segment_limit,p.slot]);
    const cancelled=await db.query("UPDATE sms_dispatches SET state='cancelled' WHERE org_id=$1 AND state='queued' RETURNING activity_id",[p.org_id]);for(const d of cancelled.rows)await db.query("UPDATE outreach_activities SET status='cancelled',dispatch_metadata=dispatch_metadata||'{\"state\":\"cancelled\"}' WHERE id=$1 AND org_id=$2",[d.activity_id,p.org_id]);
    return{saved:true,version:s.version+1,queued_releases_cancelled:cancelled.rows.length};
   });
  },
  async release(token,value){
   const p=input(value,['plan_id','content_hash','connection_version','consent_ref','consent_expires_at','acknowledge_real_sms']),a=await actor(token,p,true);
   if(!positive(p.plan_id)||!positive(p.connection_version)||!/^[a-f0-9]{32}$/.test(p.content_hash||'')||typeof p.consent_ref!=='string'||!p.consent_ref.trim()||p.consent_ref.length>500||/[\p{Cc}\p{Cf}]/u.test(p.consent_ref)||!Number.isFinite(Date.parse(p.consent_expires_at))||Date.parse(p.consent_expires_at)<=now()||Date.parse(p.consent_expires_at)>now()+30*86400000||p.acknowledge_real_sms!==true)throw Error('INVALID_FILTER');
   return store.release(p.org_id,a.subject,p);
  },
  async cancel(token,value){const p=input(value,['dispatch_id']);await actor(token,p,true);if(!positive(p.dispatch_id))throw Error('INVALID_FILTER');return store.cancel(p.org_id,p.dispatch_id);}
 };
}
module.exports={service,input};
