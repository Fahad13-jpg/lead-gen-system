'use strict';
function approvalLoader(pool){return async(org,id)=>{
 const row=(await pool.query(`SELECT p.content_hash,md5(p.body::text)=p.content_hash AS intact,
   p.expires_at>now() AND p.fingerprint=(strategy_context(p.org_id,p.campaign_id,p.lead_id)->>'fingerprint') AS current,
   p.body->>'state' AS state,p.body->>'version' AS version,
   p.body->>'validation_profile'='customer_email_v1' OR p.body->'generation'->>'source'='customer_supplied' OR p.body->'customer_review'->>'required'='true' AS customer_content,
   p.body->>'validation_profile'='customer_email_v1' AND p.body->>'state'='template_completed' AND p.body->'generation'->>'source'='customer_supplied' AND p.body->'customer_review'->'required'='true'::jsonb AND p.body->'customer_review'->>'claim_provenance'='customer_supplied_not_independently_verified' AS customer_valid,
   p.body->>'state'='template_fallback' OR p.body->>'fallback_acknowledgement_required'='true' AS fallback,
   CASE WHEN jsonb_typeof(p.body->'validation_errors')='array' AND jsonb_typeof(p.body->'blocking_reasons')='array'
   THEN jsonb_array_length(p.body->'validation_errors')=0 AND jsonb_array_length(p.body->'blocking_reasons')=0 ELSE false END AS clear
   FROM strategy_plans p WHERE p.org_id=${org} AND p.id=${id}`)).rows[0];return row;};}
function approvalService({identity,load,transport}){return async(token,body)=>{
 if(!body||Object.keys(body).some(k=>!['org_id','plan_id','action','content_hash','acknowledge_fallback','acknowledge_customer_content'].includes(k))||![body.org_id,body.plan_id].every(v=>Number.isSafeInteger(v)&&v>0)||!['approve','revoke'].includes(body.action)||!/^[a-f0-9]{32}$/.test(body.content_hash||''))throw Error('INVALID_FILTER');
 const actor=await identity.principal(token,body.org_id);if(!['owner','admin'].includes(actor.role))throw Error('ROLE_REQUIRED');
 let p;try{p=await load(body.org_id,body.plan_id);}catch{throw Error('APPROVAL_CHECK_UNAVAILABLE');}if(!p||p.content_hash!==body.content_hash)throw Error('APPROVAL_CONTENT_CHANGED');
 if(body.action==='approve'){
  if(p.intact!==true||p.current!==true||p.clear!==true||p.version!=='strategy_v2'||!['ai_completed','template_completed','template_fallback'].includes(p.state))throw Error('APPROVAL_PLAN_BLOCKED');
  if(p.customer_content&&p.customer_valid!==true)throw Error('APPROVAL_PLAN_BLOCKED');
  if(p.fallback&&body.acknowledge_fallback!==true||p.customer_content&&body.acknowledge_customer_content!==true)throw Error('APPROVAL_ACK_REQUIRED');
 }
 const payload={org_id:body.org_id,plan_id:body.plan_id,content_hash:p.content_hash,action:body.action,actor:'dashboard:'+actor.subject,
  ...(body.acknowledge_fallback===true?{acknowledge_fallback:true,acknowledge_fallback_hash:p.content_hash}:{}),...(body.acknowledge_customer_content===true?{acknowledge_customer_content:true,acknowledge_customer_content_hash:p.content_hash}:{})};
 let r;try{r=await transport('strategy-approval',payload);}catch{throw Error('APPROVAL_UNCONFIRMED');}
 if(r?.status>=200&&r.status<300&&r.body?.approved_content===(body.action==='approve')&&r.body.execution_authorized===false)return{recorded:true,action:body.action,execution_authorized:false};
 if(['CONTENT_CHANGED','STALE_PLAN','PLAN_NEEDS_CORRECTION','AI_FAILED','FALLBACK_ACK_REQUIRED','CUSTOMER_CONTENT_ACK_REQUIRED','INVALID_CUSTOMER_REVIEW','NOT_FOUND'].includes(r?.body?.error))throw Error('APPROVAL_PLAN_BLOCKED');
 throw Error('APPROVAL_UNCONFIRMED');
};}
module.exports={approvalLoader,approvalService};
