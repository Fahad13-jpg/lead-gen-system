'use strict';
// Read-only draft adapter. No provider, credential loading or database mutations.
function draft(row){
 const b=row?.body;
 const step=row?.step===undefined?1:Number(row.step);
 if(!Number.isSafeInteger(step)||step<1||step>10||String(step)!==String(row?.step??1))throw Error('INVALID_EMAIL_STEP');
 const follow=step>1?b?.artifacts?.followup_drafts?.find(d=>d.step===step):null;
 const d=step===1?b?.artifacts?.email_draft:follow;
 const id=v=>typeof v==='string'&&/^[1-9][0-9]*$/.test(v)?Number(v):v;
 const org_id=id(row?.org_id),plan_id=id(row?.plan_id);
 if(!Number.isSafeInteger(org_id)||org_id<1||!Number.isSafeInteger(plan_id)||plan_id<1||!/^[a-f0-9]{32}$/.test(row.content_hash||''))throw Error('INVALID_PLAN_IDENTITY');
 if(b?.version!=='strategy_v2'||!['ai_completed','template_completed','template_fallback'].includes(b.state)||!Array.isArray(b.validation_errors)||b.validation_errors.length)throw Error('INVALID_PLAN');
 const selected=step===1?b.strategy?.step1:b.strategy?.followups?.[follow?.intent_index];
 if(selected?.channel!=='email'||!Array.isArray(selected.parts)||step>1&&follow?.status!=='requires_plan_approval_and_execution_checks')throw Error('NOT_APPROVED_EMAIL_STEP');
 if(!d||typeof d.subject!=='string'||!d.subject.trim()||d.subject.length>200||/[\r\n\x00]/.test(d.subject)||typeof d.body!=='string'||!d.body.trim())throw Error('APPROVED_EMAIL_ARTIFACT_REQUIRED');
 if(selected.parts.some(p=>typeof p?.text!=='string')||d.body!==selected.parts.map(p=>p.text).join('\n\n'))throw Error('EMAIL_ARTIFACT_MISMATCH');
 if(typeof row.email!=='string'||! /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(row.email))throw Error('INVALID_RECIPIENT');
 return {org_id,plan_id,step,content_hash:row.content_hash,to_email:row.email,subject_line:d.subject,email_body:d.body,execution_authorized:false,reason:'sender_mapping_and_transport_not_enabled'};
}
// A receipt is evidence of provider acceptance, not inbox delivery. Missing or
// ambiguous receipts must be reconciled, never treated as permission to resend.
function receipt(result){
 if(result&&!result.error&&typeof result.id==='string'&&/^[a-f0-9]{8,64}$/i.test(result.id))return {state:'provider_accepted',external_id:result.id,delivered:false,retry_allowed:false};
 return {state:'ambiguous',external_id:null,delivered:false,retry_allowed:false};
}
function executionDraft(row){
 const b=row?.body;
 if(b?.validation_profile==='customer_email_v1'||b?.generation?.source==='customer_supplied'||b?.customer_review?.required===true)
  require('../../organization-policy/customer-execution.cjs').validate(row);
 return draft(row);
}
module.exports={draft,executionDraft,receipt};
