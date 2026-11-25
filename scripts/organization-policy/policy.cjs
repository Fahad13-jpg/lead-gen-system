'use strict';
// PURE, OFFLINE policy preview. Not an authorization or reservation engine.
// All input snapshots/catalog/mappings must come from a trusted backend adapter.
// Existing SQL approval, lease, suppression and quota checks remain authoritative.
const defaults=require('./catalog.cjs');
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const count=v=>Number.isSafeInteger(v)&&v>=0;
const positive=v=>Number.isSafeInteger(v)&&v>0;
const own=(o,k)=>obj(o)&&Object.hasOwn(o,k);
function resolveStrategy(organization,mode,{catalog=defaults,legacyTierMap={}}={}){
 const reasons=[];
 if(!positive(organization?.org_id))reasons.push('org_id_required');
 if(organization?.status!=='active')reasons.push('organization_inactive');
 const raw=organization?.subscription_tier;
 const tier=own(catalog?.plans,raw)?raw:own(legacyTierMap,raw)?legacyTierMap[raw]:null;
 const plan=own(catalog?.plans,tier)?catalog.plans[tier]:null;
 if(!plan)reasons.push('tier_mapping_required');
 if(!['template','hybrid','ai'].includes(mode))reasons.push('strategy_mode_invalid');
 else if(!Array.isArray(plan?.strategy_modes)||!plan.strategy_modes.includes(mode))reasons.push('strategy_mode_not_entitled');
 return {preview_only:true,execution_authorized:false,tier,catalog_version:catalog?.version||null,
  mode,requires_strategy_ai:['hybrid','ai'].includes(mode),
  ai_request_units:mode==='template'?0:null,policy_eligible:reasons.length===0,reasons};
}
function assessEmail(input,options={}){
 const x=obj(input)?input:{},org=x.organization,c=x.campaign,connection=x.connection;
 const strategy=resolveStrategy(org,c?.mode,options),reasons=[...strategy.reasons];
 const catalog=options.catalog||defaults;
 const plan=own(catalog.plans,strategy.tier)?catalog.plans[strategy.tier]:null;
 const add=r=>{if(!reasons.includes(r))reasons.push(r);};
 if(c?.org_id!==org?.org_id||!positive(c?.org_id))add('campaign_org_mismatch');
 if(connection?.org_id!==org?.org_id||!positive(connection?.org_id))add('connection_org_mismatch');
 if(connection?.status!=='ready')add('connection_not_ready');
 const capabilities=Array.isArray(connection?.capabilities)?connection.capabilities:[];
 for(const cap of ['email_send','email_read_replies'])if(!capabilities.includes(cap))add('connection_missing_'+cap);
 // Selecting a mode is distinct from having an implemented integration for it.
 if(!Array.isArray(x.supported_strategy_modes)||!x.supported_strategy_modes.includes(c?.mode))add('strategy_mode_not_implemented');
 if(x.email_executor_supported!==true)add('email_executor_not_supported');
 if(!['platform','byok'].includes(c?.funding))add('funding_mode_required');
 if(c?.funding==='byok'&&plan?.byok!==true)add('byok_not_entitled');
 const checks=obj(x.existing_checks)?x.existing_checks:{};
 for(const k of ['authorized_org_access','recipient_eligible','unsuppressed','approved_hash_current','within_sending_window','provider_ready'])
  if(checks[k]!==true)add('existing_check_'+k);
 const buckets=[];
 function bucket(name,limit,used,reserved){
  if(!count(limit)||!count(used)||!count(reserved)||!Number.isSafeInteger(used+reserved)){
   add('quota_unconfigured_'+name);buckets.push({name,remaining:null});return;
  }
  const remaining=Math.max(0,limit-used-reserved);
  buckets.push({name,limit,used,reserved,remaining});if(!remaining)add('quota_exhausted_'+name);
 }
 const u=obj(x.usage)?x.usage:{},limits=obj(org?.limits)?org.limits:{};
 for(const [name,limit,usageKey] of [
  ['plan_daily',plan?.email?.daily,'org_daily'],['org_daily',limits.email_daily,'org_daily'],
  ['campaign_daily',c?.email_daily,'campaign_daily'],['mailbox_daily',connection?.limits?.daily,'mailbox_daily'],
  ['mailbox_rolling_24h',connection?.limits?.rolling_24h,'mailbox_rolling_24h'],['plan_monthly',plan?.email?.monthly,'org_monthly']
 ])bucket(name,limit,u[usageKey]?.used,u[usageKey]?.reserved);
 const spacing=[limits.min_interval_seconds,c?.min_interval_seconds,connection?.limits?.min_interval_seconds];
 const minimumSpacing=spacing.every(count)?Math.max(...spacing):null;
 if(minimumSpacing===null)add('spacing_unconfigured');
 // SQL owns timestamps/locks; this component must not independently permit a send.
 if(checks.mailbox_spacing_ready!==true)add('existing_check_mailbox_spacing_ready');
 let aiUnits=strategy.ai_request_units;
 if(strategy.requires_strategy_ai){
  aiUnits=null;
  if(x.ai?.enabled!==true)add('ai_disabled');
  if(x.ai?.provider_ready!==true)add('ai_provider_not_ready');
  bucket('strategy_ai_monthly',plan?.ai?.monthly_requests,x.ai?.used,x.ai?.reserved);
 }
 const budget=obj(x.budget)?x.budget:{};
 const estimate=budget.estimated_micro_usd;
 if(!count(estimate))add('cost_estimate_required');
 else if(estimate>0){
  if(!count(budget.provider_available_micro_usd))add('provider_budget_required');
  else if(budget.provider_available_micro_usd<estimate)add('provider_budget_exhausted');
  if(c?.funding==='platform'){
   // Customer quote can include markup. Never infer it from provider cost.
   if(!count(budget.customer_quote_micro_usd))add('customer_quote_required');
   else if(!count(budget.wallet_available_micro_usd))add('platform_wallet_required');
   else if(budget.wallet_available_micro_usd<budget.customer_quote_micro_usd)add('platform_wallet_exhausted');
  }
 }
 const emailBuckets=buckets.filter(b=>b.name!=='strategy_ai_monthly');
 return {...strategy,policy_eligible:reasons.length===0,reasons,buckets,
  remaining_email_capacity:emailBuckets.every(b=>b.remaining!==null)?Math.min(...emailBuckets.map(b=>b.remaining)):null,
  minimum_spacing_seconds:minimumSpacing,strategy_ai_request_units:aiUnits,
  debit_platform_wallet:c?.funding==='platform'?null:false,
  reservation_required:true,execution_authorized:false,
  limitations:['Trusted snapshots only; no authentication, DNS checks, provider calls, SQL locks, quota reservations or sending performed.',
   'Policy eligibility is not execution authorization; recheck current state using existing gates and reservations.']};
}
module.exports={resolveStrategy,assessEmail};
