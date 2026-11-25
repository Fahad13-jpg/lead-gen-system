'use strict';
// A server-owned, opt-in native boundary. Pure/offline builders stay blocked.
const c=require('./contract.cjs');
const id=v=>Number.isSafeInteger(v)&&v>0;
function release(plan,p,{enabled=false}={}){
 if(enabled!==true)return plan;
 try{
  const input=p?.input,b=p?.prepared?.brief,first=plan?.strategy?.step1;
  if(p.contract_version!=='strategy_v2'||!id(p.id)||!id(p.org_id)||input?.org_id!==p.org_id||input?.lead?.org_id!==p.org_id||!id(input?.lead?.id)||!id(input?.campaign?.id)||!id(input?.campaign?.version)||input.campaign.org_id!==undefined&&input.campaign.org_id!==p.org_id||!/^[a-f0-9]{32}$/.test(p.lease||'')||!/^[a-f0-9]{32}$/.test(input.fingerprint||''))return plan;
  if(p.customer_payload||plan.validation_profile==='customer_email_v1'||plan.generation?.source==='customer_supplied')return plan;
  if(p.mode!==input.campaign.config.mode||p.draft_review_context_hash!==c.hash({id:p.id,org_id:p.org_id,lease:p.lease,input}))return plan;
  if(input.suppressed!==false||input.replied!==false||!Array.isArray(input.report?.trust?.conflicts)||input.report.trust.conflicts.length)return plan;
  if(!['ai_completed','template_completed'].includes(plan.state)||plan.version!=='strategy_v2'||plan.execution_authorized!==false||plan.approval_required!==true)return plan;
  if(plan.state==='ai_completed'&&p.mode!=='ai'||plan.state==='template_completed'&&p.mode!=='template')return plan;
  if(!Array.isArray(plan.validation_errors)||plan.validation_errors.length||!Array.isArray(plan.blocking_reasons)||plan.blocking_reasons.length!==1||plan.blocking_reasons[0]!=='v2_offline_only')return plan;
  if(!Array.isArray(b?.permitted_channels)||!b.permitted_channels.length||!first||first.channel!==b.permitted_channels[0].channel||!Array.isArray(first.parts)||!first.parts.length)return plan;
  if(b.org_id!==p.org_id||b.lead_id!==input.lead.id||c.hash(b)!==p.prepared.input_hash||plan.input_hash!==p.prepared.input_hash)return plan;
  const {content_hash,...body}=plan;if(content_hash!==c.hash(body)||!c.validate(plan.strategy,p.prepared).ok)return plan;
  // The first release is email only. Other channels retain their existing gates.
  if(first.channel!=='email'||!first.parts.some(part=>part.type==='offer'))return plan;
  const draft=plan.artifacts?.email_draft;
  if(!draft||typeof draft.subject!=='string'||!draft.subject.trim()||draft.body!==first.parts.map(part=>part.text).join('\n\n'))return plan;
  const result={...body,blocking_reasons:[],draft_review_release:{version:'native_email_review_v1',scope:'content_approval_only',execution_authorized:false,checks:'validated_at_generation; approval_and_dispatch_recheck_current_state'}};
  return{...result,content_hash:c.hash(result)};
 }catch{return plan;}
}
module.exports={release};
