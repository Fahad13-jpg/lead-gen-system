'use strict';
// Pure validation. OAuth secrets belong in n8n credentials, never campaign JSON.
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const email=v=>typeof v==='string'&&v===v.trim().toLowerCase()&&/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(v);
const id=v=>/^[1-9][0-9]*$/.test(String(v))&&Number.isSafeInteger(Number(v));
function validate(policy){
 const errors=[];
 if(!object(policy))return {valid:false,errors:['sender_policy_missing']};
 const allowed=new Set(['enabled','credential_ref','sender_email','daily_limit','mailbox_rolling_limit','min_interval_seconds']);
 if(Object.keys(policy).some(k=>!allowed.has(k)))errors.push('unsupported_policy_field');
 if(typeof policy.enabled!=='boolean')errors.push('enabled_must_be_boolean');
 if(typeof policy.credential_ref!=='string'||!policy.credential_ref.trim()||policy.credential_ref.length>200||/[\x00-\x20\x7f]/.test(policy.credential_ref))errors.push('credential_reference_required');
 if(!email(policy.sender_email))errors.push('canonical_sender_email_required');
 for(const [key,max] of [['daily_limit',9999],['mailbox_rolling_limit',9999],['min_interval_seconds',99999]]){
  if(!Number.isInteger(policy[key])||policy[key]<1||policy[key]>max)errors.push(key+'_required');
 }
 return {valid:errors.length===0,errors};
}
function select(row,binding,actualCredential){
 if(!object(binding)||!id(binding.org_id)||!email(binding.email)||binding.credential_ref!==actualCredential)return {ready:false,reason:'mailbox_binding_required'};
 if(!id(row?.org_id)||String(row.org_id)!==String(binding.org_id))return {ready:false,reason:'organization_mismatch'};
 const p=row.sender_policy,v=validate(p);
 if(!v.valid)return {ready:false,reason:'sender_policy_invalid',errors:v.errors};
 if(p.enabled!==true)return {ready:false,reason:'sender_disabled'};
 if(p.credential_ref!==binding.credential_ref||p.sender_email!==binding.email)return {ready:false,reason:'sender_policy_mismatch'};
 return {ready:true,sender:{org_id:Number(row.org_id),email:p.sender_email,credential_ref:p.credential_ref}};
}
function draft(input){
 if(!object(input)||!id(input.org_id))throw Error('ORGANIZATION_REQUIRED');
 const policy={enabled:false,credential_ref:input.credential_ref,sender_email:input.sender_email,
 daily_limit:input.daily_limit,mailbox_rolling_limit:input.mailbox_rolling_limit,min_interval_seconds:input.min_interval_seconds};
 // Reject accidental secret fields rather than copying or logging their values.
 if(Object.keys(input).some(k=>!['org_id',...Object.keys(policy)].includes(k)))throw Error('UNSUPPORTED_SETUP_FIELD');
 const v=validate(policy);if(!v.valid)throw Error(v.errors.join(','));
 return {org_id:Number(input.org_id),email_dispatch:policy,binding:{org_id:Number(input.org_id),email:policy.sender_email,credential_ref:policy.credential_ref},
 status:'draft_requires_account_verification_and_release_review',execution_authorized:false};
}
module.exports={validate,select,draft};
