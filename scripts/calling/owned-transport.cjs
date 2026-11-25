'use strict';
// Trusted worker port only. Not exposed through dashboard HTTP and not scheduled.
const {assess}=require('./account-preflight.cjs'),{normalize}=require('./n8n-receipt.cjs');
const {connectionRef}=require('../dashboard/calling-binding.cjs'),crypto=require('node:crypto');
const positive=n=>Number.isSafeInteger(n)&&n>0&&n<=2147483647;
function sameSecret(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length>=32&&x.length===y.length&&crypto.timingSafeEqual(x,y);}
function toolsVerified(account,snapshot,binding,now){
 if(binding?.org_id!==account.org_id||binding.connection_ref!==connectionRef(account)||binding.account_version!==account.version||binding.agent_id!==account.agent_id||binding.agent_version!==account.agent_version||binding.from_number!==account.from_number||!Number.isFinite(Date.parse(binding.expires_at))||Date.parse(binding.expires_at)<=now||Date.parse(binding.expires_at)>now+86400000)return false;
 for(const k of ['tool_backend_verified','voice_tested','caller_id_authorized','route_verified'])if(binding[k]!==true)return false;
 let u;try{u=new URL(binding.tool_url);}catch{return false;}if(u.protocol!=='https:'||u.username||u.password||u.hash||u.search)return false;
 const custom=snapshot.llm?.general_tools?.filter(t=>t.type==='custom');if(!custom?.length)return false;
 return custom.every(t=>t.url===binding.tool_url&&sameSecret(Object.entries(t.headers||{}).find(([k])=>k.toLowerCase()==='x-call-tool-token')?.[1],binding.tool_token));
}
function provider({fetcher=fetch}={}){
 async function request(key,method,path,body){
  try{const r=await fetcher('https://api.retellai.com'+path,{method,redirect:'error',headers:{Authorization:'Bearer '+key,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
   const raw=await r.text();if(raw.length>2000000)throw Error();return{statusCode:r.status,body:JSON.parse(raw)};
  }catch{throw Error('CALL_PROVIDER_RESULT_UNCERTAIN');}
 }
 return{create:(key,body)=>request(key,'POST','/v2/create-phone-call',body),get:(key,id)=>request(key,'GET','/v2/get-call/'+encodeURIComponent(id))};
}
function worker({pool,transaction,vault,inspection,transport,toolBinding=async()=>null,enabled=()=>false,now=Date.now}){
 async function account(org,db=pool,lock=false){return(await db.query('SELECT * FROM calling_accounts WHERE org_id=$1'+(lock?' FOR UPDATE':''),[org])).rows[0];}
 async function store(normalized){if(!['outreach_call_observe','outreach_call_uncertain'].includes(normalized.operation))return{saved:false};const op=normalized.operation==='outreach_call_observe'?'outreach_call_ingest':'outreach_call_uncertain';return(await pool.query('SELECT '+op+'($1::jsonb) result',[JSON.stringify(normalized.payload)])).rows[0]?.result;}
 function matchesRequest(binding,a){const q=binding.request;return binding.org_id===a.org_id&&binding.connection_ref===connectionRef(a)&&q?.override_agent_id===a.agent_id&&q.override_agent_version===a.agent_version&&q.from_number===a.from_number&&/^\+1[0-9]{10}$/.test(q.to_number||'')&&q.agent_override?.agent?.max_call_duration_ms===60000&&q.metadata?.org_id===String(a.org_id)&&q.metadata?.activity_id===String(binding.activity_id)&&q.metadata?.plan_hash===binding.content_hash;}
 return{
  async once(org){
   if(enabled()!==true)return{state:'disabled',retry_allowed:false};if(!positive(org))throw Error('ORG_REQUIRED');
   const a=await account(org);if(!a||a.state!=='pending_setup')return{state:'blocked',reason:'account_not_connected'};
   let key,snapshot;try{key=vault.open(org,a.secrets).api_key;snapshot=await inspection.inspect({api_key:key,agent_id:a.agent_id,agent_version:a.agent_version,from_number:a.from_number});}catch{return{state:'blocked',reason:'provider_preflight_failed'};}
   if(!assess(a,snapshot).provider_checks_passed)return{state:'blocked',reason:'provider_preflight_failed'};
   const proof=await toolBinding(a);if(!toolsVerified(a,snapshot,proof,now()))return{state:'blocked',reason:'tool_voice_or_route_proof_required'};
   let binding;
   try{binding=await transaction(async db=>{
    await db.query('SELECT pg_advisory_xact_lock(727411,1)');await db.query('SELECT pg_advisory_xact_lock(727412,$1)',[org]);
    const current=await account(org,db,true);if(!current||current.state!=='pending_setup'||current.version!==a.version||current.key_fingerprint!==a.key_fingerprint||current.agent_id!==a.agent_id||current.agent_version!==a.agent_version||current.from_number!==a.from_number)throw Error('CALLING_ACCOUNT_CHANGED');
    if(!toolsVerified(a,snapshot,proof,now()))throw Error('CALL_TOOL_PROOF_EXPIRED');
    const r=(await db.query('SELECT outreach_call_dispatch_next($1,$2) result',[org,connectionRef(a)])).rows[0]?.result;if(r?.authorized!==true)return r||{authorized:false};
    if(!matchesRequest(r,a))throw Error('CALL_BINDING_INVALID');
    const campaign=(await db.query("SELECT v.config FROM outreach_activities a JOIN strategy_plans p ON p.org_id=a.org_id AND p.id::text=a.dispatch_metadata->>'plan_id' JOIN strategy_campaigns c ON c.org_id=p.org_id AND c.id=p.campaign_id AND c.version=p.campaign_version JOIN strategy_campaign_versions v ON v.org_id=c.org_id AND v.campaign_id=c.id AND v.version=c.version WHERE a.org_id=$1 AND a.id=$2",[org,r.activity_id])).rows[0]?.config;
    const d=campaign?.call_dispatch;if(d?.funding!=='byok'||d.resource_account?.org_id!==org||d.resource_account?.version!==a.version||d.connection_ref!==connectionRef(a))throw Error('CALL_BINDING_INVALID');
    return r;
   });}catch{return{state:'reconciliation_required',reason:'claim_not_confirmed',retry_allowed:false};}
   if(binding.authorized!==true)return{state:'blocked',reason:binding.reason||'no_eligible_calls',retry_allowed:false};
   // COMMIT above records attempts=1 before the sole POST. Account lifecycle is now
   // blocked by that active/uncertain activity. No credential or request is logged.
   let normalized;try{normalized=normalize(await transport.create(key,binding.request),binding);}catch{normalized=normalize(null,binding);}
   try{const saved=await store(normalized);if(saved?.saved!==true)return{state:'reconciliation_required',reason:'receipt_not_confirmed',retry_allowed:false};}
   catch{return{state:'reconciliation_required',reason:'receipt_commit_unknown',retry_allowed:false};}
   return{state:normalized.operation==='outreach_call_observe'?'provider_observed':'reconciliation_required',activity_id:binding.activity_id,retry_allowed:false,cost_settlement_required:true};
  },
  async poll(org){
   if(!positive(org))throw Error('ORG_REQUIRED');const a=await account(org);if(!a||a.state!=='pending_setup')return{state:'blocked',reason:'account_not_connected'};
   const rows=(await pool.query("SELECT org_id,id::text activity_id,dispatch_metadata->>'lease' lease,dispatch_metadata->>'content_hash' content_hash,dispatch_metadata->>'connection_ref' connection_ref,dispatch_metadata->>'provider_call_id' provider_call_id,dispatch_metadata->'expected_request' request FROM outreach_call_poll_queue($1,$2)",[org,connectionRef(a)])).rows;
   if(!rows.length)return{state:'idle',checked:0};const key=vault.open(org,a.secrets).api_key;let checked=0,uncertain=0;
   for(const row of rows){if(!/^[A-Za-z0-9_-]{1,128}$/.test(row.provider_call_id||'')||!matchesRequest(row,a)){uncertain++;continue;}
    try{const result=normalize(await transport.get(key,row.provider_call_id),row,true);if(result.operation!=='outreach_call_observe'||(await store(result))?.saved!==true){uncertain++;continue;}checked++;}catch{uncertain++;}
   }return{state:uncertain?'reconciliation_required':'observed',checked,uncertain,retry_allowed:false,cost_settlement_required:true};
  }
 };
}
module.exports={worker,provider,toolsVerified};
