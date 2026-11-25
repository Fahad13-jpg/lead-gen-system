'use strict';
const crypto=require('node:crypto');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const positive=v=>Number.isSafeInteger(v)&&v>0&&v<=2147483647;
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
function input(value,action){
 const fields={read:['campaign_id'],receipt:['request_id'],bind:['request_id','campaign_id','expected_campaign_version','expected_account_version','acknowledge_pause_and_review'],change:['request_id','action','expected_account_version','api_key','agent_id','agent_version','from_number','acknowledge_pause_and_review']}[action];
 if(!object(value)||Object.keys(value).some(k=>!['org_id',...fields].includes(k)))throw Error('INVALID_FILTER');
 const p={...value};if(['read','receipt'].includes(action)){for(const k of ['org_id','campaign_id'])if(typeof p[k]==='string'&&/^\d+$/.test(p[k]))p[k]=Number(p[k]);}
 if(!positive(p.org_id)||['read','bind'].includes(action)&&!positive(p.campaign_id))throw Error('INVALID_FILTER');
 if(['receipt','bind','change'].includes(action)&&!uuid.test(p.request_id||''))throw Error('INVALID_FILTER');
 if(['bind','change'].includes(action)&&(!positive(p.expected_account_version)||p.acknowledge_pause_and_review!==true))throw Error('INVALID_FILTER');
 if(action==='bind'&&!positive(p.expected_campaign_version))throw Error('INVALID_FILTER');
 if(action==='change'){
  if(!['update','disconnect'].includes(p.action))throw Error('INVALID_FILTER');
  if(p.action==='disconnect'){if(['api_key','agent_id','agent_version','from_number'].some(k=>p[k]!==undefined))throw Error('INVALID_FILTER');}
  else if(!/^[A-Za-z0-9_-]{1,100}$/.test(p.agent_id||'')||!Number.isInteger(p.agent_version)||p.agent_version<0||p.agent_version>2147483647||p.from_number!==null&&!/^\+1[0-9]{10}$/.test(p.from_number||'')||p.api_key!==undefined&&(typeof p.api_key!=='string'||!/^\S{16,300}$/.test(p.api_key)||/[\p{Cc}\p{Cf}]/u.test(p.api_key)))throw Error('INVALID_FILTER');
 }
 return p;
}
const connectionRef=a=>`byok-retell-${a.org_id}-v${a.version}`;
function paused(config,account,calendar=null){
 const old=object(config.call_dispatch)?config.call_dispatch:{};
 const next={...old,enabled:false,campaign_state:'paused',funding:'byok',language:'en',release:{enabled:false},quote:{verified:false},recipient_permissions:old.recipient_permissions||{},calendar:calendar||{ready:false}};
 if(account?.state==='pending_setup'){
  next.resource_account={org_id:account.org_id,version:account.version};next.connection_ref=connectionRef(account);
  next.connection={credential_ref:next.connection_ref,agent_id:account.agent_id,agent_version:account.agent_version,from_number:account.from_number,country:'US',ready:false,route_verified:false,caller_id_authorized:false,voice_tested:false};
 }else{delete next.connection;delete next.connection_ref;delete next.resource_account;}
 return{...config,call_dispatch:next};
}
async function verifiedCalendar(config,a,listCalendars,now){
 const c=config?.call_dispatch?.calendar;if(c?.ready!==true||typeof c.id!=='string'||!c.id||!Array.isArray(c.slots)||!c.slots.length)return null;
 try{const normalized=require('./calling-calendar.cjs').slots(c.slots.map(s=>({start:s.start,end:s.end})),c.id,now),catalog=await listCalendars(a.org_id),scope=catalog?.account_scope;
  if(catalog?.connected!==true||catalog.org_id!==a.org_id||scope?.version!==a.version||scope.agent_id!==a.agent_id||scope.agent_version!==a.agent_version||scope.connection_ref!==connectionRef(a)||!catalog.calendars?.some(c=>c.id===config.call_dispatch.calendar.id&&['owner','writer'].includes(c.accessRole)))return null;
  return{id:c.id,ready:true,slots:normalized};
 }catch{return null;}
}
function service({identity,pool,transaction,provider,vault,listCalendars=async()=>null,now=Date.now}){
 async function actor(token,org){const a=await identity.principal(token,org);if(a?.active!==true||a.org_id!==org)throw Error('MEMBERSHIP_REQUIRED');if(!['owner','admin'].includes(a.role)||!/^[a-f0-9]{64}$/.test(a.subject||''))throw Error('ROLE_REQUIRED');return a;}
 const account=async(db,org,lock=false)=>(await db.query('SELECT * FROM calling_accounts WHERE org_id=$1'+(lock?' FOR UPDATE':''),[org])).rows[0];
 const campaign=async(db,org,id,lock=true)=>(await db.query('SELECT c.id,c.version,v.config FROM strategy_campaigns c JOIN strategy_campaign_versions v ON v.org_id=c.org_id AND v.campaign_id=c.id AND v.version=c.version WHERE c.org_id=$1 AND c.id=$2'+(lock?' FOR UPDATE OF c':''),[org,id])).rows[0];
 const hash=p=>digest(JSON.stringify(Object.keys(p).sort().map(k=>[k,k==='api_key'?digest(p[k]):p[k]])));
 async function replay(db,p,h){const r=(await db.query('SELECT payload_hash,result FROM calling_account_changes WHERE org_id=$1 AND request_id=$2',[p.org_id,p.request_id])).rows[0];if(r&&r.payload_hash!==h)throw Error('CALLING_REQUEST_CONFLICT');return r?.result;}
 async function guard(db,a){
  await db.query('SELECT pg_advisory_xact_lock(727411,1)');
  await db.query('SELECT pg_advisory_xact_lock(727412,$1)',[a.org_id]);
  if(!(await db.query("SELECT 1 FROM org_sender_memberships m JOIN organizations o ON o.id=m.org_id AND o.status='active' WHERE m.org_id=$1 AND m.subject=$2 AND m.active AND m.role IN('owner','admin') FOR SHARE OF m,o",[a.org_id,a.subject])).rows[0])throw Error('MEMBERSHIP_REQUIRED');
 }
 async function idle(db,org){const r=await db.query("SELECT EXISTS(SELECT 1 FROM outreach_activities WHERE org_id=$1 AND channel='call' AND coalesce(dispatch_metadata->>'state','unknown') NOT IN('settled','cancelled_before_send')) busy",[org]);if(r.rows[0]?.busy!==false)throw Error('CALLING_ACTIVE_OR_UNCERTAIN');}
 async function save(db,org,row,config){const r=(await db.query('SELECT strategy_campaign_save($1::jsonb) result',[JSON.stringify({org_id:org,campaign_id:Number(row.id),expected_version:row.version,config})])).rows[0]?.result;if(r?.error==='VERSION_CONFLICT')throw Error('CAMPAIGN_VERSION_CONFLICT');if(r?.http_status!==200||r.org_id!==org||Number(r.campaign_id)!==Number(row.id)||r.version!==row.version+1)throw Error('CALLING_ACCOUNT_UNCONFIRMED');return{campaign_id:Number(row.id),version:r.version};}
 async function receipt(db,p,h,result){await db.query('INSERT INTO calling_account_changes(org_id,request_id,payload_hash,result) VALUES($1,$2,$3,$4)',[p.org_id,p.request_id,h,result]);return result;}
 function expected(row,p){if(!row||row.version!==p.expected_account_version)throw Error('CALLING_ACCOUNT_CHANGED');}
 return{
  async read(token,value){const p=input(value,'read');await actor(token,p.org_id);
   const row=(await pool.query('SELECT c.id,c.version,v.config FROM strategy_campaigns c JOIN strategy_campaign_versions v ON v.org_id=c.org_id AND v.campaign_id=c.id AND v.version=c.version WHERE c.org_id=$1 AND c.id=$2',[p.org_id,p.campaign_id])).rows[0];if(!row)throw Error('CAMPAIGN_NOT_FOUND');
   const a=await account(pool,p.org_id),d=row.config.call_dispatch||{},bound=a?.state==='pending_setup'&&d.resource_account?.org_id===p.org_id&&d.resource_account?.version===a.version&&d.connection_ref===connectionRef(a);
   return{campaign_id:p.campaign_id,version:row.version,call_channel_selected:row.config.channels?.includes('call')===true,account:a?{version:a.version,state:a.state,agent_id:a.agent_id,agent_version:a.agent_version,from_number:a.from_number}:null,bound:!!bound,calling_enabled:d.enabled===true&&d.campaign_state==='running',execution_authorized:false,remaining_checks:[...(!a||a.state==='disconnected'?['account_connection_required']:[]),...(!a?.from_number?['calling_number_required']:[]),'approved_agent_tools_review_required','caller_and_route_verification_required','provider_funding_and_cost_quote_required','recipient_and_release_checks_required']};
  },
  async receipt(token,value){const p=input(value,'receipt');await actor(token,p.org_id);const r=(await pool.query('SELECT result FROM calling_account_changes WHERE org_id=$1 AND request_id=$2',[p.org_id,p.request_id])).rows[0];return{recorded:!!r,...(r?{result:r.result}:{}),execution_authorized:false};},
  async bind(token,value){const p=input(value,'bind'),a=await actor(token,p.org_id),h=hash(p);
   const prior=await replay(pool,p,h);if(prior)return prior;
   const snapshot=await account(pool,p.org_id),preview=await campaign(pool,p.org_id,p.campaign_id,false);
   const calendar=snapshot?.state==='pending_setup'&&snapshot.version===p.expected_account_version&&preview?.version===p.expected_campaign_version?await verifiedCalendar(preview.config,snapshot,listCalendars,now()):null;
   // Remote Calendar reads finish before taking the global call lock. Exact account,
   // campaign and Calendar snapshots are rechecked before preserving the selection.
   return transaction(async db=>{await guard(db,a);const old=await replay(db,p,h);if(old)return old;await idle(db,p.org_id);const ac=await account(db,p.org_id,true);expected(ac,p);if(ac.state!=='pending_setup')throw Error('CALLING_ACCOUNT_NOT_CONNECTED');const row=await campaign(db,p.org_id,p.campaign_id);if(!row)throw Error('CAMPAIGN_NOT_FOUND');if(row.version!==p.expected_campaign_version)throw Error('CAMPAIGN_VERSION_CONFLICT');if(!row.config.channels?.includes('call'))throw Error('CALLING_CHANNEL_REQUIRED');const keep=calendar&&JSON.stringify(row.config.call_dispatch?.calendar)===JSON.stringify(preview.config.call_dispatch?.calendar)?calendar:null;const saved=await save(db,p.org_id,row,paused(row.config,ac,keep));return receipt(db,p,h,{saved:true,...saved,account_version:ac.version,calendar_preserved:!!keep,calling_enabled:false,release_enabled:false,execution_authorized:false});});
  },
  async change(token,value){const p=input(value,'change'),a=await actor(token,p.org_id),h=hash(p);
   const prior=await replay(pool,p,h);if(prior)return prior;
   const snapshot=await account(pool,p.org_id);expected(snapshot,p);
   let secret;
   if(p.action==='update'){
    if(!p.api_key&&snapshot.state==='disconnected')throw Error('CALLING_ACCOUNT_KEY_REQUIRED');
    secret=p.api_key?{api_key:p.api_key}:vault.open(p.org_id,snapshot.secrets);
    await provider.verify({...secret,agent_id:p.agent_id,agent_version:p.agent_version,from_number:p.from_number});
   }
   try{return await transaction(async db=>{
    await guard(db,a);const old=await replay(db,p,h);if(old)return old;await idle(db,p.org_id);const current=await account(db,p.org_id,true);expected(current,p);
    const next={...current,version:current.version+1,...(p.action==='update'?{agent_id:p.agent_id,agent_version:p.agent_version,from_number:p.from_number,state:'pending_setup'}:{state:'disconnected'})};
    if(p.action==='update')await db.query("UPDATE calling_accounts SET version=$2,request_id=$3,key_fingerprint=$4,agent_id=$5,agent_version=$6,from_number=$7,secrets=$8,state='pending_setup',checked_at=now() WHERE org_id=$1",[p.org_id,next.version,p.request_id,digest(secret.api_key),next.agent_id,next.agent_version,next.from_number,vault.seal(p.org_id,secret)]);
    else await db.query("UPDATE calling_accounts SET version=$2,request_id=$3,key_fingerprint=NULL,secrets=NULL,state='disconnected' WHERE org_id=$1",[p.org_id,next.version,p.request_id]);
    const rows=(await db.query("SELECT c.id,c.version,v.config FROM strategy_campaigns c JOIN strategy_campaign_versions v ON v.org_id=c.org_id AND v.campaign_id=c.id AND v.version=c.version WHERE c.org_id=$1 AND v.config->'call_dispatch'->'resource_account'->>'org_id'=$2 ORDER BY c.id FOR UPDATE OF c",[p.org_id,String(p.org_id)])).rows;
    const campaigns=[];for(const row of rows)campaigns.push(await save(db,p.org_id,row,paused(row.config,next)));
    return receipt(db,p,h,{saved:true,action:p.action,account_version:next.version,campaigns,calling_enabled:false,release_enabled:false,execution_authorized:false});
   });}catch(e){if(e.code==='23505')throw Error('CALLING_ACCOUNT_ALREADY_LINKED');throw e;}
  }
 };
}
module.exports={service,input,paused,connectionRef,verifiedCalendar};
