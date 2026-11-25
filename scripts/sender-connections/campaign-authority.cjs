'use strict';
// Pure contract and renewal decisions. No clocks/providers/storage are implicit.
const assert=require('node:assert/strict');
const canonical=value=>JSON.stringify(value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(canonical(value[k]))])):Array.isArray(value)?value.map(v=>JSON.parse(canonical(v))):value);
const id=v=>Number.isSafeInteger(v)&&v>0;
const hash=v=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
function scope(snapshot,{plan_ids,end_at},now){
 assert(id(snapshot?.org_id)&&id(snapshot.campaign_id)&&id(snapshot.campaign_version)&&hash(snapshot.config_hash),'CURRENT_CAMPAIGN_REQUIRED');
 assert(snapshot.membership_active===true&&['owner','admin'].includes(snapshot.role),'CAMPAIGN_OWNER_REQUIRED');
 assert(snapshot.sender_ready===true,'CURRENT_SENDER_REQUIRED');
 const end=Date.parse(end_at);assert(Number.isFinite(end)&&end>now,'FUTURE_END_REQUIRED');
 assert(Array.isArray(plan_ids)&&plan_ids.length>0&&plan_ids.length<=10&&plan_ids.every(id)&&new Set(plan_ids).size===plan_ids.length,'EXACT_PLANS_REQUIRED');
 const sequence=snapshot.sequence;assert(Array.isArray(sequence)&&sequence.length>0&&sequence.length<=10,'APPROVED_SEQUENCE_REQUIRED');
 sequence.forEach((s,i)=>assert(s.step===i+1&&s.channel==='email'&&Number.isInteger(s.delay_days)&&s.delay_days>=0&&s.delay_days<=60&&(i!==0||s.delay_days===0),'EMAIL_SEQUENCE_REQUIRED'));
 const b=snapshot.sender_binding;assert(b&&typeof b.connection_id==='string'&&id(b.version)&&['gmail','smtp'].includes(b.provider)&&typeof b.email==='string'&&typeof b.credential_ref==='string','SENDER_BINDING_REQUIRED');
 const plans=plan_ids.map(plan_id=>{const p=snapshot.plans?.find(p=>p.plan_id===plan_id);assert(p&&p.integrity_matches===true&&p.approval_current===true&&p.campaign_version===snapshot.campaign_version&&hash(p.content_hash)&&p.context_current===true,'CURRENT_APPROVED_PLAN_REQUIRED');assert(Date.parse(p.expires_at)>=end,'END_EXCEEDS_PLAN_EXPIRY');assert(typeof p.recipient==='string'&&p.recipient===p.recipient.trim().toLowerCase()&&/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(p.recipient),'CANONICAL_RECIPIENT_REQUIRED');assert(canonical(p.sequence)===canonical(sequence),'APPROVED_SEQUENCE_CHANGED');return{plan_id,content_hash:p.content_hash,recipient:p.recipient};});
 return{format:'email_campaign_authority_v1',org_id:snapshot.org_id,campaign_id:snapshot.campaign_id,campaign_version:snapshot.campaign_version,config_hash:snapshot.config_hash,sender_binding:structuredClone(b),sequence:structuredClone(sequence),plans,end_at:new Date(end).toISOString()};
}
function decide(record,snapshot,plan_id,{enabled=false,now}={}){
 const stopped=reason=>({renew:false,reason,execution_authorized:false});
 if(!enabled)return stopped('automatic_renewal_disabled');
 if(!record||record.status!=='approved'||record.scope_hash_verified!==true||!hash(record.scope_hash)||!id(record.revision))return stopped('campaign_approval_required');
 if(typeof record.actor_subject!=='string'||!/^[a-f0-9]{64}$/.test(record.actor_subject)||record.actor_subject!==snapshot?.actor_subject)return stopped('approval_actor_changed');
 const approved=record.scope;
 if(!Number.isFinite(now)||!approved||Date.parse(approved.end_at)<=now)return stopped('campaign_approval_expired');
 const plan=approved.plans.find(p=>p.plan_id===plan_id),current=snapshot.plans.find(p=>p.plan_id===plan_id);if(!plan||!current)return stopped('plan_not_approved');
 if(current.suppressed!==false||current.replied!==false||current.bounced!==false||current.stopped!==false)return stopped('lead_stopped_or_unconfirmed');
 let expected;try{expected=scope({...snapshot,plans:[current]},{plan_ids:[plan_id],end_at:approved.end_at},now);}catch{return stopped('campaign_or_plan_changed');}
 if(canonical(expected)!==canonical({...approved,plans:[plan]}))return stopped('campaign_or_plan_changed');
 if(!Array.isArray(current.activities))return stopped('activity_history_unconfirmed');
 const activities=current.activities;let parent=null;
 for(const step of approved.sequence){
  const matching=activities.filter(a=>a.step===step.step);if(matching.length>1)return stopped('duplicate_activity_requires_review');const event=matching[0];
  if(event){if(event.state!=='provider_accepted'||event.content_hash!==plan.content_hash||event.recipient!==plan.recipient||event.sender_email!==approved.sender_binding.email||event.credential_ref!==approved.sender_binding.credential_ref||!event.external_id||!Number.isFinite(Date.parse(event.sent_at))||Date.parse(event.sent_at)>now)return stopped('existing_activity_requires_reconciliation');parent=event;continue;}
  if(activities.some(a=>!Number.isInteger(a.step)||a.step>step.step))return stopped('out_of_order_activity_requires_review');
  const due=parent?Date.parse(parent.sent_at)+step.delay_days*86400000:now;
  if(due>now)return{...stopped('waiting_approved_delay'),due_at:new Date(due).toISOString()};
  const gate=current.step_checks?.[String(step.step)];if(gate?.ready!==true)return stopped('step_eligibility_not_confirmed');
  const expires=Math.min(now+86400000,Date.parse(approved.end_at),Date.parse(current.expires_at));if(expires<=now)return stopped('campaign_approval_expired');
  return{renew:true,authority_revision:record.revision,authority_hash:record.scope_hash,org_id:approved.org_id,campaign_id:approved.campaign_id,campaign_version:approved.campaign_version,plan_id,content_hash:plan.content_hash,recipient:plan.recipient,target_step:step.step,due_at:new Date(due).toISOString(),expires_at:new Date(expires).toISOString(),execution_authorized:false};
 }
 return stopped('approved_sequence_complete');
}
module.exports={scope,decide,canonical};
