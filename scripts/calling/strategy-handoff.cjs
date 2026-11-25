'use strict';
function readiness(input,now=new Date().toISOString()){
 const d=input?.campaign?.config?.call_dispatch,l=input?.lead,c=d?.connection;
 const who=d?.recipient_permissions?.[String(l?.id)];
 const future=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&Number.isFinite(Date.parse(now))&&Date.parse(v)>Date.parse(now);
 let timezone=false;try{if(typeof who?.timezone==='string'){new Intl.DateTimeFormat('en',{timeZone:who.timezone});timezone=true;}}catch{}
 const ready=Number.isSafeInteger(l?.org_id)&&l.org_id>0&&d?.enabled===true&&d.campaign_state==='running'&&d.language==='en'&&
  d.release?.enabled===true&&future(d.release.expires_at)&&c?.ready===true&&c.country==='US'&&
  typeof d.connection_ref==='string'&&!!d.connection_ref&&c.credential_ref===d.connection_ref&&
  c.route_verified===true&&c.caller_id_authorized===true&&c.voice_tested===true&&
  /^\+1[0-9]{10}$/.test(l.phone||'')&&who?.phone===l.phone&&who.country==='US'&&who.country_verified===true&&
  who.calling_eligible===true&&who.timezone_verified===true&&timezone&&future(who.expires_at)&&
  typeof who.permission_source_ref==='string'&&!!who.permission_source_ref&&typeof who.reviewed_by==='string'&&!!who.reviewed_by;
 return {status:ready?'ready':'blocked',reasons:ready?[]:['reviewed_call_connection_and_permission_required']};
}
// Generation-time handoff only, BEFORE saving/hashing/approval. Never update an
// already approved plan. This does not authorize any network request.
function handoff(plan,{integrationEnabled=false,config}={}){
 if(integrationEnabled!==true||plan?.strategy?.step1?.channel!=='call')return plan;
 if(plan.version!=='strategy_v2'||!['ai_completed','template_completed','template_fallback'].includes(plan.state)||
  plan.execution_authorized!==false||plan.approval_required!==true||
  !Array.isArray(plan.validation_errors)||plan.validation_errors.length||
  !Array.isArray(plan.blocking_reasons)||plan.blocking_reasons.some(r=>r!=='v2_offline_only'))return plan;
 const d=config?.call_dispatch,b=plan.artifacts?.call_brief;
 const text=v=>typeof v==='string'&&v.trim().length>0;
 if(d?.enabled!==true||d.campaign_state!=='running'||d.language!=='en'||d.release?.enabled!==true||
  d.connection?.ready!==true||!text(d.connection_ref)||d.connection.credential_ref!==d.connection_ref||
  !text(b?.opening?.text)||!text(b?.permission_question?.text))return plan;
 const result=JSON.parse(JSON.stringify(plan));
 result.blocking_reasons=result.blocking_reasons.filter(r=>r!=='v2_offline_only');
 result.artifacts.call_brief.integration='retell_requires_approval_and_runtime_checks';
 result.artifacts.call_brief.max_connected_seconds=60;
 result.artifacts.call_brief.target_connected_seconds=50;
 for(const draft of result.artifacts.followup_drafts||[]){
  if(draft.channel==='call'&&draft.status==='requires_plan_approval_and_execution_checks'&&Number.isInteger(draft.step)&&
   typeof draft.body==='string'&&draft.body.trim()&&draft.body.length<=1500){
   draft.call_brief={...result.artifacts.call_brief,after_permission:draft.body,sequence_step:draft.step};
  }
 }
 result.execution_authorized=false;
 return result;
}
module.exports={handoff,readiness};
