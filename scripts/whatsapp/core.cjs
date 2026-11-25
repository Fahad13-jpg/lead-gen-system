'use strict';
const {createHash}=require('node:crypto');
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const positive=v=>Number.isSafeInteger(v)&&v>0;
const phone=v=>typeof v==='string'&&/^\+[1-9][0-9]{7,14}$/.test(v);
const future=(v,now)=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&Date.parse(v)>Date.parse(now);
const fresh=(v,now,hours)=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&Date.parse(v)<=Date.parse(now)&&Date.parse(now)-Date.parse(v)<hours*3600000;
function prepare(input,now=new Date().toISOString()){
 const c=input?.campaign?.config,d=c?.whatsapp_dispatch,l=input?.lead;
 const fail=reason=>({allowed:false,reason,execution_authorized:false});
 if(!Number.isFinite(Date.parse(now))||!positive(l?.org_id)||!positive(l?.id)||!c?.channels?.includes('whatsapp'))return fail('invalid_binding');
 if(input.suppressed!==false||input.replied!==false)return fail('suppressed_or_replied');
 if(!Array.isArray(input.report?.trust?.conflicts)||input.report.trust.conflicts.length)return fail('conflicting_evidence');
 if(d?.enabled!==true||d.campaign_state!=='running')return fail('whatsapp_disabled');
 const s=d.connection,p=d.consents?.[String(l.id)],t=d.template;
 if(s?.org_id!==l.org_id||s.state!=='ready'||!/^\d{5,30}$/.test(s.phone_number_id||'')||!/^\d{5,30}$/.test(s.waba_id||'')||!/^v\d{1,3}\.\d$/.test(s.api_version||'')||!s.connection_id||!s.credential_ref||!fresh(s.verified_at,now,24)||!future(s.expires_at,now))return fail('sender_not_ready');
 if(!phone(l.phone)||p?.phone!==l.phone||p.state!=='granted'||p.purpose!=='marketing'||!p.source_ref||!fresh(p.recorded_at,now,24*365)||!future(p.expires_at,now)||!['PK','US'].includes(p.country)||p.country_verified!==true)return fail('marketing_permission_required');
 if(p.country==='US')return fail('us_marketing_template_blocked');
 if(!l.phone.startsWith('+92'))return fail('country_phone_mismatch');
 // First release deliberately supports approved text-body marketing templates.
 // Utility classification and service replies need a separate approved use case.
 if(t?.status!=='APPROVED'||t.category!=='MARKETING'||!/^\d{5,30}$/.test(t.id||'')||!/^\w{1,100}$/.test(t.name||'')||!/^\w{2,15}$/.test(t.language||'')||!t.revision||!fresh(t.checked_at,now,24)||typeof t.body!=='string'||!Array.isArray(t.variable_refs)||t.variable_refs.length>8)return fail('approved_current_template_required');
 const values={company_name:l.company_name,city:l.city,offer_name:c.offer?.name,offer_description:c.offer?.description,cta:c.cta?.text,sender_name:c.sender?.name,sender_company:c.sender?.company,benefit_1:c.offer?.approved_points?.[0]};
 const variables=[];for(const ref of t.variable_refs){const v=values[ref];if(typeof v!=='string'||!v.trim()||v.length>500||/[\p{Cc}\p{Cf}]/u.test(v))return fail('invalid_template_variable');variables.push(v);}
 const seen=new Set();const rendered=t.body.replace(/\{\{([1-9][0-9]*)\}\}/g,(_,n)=>{seen.add(Number(n));return variables[Number(n)-1]??'{{MISSING}}';});
 if(seen.size!==variables.length||variables.some((_,i)=>!seen.has(i+1))||/\{\{|\}\}/.test(rendered)||Array.from(rendered).length>1500||/[\p{Cc}\p{Cf}]/u.test(rendered)||!rendered.includes('Reply STOP to opt out.'))return fail('invalid_rendered_template');
 if((c.offer?.prohibited_claims||[]).some(x=>rendered.toLowerCase().includes(x.toLowerCase()))||!require('../lead-strategy/runtime.cjs').validateAbsence(rendered,{}))return fail('prohibited_template_claim');
 const urls=rendered.match(/https?:\/\/[^\s<>]+/g)||[];if(urls.some(u=>u!==c.cta?.url))return fail('unapproved_url');
 if(d.quote?.verified!==true||d.quote.currency!=='USD'||!positive(d.quote.max_message_micro_usd)||!future(d.quote.expires_at,now)||!positive(d.limits?.daily_messages)||d.limits.daily_messages>1000||!positive(d.limits.monthly_micro_usd)||!positive(d.limits.min_interval_seconds))return fail('budget_or_quote_required');
 const artifact={version:'whatsapp_v1',org_id:l.org_id,recipient:l.phone,country:p.country,connection_id:s.connection_id,phone_number_id:s.phone_number_id,waba_id:s.waba_id,credential_ref:s.credential_ref,api_version:s.api_version,template_id:t.id,template_name:t.name,language:t.language,category:t.category,revision:t.revision,variables,rendered,consent_source_ref:p.source_ref,template_snapshot:JSON.parse(JSON.stringify(t)),template_snapshot_hash:hash(t),max_message_micro_usd:d.quote.max_message_micro_usd,execution_authorized:false};
 return {allowed:true,artifact,reason:'eligible_template_draft',execution_authorized:false};
}
function readiness(input,now){const r=prepare(input,now);return {status:r.allowed?'ready':'blocked',reasons:r.allowed?[]:[r.reason]};}
function handoff(plan,{integrationEnabled=false,input,now}={}){
 if(integrationEnabled!==true||plan?.version!=='strategy_v2'||!['ai_completed','template_completed','template_fallback'].includes(plan.state)||plan.strategy?.step1?.channel!=='whatsapp'||plan.validation_errors?.length||plan.execution_authorized!==false||plan.approval_required!==true||!Array.isArray(plan.blocking_reasons)||plan.blocking_reasons.some(x=>x!=='v2_offline_only'))return plan;
 const sequence=input?.campaign?.config?.whatsapp_dispatch?.templates_by_step!==undefined?require('./sequence.cjs').prepareSequence(input,now):null;
 if(sequence&&!sequence.allowed)return plan;
 const r=sequence?{allowed:true,artifact:sequence.sequence.steps[0].artifact}:prepare(input,now);if(!r.allowed)return plan;
 const p=JSON.parse(JSON.stringify(plan));p.artifacts.whatsapp_dispatch=r.artifact;p.artifacts.whatsapp_draft=r.artifact.rendered;p.blocking_reasons=[];
 if(sequence)p.artifacts.whatsapp_sequence=sequence.sequence;
 p.artifacts.whatsapp_content_review={required:true,source:'operator_verified_template_with_campaign_variables',independently_verified_claims:false};return p;
}
function request(a){
 if(a?.version!=='whatsapp_v1'||!phone(a.recipient)||!/^v\d{1,3}\.\d$/.test(a.api_version||'')||!/^\d{5,30}$/.test(a.phone_number_id||'')||!Array.isArray(a.variables)||a.variables.some(x=>typeof x!=='string'))throw Error('INVALID_WHATSAPP_ARTIFACT');
 return {method:'POST',url:'https://graph.facebook.com/'+a.api_version+'/'+a.phone_number_id+'/messages',body:{messaging_product:'whatsapp',recipient_type:'individual',to:a.recipient.slice(1),type:'template',template:{name:a.template_name,language:{code:a.language},...(a.variables.length?{components:[{type:'body',parameters:a.variables.map(text=>({type:'text',text}))}]}:{})}}};
}
function receipt(data,a){
 if(data?.messaging_product!=='whatsapp'||!Array.isArray(data.messages)||data.messages.length!==1||!/^wamid\.[A-Za-z0-9_+\/=.-]{1,400}$/.test(data.messages[0]?.id||'')||!Array.isArray(data.contacts)||data.contacts.length!==1||data.contacts[0].wa_id!==a.recipient.slice(1))throw Error('ACCEPTANCE_UNVERIFIED');
 return {provider_message_id:data.messages[0].id,state:'provider_accepted',delivered:false};
}
function query(operation,payload){if(!['outreach_whatsapp_gate','outreach_whatsapp_begin','outreach_whatsapp_finish','outreach_whatsapp_event','outreach_whatsapp_queue','outreach_whatsapp_recheck_input','outreach_whatsapp_recheck_store'].includes(operation)||!positive(payload?.org_id))throw Error('INVALID_WHATSAPP_OPERATION');return `SELECT ${operation}('${JSON.stringify(payload).replace(/'/g,"''")}'::jsonb) AS result`;}
module.exports={hash,prepare,readiness,handoff,request,receipt,query};
