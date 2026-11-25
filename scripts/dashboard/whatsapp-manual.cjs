'use strict';
// Human-operated click-to-chat only. No Meta credential, send, activity or approval write.
function phone(value){
 if(typeof value!=='string'||value.length>100)return null;
 const p=value.replace(/[\s().-]/g,'');return /^\+[1-9][0-9]{7,14}$/.test(p)?p:null;
}
function service({identity,pool}){
 async function approvedDraft(org,lead,recipient){
  const row=(await pool.query(`SELECT p.id,p.campaign_id,cfg.config->>'name' AS campaign_name,p.content_hash,p.body
   FROM strategy_plans p JOIN strategy_campaigns c ON c.org_id=p.org_id AND c.id=p.campaign_id AND c.version=p.campaign_version
   JOIN strategy_campaign_versions cfg ON cfg.org_id=c.org_id AND cfg.campaign_id=c.id AND cfg.version=c.version
   JOIN LATERAL(SELECT action,content_hash FROM strategy_approvals WHERE org_id=p.org_id AND plan_id=p.id ORDER BY id DESC LIMIT 1)a ON true
   WHERE p.org_id=$1 AND p.lead_id=$2 AND p.expires_at>now() AND p.content_hash=md5(p.body::text)
   AND p.fingerprint=strategy_context(p.org_id,p.campaign_id,p.lead_id)->>'fingerprint'
   AND a.action='approve' AND a.content_hash=p.content_hash AND p.body->>'version'='strategy_v2'
   AND p.body->>'state' IN ('ai_completed','template_completed','template_fallback')
   AND p.body->'validation_errors'='[]'::jsonb AND p.body->'blocking_reasons'='[]'::jsonb
   AND p.body#>>'{strategy,step1,channel}'='whatsapp' ORDER BY p.id DESC LIMIT 1`,[org,lead])).rows[0];
  if(!row)return null;
  const b=row.body,artifact=b?.artifacts?.whatsapp_dispatch;
  if(artifact?.recipient&&artifact.recipient!==recipient)return null;
  const parts=b?.strategy?.step1?.parts;
  const text=b?.artifacts?.whatsapp_draft||artifact?.rendered||(Array.isArray(parts)&&parts.length&&parts.every(p=>typeof p?.text==='string')?parts.map(p=>p.text).join('\n\n'):null);
  if(typeof text!=='string'||!text.trim()||text.length>2000||/[\p{Cc}\p{Cf}]/u.test(text.replace(/[\r\n\t]/g,''))||!Number.isSafeInteger(Number(row.id))||Number(row.id)<1)return null;
  return {plan_id:Number(row.id),campaign_id:String(row.campaign_id),campaign_name:typeof row.campaign_name==='string'?row.campaign_name.slice(0,150):null,content_hash:row.content_hash,message:text.trim()};
 }
 function input(p,fields,read=false){
  if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['org_id','lead_id',...fields].includes(k)))throw Error('INVALID_FILTER');
  const r={...p};for(const k of ['org_id','lead_id']){if(read&&typeof r[k]==='string'&&/^[1-9][0-9]{0,9}$/.test(r[k]))r[k]=Number(r[k]);if(!Number.isSafeInteger(r[k])||r[k]<1||r[k]>2147483647)throw Error('INVALID_FILTER');}return r;
 }
 async function load(token,p,withDraft=false){
  const a=await identity.principal(token,p.org_id);if(a?.org_id!==p.org_id||a.active!==true)throw Error('MEMBERSHIP_REQUIRED');
  const row=(await pool.query('SELECT id,phone FROM cleaned_leads WHERE org_id=$1 AND id=$2',[p.org_id,p.lead_id])).rows[0];
  if(!row)return {found:false,available:false,reason:'lead_not_available',manual_only:true,execution_authorized:false};
  const recipient=phone(row.phone);if(!recipient)return {found:true,available:false,reason:'international_phone_required',manual_only:true,execution_authorized:false};
  const flags=(await pool.query(`SELECT
   EXISTS(SELECT 1 FROM unsubscribes u JOIN cleaned_leads c ON lower(trim(c.email))=lower(trim(u.email)) WHERE c.org_id=$1 AND c.id=$2) AS unsubscribed,
   EXISTS(SELECT 1 FROM outreach_activities a WHERE a.org_id=$1 AND (a.lead_id=$2 OR a.dispatch_metadata->>'recipient'=$3) AND (
    a.replied_at IS NOT NULL OR a.bounced_at IS NOT NULL OR a.dispatch_metadata->>'stop_reason' IS NOT NULL OR a.dispatch_metadata->>'followup_pause_reason' IS NOT NULL OR a.dispatch_metadata->>'review_state'='needs_review'
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(a.dispatch_metadata->'stop_events')='array' THEN a.dispatch_metadata->'stop_events' ELSE '[]'::jsonb END)e WHERE e->>'kind' IN('opt_out','wrong_person','reply','bounce','meeting_booked'))
   )) AS stopped`,[p.org_id,p.lead_id,recipient])).rows[0];
  if(!flags||typeof flags.unsubscribed!=='boolean'||typeof flags.stopped!=='boolean')throw Error('WHATSAPP_MANUAL_UNAVAILABLE');
  const available=!flags.unsubscribed&&!flags.stopped;
  return {found:true,available,recipient,reason:available?null:'recipient_stopped_or_needs_review',...(withDraft?{draft:available?await approvedDraft(p.org_id,p.lead_id,recipient):null}:{}),manual_only:true,provider_verified:false,execution_authorized:false};
 }
 return {
  context:(token,p)=>load(token,input(p,[],true),true),
  async prepare(token,value){
   const p=input(value,['recipient','message','acknowledge_manual_contact','source_plan_id','source_content_hash']);
   const sourced=p.source_plan_id!==undefined||p.source_content_hash!==undefined;
   if(sourced&&(!Number.isSafeInteger(p.source_plan_id)||p.source_plan_id<1||!/^[a-f0-9]{32}$/.test(p.source_content_hash||'')))throw Error('INVALID_FILTER');
   if(typeof p.message!=='string'||!p.message.trim()||p.message.length>2000||/[\p{Cc}\p{Cf}]/u.test(p.message.replace(/[\r\n\t]/g,''))||p.acknowledge_manual_contact!==true||phone(p.recipient)!==p.recipient)throw Error('INVALID_FILTER');
   const current=await load(token,p,sourced);if(!current.available||current.recipient!==p.recipient||sourced&&(current.draft?.plan_id!==p.source_plan_id||current.draft?.content_hash!==p.source_content_hash))throw Error('WHATSAPP_MANUAL_BLOCKED');
   const message=p.message.trim(),url='https://wa.me/'+current.recipient.slice(1)+'?text='+encodeURIComponent(message);
   if(url.length>12000)throw Error('INVALID_FILTER');
   return {lead_id:p.lead_id,recipient:current.recipient,message,url,manual_only:true,provider_verified:false,message_sent:false,execution_authorized:false};
  }
 };
}
module.exports={service,phone};
