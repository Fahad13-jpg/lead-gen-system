'use strict';
// Prepare human-operated outreach only. No provider calls or database writes.
function pageUrl(value){
 if(typeof value!=='string'||value.length>1000)return null;
 return /^https:\/\/www\.facebook\.com\/(?!search\/|groups\/|posts\/|reels?\/|watch\/|login\/|messages\/|photo\/|events\/|marketplace\/|settings\/)[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+){0,2}\/$/i.test(value)?value:null;
}
function messengerUrl(value){return typeof value==='string'&&value.length<=1000&&/^https:\/\/(?:m\.me\/[A-Za-z0-9._-]+|(?:www\.)?facebook\.com\/messages\/t\/[A-Za-z0-9._-]+)\/?$/.test(value)?value:null;}
function input(p,read=false){
 const fields=read?['org_id','lead_id']:['org_id','lead_id','page_url','message','acknowledge_manual_contact','source_plan_id','source_content_hash'];
 if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!fields.includes(k)))throw Error('INVALID_FILTER');
 const out={...p};for(const k of ['org_id','lead_id']){if(read&&typeof out[k]==='string'&&/^[1-9][0-9]{0,9}$/.test(out[k]))out[k]=Number(out[k]);if(!Number.isSafeInteger(out[k])||out[k]<1||out[k]>2147483647)throw Error('INVALID_FILTER');}return out;
}
function service({identity,pool}){
 async function approvedDraft(p,targets){
  const row=(await pool.query(`SELECT p.id,p.content_hash,p.body,cfg.config->>'name' AS campaign_name
   FROM strategy_plans p JOIN strategy_campaigns c ON c.org_id=p.org_id AND c.id=p.campaign_id AND c.version=p.campaign_version
   JOIN strategy_campaign_versions cfg ON cfg.org_id=c.org_id AND cfg.campaign_id=c.id AND cfg.version=c.version
   JOIN LATERAL(SELECT action,content_hash FROM strategy_approvals WHERE org_id=p.org_id AND plan_id=p.id ORDER BY id DESC LIMIT 1)a ON true
   WHERE p.org_id=$1 AND p.lead_id=$2 AND p.expires_at>now() AND p.content_hash=md5(p.body::text)
   AND p.fingerprint=strategy_context(p.org_id,p.campaign_id,p.lead_id)->>'fingerprint'
   AND a.action='approve' AND a.content_hash=p.content_hash AND p.body->>'version'='strategy_v2'
   AND p.body->>'state'='ai_completed' AND p.body->'validation_errors'='[]'::jsonb AND p.body->'blocking_reasons'='[]'::jsonb
   AND p.body#>>'{strategy,step1,channel}'='messenger' ORDER BY p.id DESC LIMIT 1`,[p.org_id,p.lead_id])).rows[0];
  const a=row?.body?.artifacts?.messenger_manual,parts=row?.body?.strategy?.step1?.parts;
  if(a?.version!=='messenger_manual_v1'||a.execution_mode!=='manual_only'||!targets.some(t=>t.page_url===a.target?.page_url)||!Array.isArray(parts)||parts.some(p=>typeof p.text!=='string')||a.message!==parts.map(p=>p.text).join('\n\n')||!a.message.trim()||a.message.length>1500||!Number.isSafeInteger(Number(row.id)))return null;
  return {plan_id:Number(row.id),content_hash:row.content_hash,campaign_name:row.campaign_name,page_url:a.target.page_url,message:a.message};
 }
 async function load(token,p){
  const member=await identity.principal(token,p.org_id);if(member?.org_id!==p.org_id||member.active!==true)throw Error('MEMBERSHIP_REQUIRED');
  const lead=(await pool.query('SELECT id FROM cleaned_leads WHERE org_id=$1 AND id=$2',[p.org_id,p.lead_id])).rows[0];
  const base={manual_only:true,execution_authorized:false,provider_verified:false};
  if(!lead)return {...base,available:false,reason:'lead_not_available',targets:[]};
  const flags=(await pool.query(`SELECT
   EXISTS(SELECT 1 FROM unsubscribes u JOIN cleaned_leads c ON lower(trim(c.email))=lower(trim(u.email)) WHERE c.org_id=$1 AND c.id=$2) AS unsubscribed,
   EXISTS(SELECT 1 FROM outreach_activities a WHERE a.org_id=$1 AND a.lead_id=$2 AND (
    a.replied_at IS NOT NULL OR a.bounced_at IS NOT NULL OR a.dispatch_metadata->>'stop_reason' IS NOT NULL OR a.dispatch_metadata->>'followup_pause_reason' IS NOT NULL OR a.dispatch_metadata->>'review_state'='needs_review'
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(a.dispatch_metadata->'stop_events')='array' THEN a.dispatch_metadata->'stop_events' ELSE '[]'::jsonb END)e WHERE e->>'kind' IN('opt_out','wrong_person','reply','bounce','meeting_booked'))
   )) AS stopped`,[p.org_id,p.lead_id])).rows[0];
  if(!flags||typeof flags.unsubscribed!=='boolean'||typeof flags.stopped!=='boolean')throw Error('FACEBOOK_MANUAL_UNAVAILABLE');
  if(flags.unsubscribed||flags.stopped)return {...base,available:false,reason:'recipient_stopped_or_needs_review',targets:[]};
  const rows=(await pool.query(`SELECT s.raw_data->>'facebook_page_url' AS page_url,s.raw_data->>'messenger_url' AS messenger_url
   FROM cleaning_links l JOIN staging_leads s ON s.org_id=l.org_id AND s.id=l.staging_id
   WHERE l.org_id=$1 AND l.cleaned_id=$2 AND s.source='facebook_pages' ORDER BY s.id DESC LIMIT 10`,[p.org_id,p.lead_id])).rows;
  const targets=[];for(const row of rows){const page=pageUrl(row.page_url);if(page&&!targets.some(t=>t.page_url===page))targets.push({page_url:page,url:messengerUrl(row.messenger_url)||page});}
  return {...base,available:targets.length>0,reason:targets.length?null:'facebook_page_required',targets,draft:targets.length?await approvedDraft(p,targets):null};
 }
 return {
  context:(token,p)=>load(token,input(p,true)),
  async prepare(token,value){
   const p=input(value);if(!pageUrl(p.page_url)||typeof p.message!=='string'||!p.message.trim()||p.message.length>2000||/[\p{Cc}\p{Cf}]/u.test(p.message.replace(/[\r\n\t]/g,''))||p.acknowledge_manual_contact!==true)throw Error('INVALID_FILTER');
   const sourced=p.source_plan_id!==undefined||p.source_content_hash!==undefined;
   if(sourced&&(!Number.isSafeInteger(p.source_plan_id)||p.source_plan_id<1||!/^[a-f0-9]{32}$/.test(p.source_content_hash||'')))throw Error('INVALID_FILTER');
   const current=await load(token,p),target=current.targets.find(t=>t.page_url===p.page_url);
   if(!current.available||!target)throw Error('FACEBOOK_MANUAL_BLOCKED');
   if(sourced&&(current.draft?.plan_id!==p.source_plan_id||current.draft?.content_hash!==p.source_content_hash||current.draft?.page_url!==p.page_url||current.draft?.message!==p.message.trim()))throw Error('FACEBOOK_MANUAL_BLOCKED');
   return {lead_id:p.lead_id,...target,message:p.message.trim(),manual_only:true,execution_authorized:false,provider_verified:false,message_sent:false};
  }
 };
}
module.exports={service,pageUrl,messengerUrl};
