'use strict';
// Trusted backend snapshots only. This preview never authorizes or reserves a call.
const SHARED_MONTHLY_MICRO_USD=10_000_000;
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const positive=x=>integer(x)&&x>0;
const date=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
function assess(x={}){
 const reasons=[],add=r=>{if(!reasons.includes(r))reasons.push(r);};
 const {org_id,connection={},budget={},checks={},limits={},usage={}}=x;
 if(!positive(org_id))add('org_id_required');
 if(connection.org_id!==org_id||!positive(connection.org_id))add('connection_org_mismatch');
 if(connection.provider!=='retell'||connection.status!=='ready')add('connection_not_ready');
 if(!['platform','byok'].includes(x.funding))add('funding_required');
 if(connection.funding!==x.funding)add('connection_funding_mismatch');
 if(!['ur','en','ur-en'].includes(x.language))add('language_not_configured');
 if(!['PK','US'].includes(x.destination))add('destination_not_supported');
 if(x.destination!=='US')add('market_not_in_initial_rollout');
 if(x.language!=='en')add('initial_rollout_requires_english');
 const route=connection.routes?.[x.destination];
 if(route?.verified!==true||route?.enabled!==true)add('destination_route_unverified');
 if(x.destination==='PK'&&route?.transport!=='custom_sip')add('pakistan_custom_route_required');
 for(const k of ['authorized_org_access','approved_hash_current','recipient_eligible','unsuppressed',
  'campaign_running','within_campaign_window','within_plan_window','spacing_ready','compliance_eligible',
  'voice_language_tested','caller_id_authorized'])if(checks[k]!==true)add(k);
 // Initial release is globally serial, including all organizations and campaigns.
 if(usage.active_or_uncertain_calls!==0)add('call_already_active_or_uncertain');
 if(!positive(limits.org_daily_calls))add('daily_allowance_unconfigured');
 if(!integer(usage.org_daily_calls)||!integer(usage.org_reserved_calls))add('daily_usage_unknown');
 else if(!Number.isSafeInteger(usage.org_daily_calls+usage.org_reserved_calls)||
  usage.org_daily_calls+usage.org_reserved_calls>=limits.org_daily_calls)add('daily_allowance_exhausted');
 const estimate=budget.max_call_micro_usd;
 if(!positive(estimate)||budget.quote_verified!==true)add('cost_quote_required');
 if(!date(x.now)||!date(budget.quote_expires_at)||Date.parse(budget.quote_expires_at)<=Date.parse(x.now))add('cost_quote_expired');
 if(!date(budget.period_start)||!date(budget.period_end)||!date(x.now)||
  !(Date.parse(budget.period_start)<=Date.parse(x.now)&&Date.parse(x.now)<Date.parse(budget.period_end)))add('budget_period_invalid');
 const ceiling=x.funding==='platform'?SHARED_MONTHLY_MICRO_USD:budget.ceiling_micro_usd;
 const values=[ceiling,budget.used_micro_usd,budget.reserved_micro_usd,budget.buffer_micro_usd];
 let remaining=null;
 if(!values.every(integer)||!Number.isSafeInteger(values.slice(1).reduce((a,b)=>a+b,0)))add('budget_unconfigured');
 else {remaining=ceiling-values.slice(1).reduce((a,b)=>a+b,0);if(remaining<estimate)add('waiting_for_calling_credits');}
 if(x.funding==='platform'&&budget.scope!=='platform_all_orgs')add('shared_budget_scope_required');
 if(x.funding==='byok'&&(budget.scope!=='organization'||budget.org_id!==org_id))add('customer_budget_scope_required');
 return {policy_eligible:!reasons.length,reasons,remaining_micro_usd:remaining,
  reserve_micro_usd:positive(estimate)?estimate:null,max_connected_seconds:60,target_connected_seconds:50,
  execution_authorized:false,reservation_required:true};
}
function select(queue,now){
 if(!date(now))throw Error('INVALID_CLOCK');
 const due=queue.filter(x=>date(x.due_at)&&date(x.created_at)&&Date.parse(x.due_at)<=Date.parse(now))
  .sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)||String(a.id).localeCompare(String(b.id)));
 const deferred=[];
 for(const job of due){const policy=assess({...job.policy,now});
  if(policy.policy_eligible)return {job,policy,deferred};
  deferred.push({id:job.id,reasons:policy.reasons});
 }
 return {job:null,deferred};
}
module.exports={assess,select,SHARED_MONTHLY_MICRO_USD};
