'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const base=require('../../scripts/organization-policy/catalog.cjs');
const {resolveStrategy,assessEmail}=require('../../scripts/organization-policy/policy.cjs');
function catalog(){const c=structuredClone(base);for(const p of Object.values(c.plans)){p.email={daily:50,monthly:200};p.ai={monthly_requests:10};}return c;}
function fixture(tier='standard'){
 const usage=Object.fromEntries(['org_daily','campaign_daily','mailbox_daily','mailbox_rolling_24h','org_monthly'].map(k=>[k,{used:0,reserved:0}]));
 return {organization:{org_id:1,status:'active',subscription_tier:tier,limits:{email_daily:30,min_interval_seconds:300}},
  campaign:{org_id:1,mode:'template',funding:'byok',email_daily:50,min_interval_seconds:60},
  connection:{org_id:1,status:'ready',capabilities:['email_send','email_read_replies'],limits:{daily:10,rolling_24h:10,min_interval_seconds:120}},
  usage,supported_strategy_modes:['template','ai'],email_executor_supported:true,
  existing_checks:Object.fromEntries(['authorized_org_access','recipient_eligible','unsuppressed','approved_hash_current','within_sending_window','provider_ready','mailbox_spacing_ready'].map(k=>[k,true])),
  budget:{estimated_micro_usd:0},ai:{enabled:false,used:0,reserved:0}};
}
const run=x=>assessEmail(x,{catalog:catalog()});
for(const tier of ['freemium','standard','premium'])test(tier+' permits customer strategy/BYOK but never authorizes transport',()=>{
 const x=fixture(tier),before=structuredClone(x),r=run(x);
 assert.equal(r.policy_eligible,true);assert.equal(r.execution_authorized,false);assert.equal(r.remaining_email_capacity,10);
 assert.equal(r.minimum_spacing_seconds,300);assert.equal(r.strategy_ai_request_units,0);assert.equal(r.debit_platform_wallet,false);assert.deepEqual(x,before);
});
test('draft commercial allowances do not become unlimited',()=>{
 const r=assessEmail(fixture());assert.equal(r.policy_eligible,false);assert(r.reasons.includes('quota_unconfigured_plan_daily'));assert.equal(r.remaining_email_capacity,null);
});
test('legacy tier requires an explicit trusted mapping',()=>{
 const x=fixture('starter');assert(run(x).reasons.includes('tier_mapping_required'));
 assert.equal(assessEmail(x,{catalog:catalog(),legacyTierMap:{starter:'freemium'}}).tier,'freemium');
 for(const tier of ['__proto__','constructor',null])assert.equal(run(fixture(tier)).policy_eligible,false);
});
test('BYOK does not exempt platform-processing caps or customer provider budgets',()=>{
 const x=fixture();x.usage.org_monthly.used=200;assert(run(x).reasons.includes('quota_exhausted_plan_monthly'));
 x.usage.org_monthly.used=0;x.budget={estimated_micro_usd:100,provider_available_micro_usd:99,wallet_available_micro_usd:99999};
 assert(run(x).reasons.includes('provider_budget_exhausted'));
 x.budget.provider_available_micro_usd=100;x.budget.wallet_available_micro_usd=0;assert.equal(run(x).policy_eligible,true);
});
test('platform funding needs customer quote and available wallet independently of provider balance',()=>{
 const x=fixture();x.campaign.funding='platform';x.budget={estimated_micro_usd:100,provider_available_micro_usd:100,customer_quote_micro_usd:150,wallet_available_micro_usd:149};
 assert(run(x).reasons.includes('platform_wallet_exhausted'));x.budget.wallet_available_micro_usd=150;assert.equal(run(x).policy_eligible,true);
 delete x.budget.customer_quote_micro_usd;assert(run(x).reasons.includes('customer_quote_required'));
});
test('quota scopes remain distinct and reservations consume capacity',()=>{
 const x=fixture();x.usage.org_daily.used=20;x.usage.campaign_daily.used=1;x.usage.mailbox_rolling_24h={used:7,reserved:2};
 assert.equal(run(x).remaining_email_capacity,1);x.usage.mailbox_rolling_24h.reserved=3;assert(run(x).reasons.includes('quota_exhausted_mailbox_rolling_24h'));
});
for(const bad of [null,'10',-1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])test('invalid quota '+String(bad)+' fails closed',()=>{
 const x=fixture();x.connection.limits.daily=bad;assert(run(x).reasons.includes('quota_unconfigured_mailbox_daily'));
});
test('zero cap blocks and lower admin limits take immediate effect',()=>{
 const x=fixture();x.organization.limits.email_daily=0;assert(run(x).reasons.includes('quota_exhausted_org_daily'));
 x.organization.limits.email_daily=3;assert.equal(run(x).remaining_email_capacity,3);
});
test('foreign organizations and send-only SMTP cannot pass readiness',()=>{
 const x=fixture();x.connection.org_id=2;x.campaign.org_id=2;x.connection.capabilities=['email_send'];
 const r=run(x);for(const code of ['connection_org_mismatch','campaign_org_mismatch','connection_missing_email_read_replies'])assert(r.reasons.includes(code));
});
test('premium never bypasses existing approval, suppression or verification gates',()=>{
 const x=fixture('premium');for(const k of ['approved_hash_current','unsuppressed','recipient_eligible'])x.existing_checks[k]=false;
 const r=run(x);for(const k of ['approved_hash_current','unsuppressed','recipient_eligible'])assert(r.reasons.includes('existing_check_'+k));
});
test('template mode needs no strategy AI allowance; AI mode needs both entitlement and readiness',()=>{
 const x=fixture();assert.equal(run(x).policy_eligible,true);x.campaign.mode='ai';assert(run(x).reasons.includes('ai_disabled'));
 x.ai={enabled:true,provider_ready:true,used:9,reserved:1};assert(run(x).reasons.includes('quota_exhausted_strategy_ai_monthly'));
 x.ai.reserved=0;assert.equal(run(x).policy_eligible,true);
});
test('hybrid entitlement does not claim current v2 implementation supports hybrid',()=>{
 const x=fixture();x.campaign.mode='hybrid';assert(run(x).reasons.includes('strategy_mode_not_implemented'));
});
test('missing input and missing safety checks fail closed without throwing',()=>{
 for(const x of [null,{},[],{organization:null}])assert.equal(assessEmail(x).policy_eligible,false);
 const x=fixture();delete x.existing_checks;assert.equal(run(x).policy_eligible,false);
});
test('catalog is immutable and a feature entitlement does not allocate credits',()=>{
 assert.throws(()=>{base.plans.premium.email.daily=999;});
 assert.equal(base.plans.premium.verification_credits_included,true);assert.equal(base.plans.premium.ai.monthly_requests,null);
 assert.equal(resolveStrategy(fixture().organization,'template').requires_strategy_ai,false);
});
