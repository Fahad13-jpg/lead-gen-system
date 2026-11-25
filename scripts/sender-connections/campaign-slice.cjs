'use strict';
const assert=require('node:assert/strict');
function validate(s,now=Date.now()){
 assert(s?.format==='email_campaign_slice_v1','CAMPAIGN_SLICE_REQUIRED');
 assert.deepEqual(Object.keys(s).sort(),['format','binding','authority','plan','target_step','expires_at'].sort(),'SLICE_FIELDS_CHANGED');
 assert(Number.isSafeInteger(s.binding?.org_id)&&s.binding.org_id>0&&typeof s.binding.email==='string'&&/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(s.binding.email)&&typeof s.binding.credential_ref==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(s.binding.credential_ref),'SLICE_BINDING_REQUIRED');
 const a=s.authority;assert(a&&Object.keys(a).sort().join(',')==='campaign_id,campaign_version,revision,scope_hash,slice_id','AUTHORITY_FIELDS_CHANGED');
 assert([a.campaign_id,a.campaign_version,a.revision].every(v=>Number.isSafeInteger(v)&&v>0)&&/^[a-f0-9]{32}$/.test(a.scope_hash)&&/^[a-f0-9]{32}$/.test(a.slice_id),'CURRENT_AUTHORITY_REQUIRED');
 assert(Number.isInteger(s.target_step)&&s.target_step>=1&&s.target_step<=10,'EXACT_STEP_REQUIRED');
 const p=s.plan;assert(p&&Object.keys(p).sort().join(',')==='content_hash,plan_id,recipient'&&Number.isSafeInteger(p.plan_id)&&p.plan_id>0&&/^[a-f0-9]{32}$/.test(p.content_hash)&&typeof p.recipient==='string'&&p.recipient===p.recipient.trim().toLowerCase()&&/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(p.recipient),'EXACT_PLAN_REQUIRED');
 const expires=Date.parse(s.expires_at);assert(Number.isFinite(expires)&&expires>now&&expires-now<=86400000,'SHORT_SLICE_EXPIRY_REQUIRED');return s;
}
// Self-contained so the exact same guard can be embedded in an n8n Code node.
function allows(row,s,now=Date.now()){
 return s?.format==='email_campaign_slice_v1'&&Number.isFinite(Date.parse(s.expires_at))&&now<Date.parse(s.expires_at)&&Number(row?.org_id)===s.binding.org_id&&Number(row.plan_id)===s.plan.plan_id&&row.content_hash===s.plan.content_hash&&row.email===s.plan.recipient&&Number(row.step)===s.target_step;
}
function authority(s){return s?.format==='email_campaign_slice_v1'?{...s.authority,target_step:s.target_step,expires_at:s.expires_at}:undefined;}
module.exports={validate,allows,authority};
