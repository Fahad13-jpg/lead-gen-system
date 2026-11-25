'use strict';
// Advisory snapshot only. Never reserves, changes policy, installs or activates.
const policies=require('../lead-strategy/v2/sender-policy.cjs');
const rollout=require('../lead-strategy/v2/email-rollout.cjs');
const safeReason=v=>typeof v==='string'&&/^[a-z][a-z0-9_]{0,99}$/.test(v)?v:'dispatch_check_unconfirmed';
function assess(snapshot,{org,campaign,version,ids,subject,step=1,now=Date.now()}){
 if(![1,2].includes(step))throw Error('INVALID_FILTER');
 const reasons=[],c=snapshot?.config,s=snapshot?.sender,ref=c?.sender_connection,p=c?.email_dispatch;
 if(!snapshot||snapshot.org_id!==org||String(snapshot.id)!==String(campaign))return{found:false,execution_authorized:false};
 if(snapshot.version!==version)reasons.push('campaign_version_changed');
 if(!policies.validate(p).valid)reasons.push('sender_policy_invalid');
 if(p?.enabled!==true)reasons.push('email_policy_paused');
 if(!s||!ref)reasons.push('sender_not_bound');
 else{
  if(s.sharing!=='team'&&s.owner_subject!==subject)reasons.push('sender_private');
  const checked=Date.parse(s.checked_at);
  if(s.state!=='ready'||s.send_capable!==true||s.reply_capable!==true||!Number.isFinite(checked)||checked>now||now-checked>86400000)reasons.push('sender_connection_not_ready');
  if(s.member_active!==true)reasons.push('sender_membership_revoked');
  if(s.org_id!==org||s.connection_id!==ref.connection_id||s.version!==ref.version||s.provider!==ref.provider||s.credential_ref!==p?.credential_ref||s.email!==p?.sender_email)reasons.push('sender_connection_changed');
  if(!['gmail','smtp'].includes(s.provider))reasons.push('email_provider_unsupported');
  if(![s.daily_limit,s.mailbox_rolling_limit,s.min_interval_seconds].every(n=>Number.isInteger(n)&&n>0)||!p||p.daily_limit>s.daily_limit||p.mailbox_rolling_limit>s.mailbox_rolling_limit||p.min_interval_seconds<s.min_interval_seconds)reasons.push('sender_limit_mismatch');
 }
 if(p&&(p.daily_limit>10||p.mailbox_rolling_limit>10||p.min_interval_seconds<300))reasons.push('bounded_rollout_limits_required');
 const rows=Array.isArray(snapshot.plans)?snapshot.plans:[];
 const plans=ids.map(id=>{
  const r=rows.find(row=>String(row.id)===String(id)),blocks=[];
  if(!r)return{plan_id:id,ready:false,reasons:['plan_not_available']};
  if(r.campaign_version!==version)blocks.push('plan_campaign_changed');
  if(r.integrity_matches!==true)blocks.push('content_changed');
  if(!/^[a-f0-9]{32}$/.test(r.content_hash||''))blocks.push('content_hash_invalid');
  if(r.approval_action!=='approve'||r.approval_hash_matches!==true)blocks.push('approval_required');
  if(!Number.isFinite(Date.parse(r.expires_at))||Date.parse(r.expires_at)<=now)blocks.push('stale_plan');
  if(r.dispatch_check?.ready!==true)blocks.push(safeReason(r.dispatch_check?.reason));
  if(r.attempt_recorded!==false)blocks.push('dispatch_already_reserved_or_recorded');
  if(step===2&&r.parent_accepted!==true)blocks.push('previous_confirmed_send_required');
  if(step===2&&r.parent_sender_matches!==true)blocks.push('previous_sender_or_recipient_changed');
  if(!policies.validate({enabled:false,credential_ref:'fixture',sender_email:r.email,daily_limit:10,mailbox_rolling_limit:10,min_interval_seconds:300}).valid)blocks.push('recipient_email_invalid');
  return{plan_id:id,recipient:r.email,content_hash:r.content_hash,expires_at:r.expires_at,max_step:step,ready:blocks.length===0,reasons:[...new Set(blocks)]};
 });
 const ready=reasons.length===0&&plans.every(p=>p.ready);
 let expires=null;
 if(ready){expires=new Date(Math.min(now+86400000,...plans.map(p=>Date.parse(p.expires_at)))).toISOString();try{rollout.validate({binding:{org_id:org,email:s.email,credential_ref:s.credential_ref},expires_at:expires,plans:plans.map(({plan_id,recipient,content_hash,max_step})=>({plan_id,recipient,content_hash,max_step}))},now);}catch{reasons.push('release_contract_invalid');}}
 const candidate=ready&&reasons.length===0;
 return{found:true,campaign_id:String(campaign),campaign_version:snapshot.version,ready_for_operator_review:candidate,execution_authorized:false,
  reasons:[...new Set(reasons)],plans,sender:s?{connection_id:s.connection_id,version:s.version,provider:s.provider,email:s.email,state:s.state}:null,
  limits:p?{daily:p.daily_limit,rolling_24h:p.mailbox_rolling_limit,spacing_seconds:p.min_interval_seconds}:null,
  review_packet:candidate?{kind:step===2?'email_followup_batch_review_v1':'email_batch_review_v1',org_id:org,campaign_id:String(campaign),campaign_version:version,sender_connection_id:s.connection_id,sender_version:s.version,expires_at:expires,plans:plans.map(({plan_id,recipient,content_hash,max_step})=>({plan_id,recipient,content_hash,max_step})),execution_authorized:false}:null,
  limitations:['advisory_snapshot_only','operator_release_and_schedule_review_required','runtime_rechecks_required','provider_not_contacted','quota_not_reserved','sending_window_not_evaluated',step===2?'second_message_only':'first_messages_only'],observed_at:new Date(now).toISOString()};
}
function service({pool,identity,now=Date.now}){return async(token,p)=>{
 if(!p||Object.keys(p).some(k=>!['org_id','campaign_id','campaign_version','plan_ids','step'].includes(k)))throw Error('INVALID_FILTER');
 const int=v=>/^[1-9][0-9]*$/.test(String(v))&&Number.isSafeInteger(Number(v));
 if(![p.org_id,p.campaign_id,p.campaign_version].every(int)||Number(p.org_id)>2147483647||typeof p.plan_ids!=='string'||!/^\d+(,\d+){0,9}$/.test(p.plan_ids))throw Error('INVALID_FILTER');
 const step=p.step===undefined?1:Number(p.step);if(![1,2].includes(step)||p.step!==undefined&&!/^[12]$/.test(String(p.step)))throw Error('INVALID_FILTER');
 const ids=p.plan_ids.split(',').map(Number);if(ids.some(v=>!int(v))||new Set(ids).size!==ids.length)throw Error('INVALID_FILTER');
 const org=Number(p.org_id),campaign=Number(p.campaign_id),version=Number(p.campaign_version),principal=await identity.principal(token,org);
 if(principal.org_id!==org||!['owner','admin'].includes(principal.role))throw Error('ROLE_REQUIRED');if(!/^[a-f0-9]{64}$/.test(principal.subject||''))throw Error('AUTHENTICATION_FAILED');
 const snapshot=await loader(pool)(org,campaign,ids,step);
 return assess(snapshot,{org,campaign,version,ids,subject:principal.subject,step,now:now()});
};}
function loader(pool){return async(org,campaign,ids,step=1)=>{
 if(![1,2].includes(step))throw Error('INVALID_FILTER');
 if(![org,campaign,...ids].every(v=>Number.isSafeInteger(v)&&v>0)||ids.length<1||ids.length>10)throw Error('INVALID_FILTER');
 const snapshot=(await pool.query(`WITH campaign AS (SELECT c.id,c.org_id,c.version,v.config FROM strategy_campaigns c JOIN strategy_campaign_versions v ON v.org_id=c.org_id AND v.campaign_id=c.id AND v.version=c.version WHERE c.org_id=${org} AND c.id=${campaign}),
 selected AS (SELECT p.id,p.campaign_version,p.content_hash,p.expires_at,l.email,md5(p.body::text)=p.content_hash AS integrity_matches,a.action AS approval_action,a.content_hash=p.content_hash AS approval_hash_matches,
 EXISTS(SELECT 1 FROM outreach_activities e WHERE e.org_id=p.org_id AND e.dispatch_metadata->>'plan_id'=p.id::text AND e.dispatch_metadata->>'step'='${step}') AS attempt_recorded,
 EXISTS(SELECT 1 FROM outreach_activities e WHERE e.org_id=p.org_id AND e.lead_id=p.lead_id AND e.dispatch_metadata->>'plan_id'=p.id::text AND e.dispatch_metadata->>'step'='1' AND e.dispatch_metadata->>'content_hash'=p.content_hash AND e.dispatch_metadata->>'state'='provider_accepted' AND nullif(e.external_id,'') IS NOT NULL AND e.sent_at IS NOT NULL AND e.sent_at AT TIME ZONE 'UTC'<=now()) AS parent_accepted,
 EXISTS(SELECT 1 FROM outreach_activities e WHERE e.org_id=p.org_id AND e.lead_id=p.lead_id AND e.dispatch_metadata->>'plan_id'=p.id::text AND e.dispatch_metadata->>'step'='1' AND e.dispatch_metadata->>'content_hash'=p.content_hash AND e.dispatch_metadata->>'state'='provider_accepted' AND nullif(e.external_id,'') IS NOT NULL AND e.sent_at IS NOT NULL AND e.sent_at AT TIME ZONE 'UTC'<=now() AND e.dispatch_metadata->>'sender_email'=c.config#>>'{email_dispatch,sender_email}' AND e.dispatch_metadata->>'credential_ref'=c.config#>>'{email_dispatch,credential_ref}' AND e.dispatch_metadata->>'recipient_email'=l.email) AS parent_sender_matches,
 outreach_email_step_check(jsonb_build_object('org_id',p.org_id,'plan_id',p.id,'content_hash',p.content_hash,'step',${step})) AS dispatch_check
 FROM strategy_plans p JOIN campaign c ON c.org_id=p.org_id AND c.id=p.campaign_id LEFT JOIN cleaned_leads l ON l.org_id=p.org_id AND l.id=p.lead_id
 LEFT JOIN LATERAL(SELECT action,content_hash FROM strategy_approvals WHERE org_id=p.org_id AND plan_id=p.id ORDER BY id DESC LIMIT 1)a ON true WHERE p.id IN (${ids.join(',')}))
 SELECT c.*,(SELECT to_jsonb(s) || jsonb_build_object('member_active',EXISTS(SELECT 1 FROM org_sender_memberships m WHERE m.org_id=c.org_id AND m.subject=c.config#>>'{sender_connection,subject}' AND m.active)) FROM (SELECT org_id,connection_id,version,provider,email,credential_ref,inbox_credential_ref,owner_subject,sharing,state,send_capable,reply_capable,checked_at,daily_limit,mailbox_rolling_limit,min_interval_seconds FROM sender_connections WHERE org_id=${org}) s WHERE s.connection_id=c.config#>>'{sender_connection,connection_id}') AS sender,
 coalesce((SELECT jsonb_agg(to_jsonb(selected)) FROM selected),'[]'::jsonb) AS plans FROM campaign c`)).rows[0];
 return snapshot;
};}
module.exports={assess,service,loader};
