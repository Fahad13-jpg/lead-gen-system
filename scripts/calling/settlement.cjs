'use strict';
const {query}=require('./storage.cjs');
// Trusted normalized billing receipts, not raw model/webhook fields.
// Live provider units and coverage must be verified by their adapters first.
function prepare(binding,receipts,requiredProviders){
 if(!Number.isSafeInteger(binding?.org_id)||binding.org_id<=0||
 !/^[1-9][0-9]*$/.test(String(binding.activity_id))||
 !['lease','connection_ref','provider_call_id'].every(k=>typeof binding[k]==='string'&&binding[k].length>0))throw Error('SETTLEMENT_BINDING_INVALID');
 if(!Array.isArray(requiredProviders)||!requiredProviders.length||
 requiredProviders.some(p=>typeof p!=='string'||!p)||new Set(requiredProviders).size!==requiredProviders.length||
 !Array.isArray(receipts)||receipts.length!==requiredProviders.length)throw Error('ALL_PROVIDER_RECEIPTS_REQUIRED');
 const seen=new Set();let total=0;
 for(const r of receipts){
  if(!r||!requiredProviders.includes(r.provider)||seen.has(r.provider)||r.final!==true||r.verified!==true||
  r.currency!=='USD'||r.org_id!==binding.org_id||r.connection_ref!==binding.connection_ref||
  r.provider_call_id!==binding.provider_call_id||!Number.isSafeInteger(r.micro_usd)||r.micro_usd<0||
  typeof r.evidence_ref!=='string'||!r.evidence_ref||r.evidence_ref.length>256)throw Error('BILLING_RECEIPT_INVALID');
  seen.add(r.provider);total+=r.micro_usd;
  if(!Number.isSafeInteger(total)||total>999999999999)throw Error('BILLING_TOTAL_INVALID');
 }
 const {createHash}=require('node:crypto');
 const evidence_ref=createHash('sha256').update(JSON.stringify(receipts.map(r=>[r.provider,r.evidence_ref,r.micro_usd]).sort((a,b)=>a[0].localeCompare(b[0])))).digest('hex');
 return {org_id:binding.org_id,activity_id:String(binding.activity_id),lease:binding.lease,
 connection_ref:binding.connection_ref,provider_call_id:binding.provider_call_id,
 total_micro_usd:total,currency:'USD',all_provider_costs_final:true,evidence_ref};
}
async function settle(binding,receipts,requiredProviders,deps){
 if(deps?.mode!=='mock')throw Error('LIVE_SETTLEMENT_NOT_IMPLEMENTED');
 const payload=prepare(binding,receipts,requiredProviders);
 try{const result=await deps.executeQuery(query('outreach_call_settle',payload));
  return result?.saved===true?result:{saved:false,reconciliation_required:true};
 }catch{return {saved:false,reconciliation_required:true,reason:'settlement_commit_unknown'};}
}
module.exports={prepare,settle};
