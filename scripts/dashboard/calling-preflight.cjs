'use strict';
const{assess,prompt,hash}=require('../calling/account-preflight.cjs');
const object=v=>v&&typeof v==='object'&&!Array.isArray(v),id=v=>Number.isSafeInteger(v)&&v>0&&v<=2147483647;
function input(value,write=false){if(!object(value)||Object.keys(value).some(k=>!['org_id',...(write?['expected_account_version']:[])].includes(k)))throw Error('INVALID_FILTER');const p={...value};if(!write&&typeof p.org_id==='string'&&/^\d+$/.test(p.org_id))p.org_id=Number(p.org_id);if(!id(p.org_id)||write&&!id(p.expected_account_version))throw Error('INVALID_FILTER');return p;}
function service({identity,pool,transaction,provider,vault,now=Date.now}){
 async function actor(token,org){const a=await identity.principal(token,org);if(a?.active!==true||a.org_id!==org)throw Error('MEMBERSHIP_REQUIRED');if(!['owner','admin'].includes(a.role)||!/^[a-f0-9]{64}$/.test(a.subject||''))throw Error('ROLE_REQUIRED');return a;}
 const get=async org=>(await pool.query('SELECT * FROM calling_accounts WHERE org_id=$1',[org])).rows[0];
 return{
  async status(token,value){const p=input(value);await actor(token,p.org_id);const a=await get(p.org_id);if(!a)return{configured:false,latest:null,execution_authorized:false};const r=(await pool.query('SELECT checked_at,checks,provider_checks_passed,template_hash FROM calling_account_preflights WHERE org_id=$1 AND account_version=$2',[p.org_id,a.version])).rows[0];return{configured:true,account_version:a.version,latest:r?{checked_at:r.checked_at,checks:r.checks,provider_checks_passed:r.provider_checks_passed,current:a.state==='pending_setup'&&r.template_hash===hash(prompt())&&now()-Date.parse(r.checked_at)>=0&&now()-Date.parse(r.checked_at)<900000}:null,execution_authorized:false};},
  async check(token,value){const p=input(value,true),actorInfo=await actor(token,p.org_id),a=await get(p.org_id);if(!a||a.state!=='pending_setup')throw Error('CALLING_ACCOUNT_NOT_CONNECTED');if(a.version!==p.expected_account_version)throw Error('CALLING_ACCOUNT_CHANGED');let result;
   try{result=assess(a,await provider.inspect({...vault.open(a.org_id,a.secrets),agent_id:a.agent_id,agent_version:a.agent_version,from_number:a.from_number}));}
   catch{result={checks:{provider_lookup:false},provider_checks_passed:false,template_hash:hash(prompt()),snapshot_hash:null,execution_authorized:false};}
   await transaction(async db=>{
    await db.query('SELECT pg_advisory_xact_lock(727412,$1)',[p.org_id]);
    if(!(await db.query("SELECT 1 FROM org_sender_memberships m JOIN organizations o ON o.id=m.org_id AND o.status='active' WHERE m.org_id=$1 AND m.subject=$2 AND m.active AND m.role IN('owner','admin') FOR SHARE OF m,o",[p.org_id,actorInfo.subject])).rows[0])throw Error('MEMBERSHIP_REQUIRED');
    const current=(await db.query('SELECT version,state FROM calling_accounts WHERE org_id=$1 FOR UPDATE',[p.org_id])).rows[0];if(current?.version!==a.version||current.state!=='pending_setup')throw Error('CALLING_ACCOUNT_CHANGED');
    await db.query('INSERT INTO calling_account_preflights(org_id,account_version,checks,provider_checks_passed,template_hash,snapshot_hash) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(org_id,account_version) DO UPDATE SET checked_at=now(),checks=excluded.checks,provider_checks_passed=excluded.provider_checks_passed,template_hash=excluded.template_hash,snapshot_hash=excluded.snapshot_hash',[p.org_id,a.version,result.checks,result.provider_checks_passed,result.template_hash,result.snapshot_hash]);
   });return{checked:true,account_version:a.version,checks:result.checks,provider_checks_passed:result.provider_checks_passed,execution_authorized:false};
  }
 };
}
module.exports={service,input};
