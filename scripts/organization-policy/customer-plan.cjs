'use strict';
// Locally bundled bridge into strategy_v2 storage/handoff; NOT deployed or send-enabled.
// Customer content has its own validation profile; it never becomes AI evidence.
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const {render}=require('./customer-email-template.cjs');
const {hash,approvalPreflight}=require('../lead-strategy/v2/contract.cjs');
const runtime=require('../lead-strategy/runtime.cjs');
const identity=v=>Number.isSafeInteger(v)&&v>0;
function build(claim,{integrationEnabled=false}={}){
 assert(typeof integrationEnabled==='boolean','INVALID_CUSTOMER_RELEASE_FLAG');
 const input=claim?.input,campaign=input?.campaign,lead=input?.lead;
 assert(identity(claim?.id)&&identity(claim?.org_id),'INVALID_CLAIM');
 assert(typeof claim.lease==='string'&&claim.lease.length>0&&claim.lease.length<=200,'INVALID_LEASE');
 assert(identity(lead?.id)&&claim.org_id===lead.org_id&&input.org_id===claim.org_id,'ORG_MISMATCH');
 assert(campaign?.org_id===undefined||campaign.org_id===claim.org_id,'CAMPAIGN_ORG_MISMATCH');
 assert(identity(campaign?.id)&&identity(campaign?.version),'INVALID_CAMPAIGN');
 assert(/^[a-f0-9]{32}$/.test(input.fingerprint||''),'DATABASE_FINGERPRINT_REQUIRED');
 const preview=render({org_id:claim.org_id,lead,campaign:{org_id:claim.org_id,config:campaign.config}});
 assert(preview.state==='requires_review'&&preview.draft,'CUSTOMER_TEMPLATE_INVALID '+(preview.validation_errors||[]).map(v=>v.code+':'+v.field).join(','));
 const draft=preview.draft;
 const qualification=runtime.qualify(input.report?.basic?.signals,campaign.config.offer_profile,campaign.config.offer?.approved_points||[],input.report?.trust||{});
 const parts=s=>[{type:'customer_supplied',ref:'customer_email_step_'+s.step,text:s.body}];
 const followups=draft.steps.slice(1).map(s=>({channel:'email',intent:'Customer-defined follow-up; use the exact approved message.',parts:parts(s)}));
 const blocking=integrationEnabled?[]:['customer_template_integration_offline_only'];
 if(input.suppressed!==false)blocking.push('suppression_check_required');
 if(input.replied!==false)blocking.push('reply_check_required');
 if(input.report?.trust?.conflicts?.length)blocking.push('business_conflict');
 const body={version:'strategy_v2',state:'template_completed',validation_profile:'customer_email_v1',
  qualification,generation:{method:'template',model:null,prompt_version:null,attempts:0,tokens:{prompt:0,completion:0,total:0},source:'customer_supplied'},
  input_hash:hash(input),approval_required:true,execution_authorized:false,fallback_acknowledgement_required:false,
  validation_errors:[],blocking_reasons:blocking,
  customer_review:{required:true,claim_provenance:preview.claim_provenance,rendered_preview_hash:preview.preview_hash,
   campaign_id:campaign.id,campaign_version:campaign.version,lead_id:lead.id,recipient:draft.recipient},
  strategy:{fit:qualification.fit,fit_notes:['Customer-defined content; claims and business need require human review.'],angle_id:null,
   channel_plan:[{channel:'email',reason:'Explicit customer-selected channel.'}],step1:{channel:'email',parts:parts(draft.steps[0])},
   followups,call_guidance:null,review_flags:['customer_claims_require_review'],personalization_level:'category_level'},
  artifacts:{email_draft:{subject:draft.steps[0].subject,body:draft.steps[0].body,integration:'draft_only'},
   followup_drafts:draft.steps.slice(1).map((s,i)=>({intent_index:i,step:s.step,channel:'email',delay_days:s.delay_days,
    subject:s.subject,body:s.body,status:'requires_plan_approval_and_execution_checks',method:'template',execution_authorized:false})),
   call_brief:null,whatsapp_draft:null,
   schedule:{timezone:draft.timezone,sending_window:draft.sending_window,sequence:draft.steps.map(s=>({step:s.step,channel:s.channel,delay_days:s.delay_days,condition:s.condition,stop_on:s.stop_on})),
    delay_basis:'previous_confirmed_send',timing_enforced:false,execution_authorized:false}},
  limitations:preview.limitations};
 body.content_hash=hash(body); // Existing LOCAL hash convention; SQL assigns its own md5(body::text).
 return {id:claim.id,org_id:claim.org_id,lease:claim.lease,plan:body,ai_status:'template_completed',usage:{prompt_tokens:0,completion_tokens:0,total_tokens:0,usage_complete:true}};
}
function verify(claim,payload,options){
 // Re-render from trusted context. A caller cannot clear a blocker, change the
 // recipient or manufacture a new local hash to pass this check.
 try{assert(hash(payload)===hash(build(claim,options)),'CUSTOMER_PLAN_OR_CONTEXT_CHANGED');return {ok:true,execution_authorized:false,approval:approvalPreflight(payload.plan)};}
 catch{return {ok:false,reason:'CUSTOMER_PLAN_OR_CONTEXT_CHANGED',execution_authorized:false};}
}
module.exports={build,verify};
