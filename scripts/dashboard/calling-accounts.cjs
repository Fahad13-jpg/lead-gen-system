'use strict';
const crypto=require('node:crypto');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function input(value,write=false){
 const keys=write?['request_id','api_key','agent_id','agent_version','from_number','acknowledge_provider_billing']:[];
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['org_id',...keys].includes(k)))throw Error('INVALID_FILTER');
 const p={...value};if(!write&&typeof p.org_id==='string'&&/^\d+$/.test(p.org_id))p.org_id=Number(p.org_id);
 if(!Number.isSafeInteger(p.org_id)||p.org_id<1||p.org_id>2147483647)throw Error('INVALID_FILTER');
 if(write&&(!uuid.test(p.request_id||'')||typeof p.api_key!=='string'||!/^\S{16,300}$/.test(p.api_key)||/[\p{Cc}\p{Cf}]/u.test(p.api_key)||!/^[A-Za-z0-9_-]{1,100}$/.test(p.agent_id||'')||!Number.isInteger(p.agent_version)||p.agent_version<0||p.agent_version>2147483647||p.from_number!=null&&p.from_number!==''&&!/^\+1[0-9]{10}$/.test(p.from_number)||p.acknowledge_provider_billing!==true))throw Error('INVALID_FILTER');
 return p;
}
function project(row){return row?{agent_id:row.agent_id,agent_version:row.agent_version,from_number:row.from_number,version:row.version,state:row.state,checked_at:row.checked_at}:null;}
function service({identity,pool,transaction,provider,vault}){
 async function actor(token,org,admin=false){const a=await identity.principal(token,org);if(a?.active!==true||a.org_id!==org)throw Error('MEMBERSHIP_REQUIRED');if(admin&&!['owner','admin'].includes(a.role))throw Error('ROLE_REQUIRED');}
 const read=async org=>(await pool.query('SELECT agent_id,agent_version,from_number,version,state,checked_at FROM calling_accounts WHERE org_id=$1',[org])).rows[0];
 return{
  async status(token,value){const p=input(value);await actor(token,p.org_id);return{mode:'byok',connection:project(await read(p.org_id)),managed:{available:false,reason:'Prepaid billing and managed calling setup are not ready.'},execution_authorized:false};},
  async connect(token,value){
   const p=input(value,true);await actor(token,p.org_id,true);
   const fingerprint=crypto.createHash('sha256').update(p.api_key).digest('hex');
   const same=r=>r.request_id===p.request_id&&r.key_fingerprint===fingerprint&&r.agent_id===p.agent_id&&r.agent_version===p.agent_version&&r.from_number===(p.from_number||null);
   const existing=(await pool.query('SELECT * FROM calling_accounts WHERE org_id=$1',[p.org_id])).rows[0];
   if(existing){if(same(existing))return{connected:true,paused:true,replayed:true,execution_authorized:false};throw Error('CALLING_ACCOUNT_EXISTS');}
   await provider.verify(p);
   // Recheck authorization after remote reads, then lock and bind the encrypted credential.
   await actor(token,p.org_id,true);
   try{return await transaction(async db=>{
    await db.query('SELECT pg_advisory_xact_lock(727412,$1)',[p.org_id]);
    const old=(await db.query('SELECT * FROM calling_accounts WHERE org_id=$1 FOR UPDATE',[p.org_id])).rows[0];
    if(old){if(same(old))return{connected:true,paused:true,replayed:true,execution_authorized:false};throw Error('CALLING_ACCOUNT_EXISTS');}
    await db.query('INSERT INTO calling_accounts(org_id,request_id,key_fingerprint,agent_id,agent_version,from_number,secrets) VALUES($1,$2,$3,$4,$5,$6,$7)',[p.org_id,p.request_id,fingerprint,p.agent_id,p.agent_version,p.from_number||null,vault.seal(p.org_id,{api_key:p.api_key})]);
    return{connected:true,paused:true,execution_authorized:false};
   });}catch(e){if(e.code==='23505')throw Error('CALLING_ACCOUNT_ALREADY_LINKED');throw e;}
  }
 };
}
module.exports={service,input,project};
