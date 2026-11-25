'use strict';
const url=v=>typeof v==='string'&&/^https:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?$/.test(v)?'https://www.linkedin.com/in/'+v.split('/')[4].toLowerCase()+'/':null;
const text=v=>typeof v==='string'&&v.trim()&&!/[\p{Cc}\p{Cf}]/u.test(v.replace(/[\r\n\t]/g,''));
const length=v=>Array.from(v).length;
function target(input,now=new Date().toISOString()){
 const r=input?.report,profiles=r?.research?.linkedin?.profiles;
 if(r?.trust?.freshness?.research_current!==true||!Array.isArray(r?.trust?.conflicts)||r.trust.conflicts.length||!Array.isArray(profiles))return null;
 const candidates=profiles.filter(p=>p?.kind==='person'&&url(p.profile_url)&&Number.isFinite(Date.parse(p.observed_at))&&Date.parse(p.observed_at)<=Date.parse(now)&&Date.parse(now)-Date.parse(p.observed_at)<30*86400000);
 const chosen=input.campaign?.config?.linkedin_manual?.target_profiles?.[String(input.lead?.id)];
 const unique=[...new Map(candidates.map(p=>[url(p.profile_url),p])).values()];
 const p=chosen?unique.find(p=>url(p.profile_url)===url(chosen)):unique.length===1?unique[0]:null;
 return p?{kind:'person',profile_url:url(p.profile_url),name:p.name||null,role:p.role||null,observed_at:p.observed_at,provenance:p.provenance||'matched_enrichment_profile',identity_status:'matched_evidence_requires_human_confirmation'}:null;
}
function readiness(input,now){
 const reasons=[];if(input?.campaign?.config?.linkedin_manual?.enabled!==true)reasons.push('manual_linkedin_disabled');
 if(input?.suppressed!==false||input?.replied!==false)reasons.push('suppressed_or_replied');
 if(!target(input,now))reasons.push('unique_current_matched_person_required');
 return {status:reasons.length?'blocked':'ready',reasons,execution_mode:'manual_only'};
}
function render(template,input){
 const c=input.campaign.config,l=input.lead;
 const values={company_name:l.company_name,city:l.city,offer_name:c.offer.name,offer_description:c.offer.description,cta:c.cta.text,demo_url:c.cta.url,sender_name:c.sender.name,sender_company:c.sender.company};
 if(!text(template))throw Error('INVALID_LINKEDIN_TEMPLATE');
 return template.replace(/\{\{\s*([^}]+)\s*\}\}/g,(_,key)=>{key=key.trim();if(!Object.hasOwn(values,key)||typeof values[key]!=='string'||!values[key].trim())throw Error('MISSING_LINKEDIN_TEMPLATE_VALUE');return values[key];});
}
function validContent(value,limit,input,qualification={}){
 if(!text(value)||length(value)>limit)return false;
 const c=input.campaign.config;
 if((c.offer.prohibited_claims||[]).some(t=>value.toLowerCase().includes(t.toLowerCase())))return false;
 const urls=value.match(/https?:\/\/[^\s<>]+/g)||[];
 return urls.every(u=>u===c.cta.url)&&require('../lead-strategy/runtime.cjs').validateAbsence(value,qualification);
}
// Runs before the existing plan hash/save/approval. Never modifies approved rows.
function handoff(plan,{integrationEnabled=false,input,now}={}){
 if(!integrationEnabled||readiness(input,now).status!=='ready'||plan?.version!=='strategy_v2'||!['ai_completed','template_completed','template_fallback'].includes(plan.state)||plan.execution_authorized!==false||plan.approval_required!==true||!Array.isArray(plan.validation_errors)||plan.validation_errors.length||!Array.isArray(plan.blocking_reasons))return plan;
 const sequence=input.campaign.config.sequence;
 if(!Array.isArray(sequence)||!sequence.some(s=>s.channel==='linkedin'))return plan;
 // Existing automatic executors do not yet consume customer-reported LinkedIn
 // receipts. Do not approve a sequence that would silently stall after this step.
 if(sequence.some((s,i)=>s.channel==='linkedin'&&sequence.slice(i+1).some(next=>next.channel!=='linkedin')))return plan;
 const c=input.campaign.config,who=target(input,now),items=[];
 let first=true;
 for(const s of sequence.filter(s=>s.channel==='linkedin')){
  let message,method=plan.generation?.method||'unknown';
  const supplied=c.templates?.linkedin;
  if(s.step===1&&plan.strategy?.step1?.channel==='linkedin')message=plan.strategy.step1.parts?.map(p=>p.text).join(' ');
  else message=(plan.artifacts?.followup_drafts||[]).find(d=>d.step===s.step&&d.channel==='linkedin'&&d.status==='requires_plan_approval_and_execution_checks')?.body;
  // No intent-only step becomes a sendable task. The strategy must contain it.
  if(!message)return plan;
  const linkedIndex=sequence.filter(x=>x.channel==='linkedin'&&x.step<s.step).length;
  if(supplied){const template=linkedIndex===0?supplied.body:supplied.followups?.[linkedIndex-1];if(!template)return plan;message=render(template,input);method='customer_template';if(!message.includes('Reply STOP to opt out.'))return plan;}
  let note=c.linkedin_manual.connection_note?render(c.linkedin_manual.connection_note,input):"Hello, I'd like to connect and introduce "+c.sender.company+'.';
  if(!c.linkedin_manual.connection_note&&length(note)>200)note="Hello, I'd like to connect.";
  if(!validContent(message,500,input,plan.qualification)||!validContent(note,200,input,plan.qualification))return plan;
  items.push({step:s.step,delay_days:s.delay_days,requires_connection:first,connection_note:first?note:null,message,method,content_provenance:method==='customer_template'?'customer_supplied_requires_review':'validated_strategy',note_provenance:c.linkedin_manual.connection_note?'customer_supplied_requires_review':'neutral_template',approval_required:true});first=false;
 }
 const p=JSON.parse(JSON.stringify(plan));
 p.artifacts.linkedin_manual={version:'linkedin_manual_v1',target:who,steps:items,execution_mode:'manual_only',assignee:c.linkedin_manual.assignee||null,note_limit:200,message_limit:500,customer_content_requires_review:!!c.templates?.linkedin||!!c.linkedin_manual.connection_note};
 // A different primary channel's integration block must not be cleared here.
 if(p.strategy?.step1?.channel==='linkedin'&&p.blocking_reasons.every(r=>r==='v2_offline_only'))p.blocking_reasons=[];
 return p;
}
const allowedActions={ready:['copy_note','request_sent','already_connected','snooze','skip','assign','opt_out','wrong_person'],request_sent:['copy_note','accepted','reply','not_interested','opt_out','wrong_person','snooze','skip','assign'],accepted:['copy_message','message_sent','reply','not_interested','opt_out','wrong_person','snooze','skip','assign'],message_sent:['copy_message','reply','not_interested','opt_out','wrong_person'],replied:[],not_interested:[],opt_out:[],wrong_person:[],skipped:[]};
function transition(state,action){
 if(['reply','not_interested','opt_out','wrong_person'].includes(action)&&Object.hasOwn(allowedActions,state))return state==='opt_out'&&action!=='opt_out'?null:action==='reply'?'replied':action;
 if(action==='skip'&&['ready','request_sent','accepted'].includes(state))return 'skipped';
 if(!allowedActions[state]?.includes(action))return null;
 return {request_sent:'request_sent',already_connected:'accepted',accepted:'accepted',message_sent:'message_sent',reply:'replied',not_interested:'not_interested',opt_out:'opt_out',wrong_person:'wrong_person',skip:'skipped'}[action]||state;
}
function query(operation,payload){
 if(!['outreach_linkedin_prepare','outreach_linkedin_event','outreach_linkedin_queue'].includes(operation)||!Number.isSafeInteger(payload?.org_id)||payload.org_id<=0)throw Error('INVALID_LINKEDIN_OPERATION');
 return `SELECT ${operation}('${JSON.stringify(payload).replace(/'/g,"''")}'::jsonb) AS result`;
}
module.exports={url,target,readiness,render,validContent,handoff,transition,query};
