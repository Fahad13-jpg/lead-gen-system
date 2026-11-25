'use strict';
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const text=(v,n=500)=>typeof v==='string'?v.replace(/[\p{Cc}\p{Cf}]/gu,' ').slice(0,n):null;
const list=(v,n=10)=>Array.isArray(v)?v.slice(0,n):[];
const parts=v=>list(v).map(p=>({type:text(p?.type,30),ref:text(p?.ref,80),text:text(p?.text,1000)}));
const manualText=(v,n)=>typeof v==='string'&&v.length<=n?v:null;
const count=v=>Number.isSafeInteger(v)&&v>=0?v:null;
function failureCode(v){
 const known=['UNKNOWN_ANGLE','PROVIDER_ERROR','PROVIDER_RATE_LIMITED','TRUNCATED_OUTPUT','INCOMPLETE_OUTPUT','SCHEMA_REPAIR_NOT_RESERVED','FIT_OVERRIDE','CHANNEL_NOT_PERMITTED','INVALID_STEP1','MISSING_REVIEW_FLAG','MISSING_THIN_EVIDENCE_FLAG','MISSING_CONFLICT_FLAG','MISSING_LANGUAGE_REVIEW_FLAG','INVALID_FACT_REF','INVALID_BENEFIT_REF','UNSUPPORTED_CLAIM_OR_COPY','UNSCOPED_ABSENCE','PROHIBITED_CLAIM','URL_NOT_ALLOWED'];
 if(known.includes(v))return v;
 if(['weak_offer_fit','fit_not_established','offer_relevance_unproven'].some(flag=>v==='MISSING_QUALITY_FLAG:'+flag))return v;
 if(['ai_disabled','monthly_limit','daily_limit','rate_limit','stale_lease','already_reserved','template_or_insufficient_evidence'].includes(v))return v;
 return v?'GENERATION_FAILED':null;
}
function review(row){
 const b=obj(row.body),s=obj(b.strategy),g=obj(b.generation),q=obj(b.qualification);
 return{id:row.id,lead_id:row.lead_id,company_name:text(row.company_name,255),campaign_version:row.campaign_version,created_at:row.created_at,expires_at:row.expires_at,expired:row.expired,approval_action:row.approval_action,approval_hash_matches:row.approval_hash_matches,integrity_matches:row.integrity_matches,
 content_hash:row.content_hash,sms_draft:obj(b.artifacts).sms_draft?.version==='sms_draft_v1'?{recipient:text(obj(b.artifacts).sms_draft.recipient,30),message:manualText(obj(b.artifacts).sms_draft.message,306),segments:count(obj(b.artifacts).sms_draft.segments),encoding:text(obj(b.artifacts).sms_draft.encoding,20)}:null,linkedin_manual:obj(b.artifacts).linkedin_manual?.version==='linkedin_manual_v1'?{profile_url:/^https:\/\/www\.linkedin\.com\/in\/[a-z0-9_-]+\/$/.test(obj(b.artifacts).linkedin_manual.target?.profile_url||'')?obj(b.artifacts).linkedin_manual.target.profile_url:null,steps:list(obj(b.artifacts).linkedin_manual.steps).map(d=>({step:count(d?.step),delay_days:count(d?.delay_days),connection_note:manualText(d?.connection_note,200),message:manualText(d?.message,500)})).filter(d=>d.step>=1&&d.step<=10)}:null,customer_content_acknowledgement_required:b.validation_profile==='customer_email_v1'||g.source==='customer_supplied'||b.customer_review?.required===true,
 failure_reason:b.state==='ai_failed'?failureCode(g.failure_reason):null,
 generation_details:{attempts:count(g.attempts),tokens:{prompt:count(g.tokens?.prompt),completion:count(g.tokens?.completion),total:count(g.tokens?.total)},usage_complete:g.usage_complete===true},
 version:text(b.version,40),state:text(b.state,80),fit:text(q.fit,30),method:text(g.method,40),model:text(g.model,100),prompt_version:text(g.prompt_version,80),fallback_acknowledgement_required:b.fallback_acknowledgement_required===true||b.state==='template_fallback',
 fit_notes:list(s.fit_notes,4).map(v=>text(v)),review_flags:list(s.review_flags,12).map(v=>text(v,100)),blocking_reasons:list(b.blocking_reasons,20).map(v=>text(v,140)),validation_errors:list(b.validation_errors,20).map(v=>text(v,140)),personalization_level:text(s.personalization_level,60),
 channel_plan:list(s.channel_plan,5).map(p=>({channel:text(p?.channel,30),reason:text(p?.reason)})),step1:s.step1?{channel:text(s.step1.channel,30),parts:parts(s.step1.parts)}:null,
 followups:list(s.followups,4).map(f=>({channel:text(f?.channel,30),intent:text(f?.intent,160),parts:parts(f?.parts)})),call_guidance:s.call_guidance?{opening:text(s.call_guidance.opening?.text,1000),permission_question:text(s.call_guidance.permission_question?.text,1000),objections:list(s.call_guidance.objections,4).map(o=>({kind:text(o?.kind,50),response:text(o?.response?.text,1000)}))}:null};
}
module.exports={review};
