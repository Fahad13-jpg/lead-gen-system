'use strict';
// Recheck customer content against current trusted SQL context before transport preparation.
// Success is content validity only. SQL still owns approval, lease, eligibility and quota.
const {render}=require('./customer-email-template.cjs');
function validate(row){
 const b=row?.body;
 const customer=b?.validation_profile==='customer_email_v1'||b?.generation?.source==='customer_supplied'||b?.customer_review?.required===true;
 if(!customer)return {applicable:false,execution_authorized:false};
 const fail=reason=>{throw Error(reason);};
 const x=row.strategy_context,r=b.customer_review;
 if(!x||x.error||x.org_id!==Number(row.org_id)||x.lead?.org_id!==x.org_id||x.lead?.id!==Number(row.lead_id)||
  x.campaign?.id!==r?.campaign_id||x.campaign?.version!==r?.campaign_version||x.lead.id!==r?.lead_id||
  x.lead.email!==row.email||r.recipient!==row.email)fail('CUSTOMER_CONTEXT_CHANGED');
 if(x.suppressed!==false||x.replied!==false||(x.report?.trust?.conflicts||[]).length)fail('CUSTOMER_CONTACT_BLOCKED');
 if(b.version!=='strategy_v2'||b.state!=='template_completed'||b.validation_profile!=='customer_email_v1'||
  b.generation?.method!=='template'||b.generation?.source!=='customer_supplied'||r.required!==true||
  r.claim_provenance!=='customer_supplied_not_independently_verified'||typeof b.execution_authorized!=='boolean'||b.approval_required!==true||
  !Array.isArray(b.blocking_reasons)||b.blocking_reasons.length||!Array.isArray(b.validation_errors)||b.validation_errors.length)fail('CUSTOMER_PLAN_BLOCKED');
 const preview=render({org_id:x.org_id,lead:x.lead,campaign:{...x.campaign,org_id:x.org_id}});
 if(!preview.draft||preview.state!=='requires_review'||preview.preview_hash!==r.rendered_preview_hash)fail('CUSTOMER_RENDER_CHANGED');
 const d=preview.draft,a=b.artifacts,s=a?.schedule;
 const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
 const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
 if(!s||s.timezone!==d.timezone||!same(s.sending_window,d.sending_window)||s.delay_basis!=='previous_confirmed_send'||
  !Array.isArray(s.sequence)||s.sequence.length!==d.steps.length||!Array.isArray(a.followup_drafts)||a.followup_drafts.length!==d.steps.length-1||
  !Array.isArray(b.strategy?.followups)||b.strategy.followups.length!==d.steps.length-1)fail('CUSTOMER_SCHEDULE_CHANGED');
 for(const step of d.steps){
  const first=step.step===1,artifact=first?a.email_draft:a.followup_drafts[step.step-2];
  const part=(first?b.strategy.step1:b.strategy.followups[step.step-2]);
  if(!artifact||artifact.subject!==step.subject||artifact.body!==step.body||part?.channel!=='email'||!same(part.parts,[{type:'customer_supplied',ref:'customer_email_step_'+step.step,text:step.body}]))fail('CUSTOMER_MESSAGE_CHANGED');
  if(!first&&(artifact.step!==step.step||artifact.intent_index!==step.step-2||artifact.delay_days!==step.delay_days||artifact.channel!=='email'||artifact.status!=='requires_plan_approval_and_execution_checks'))fail('CUSTOMER_FOLLOWUP_CHANGED');
  const timing=s.sequence[step.step-1];
  if(!timing||timing.step!==step.step||timing.channel!=='email'||timing.delay_days!==step.delay_days||timing.condition!==step.condition||!same(timing.stop_on,step.stop_on))fail('CUSTOMER_SCHEDULE_CHANGED');
 }
 return {applicable:true,content_valid:true,execution_authorized:false};
}
module.exports={validate};
