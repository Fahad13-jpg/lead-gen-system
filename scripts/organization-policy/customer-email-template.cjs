'use strict';
// Offline plain-text renderer. Its preview is deliberately NOT a strategy_v2 plan.
// No AI, network, credentials, persistence, approvals or transport dependencies.
const crypto=require('node:crypto');
const variables=new Set(['company_name','city','offer_name','offer_description','cta','demo_url','sender_name','sender_company']);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const controls=/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\p{Cf}]/u;
function safeHttpsUrl(value){
 if(typeof value!=='string'||controls.test(value)||/\s/.test(value)||!/^https:\/\//i.test(value))return null;
 const rest=value.slice(8),boundary=rest.search(/[/?#]/),authority=(boundary<0?rest:rest.slice(0,boundary)),tail=boundary<0?'':rest.slice(boundary);
 if(!authority||authority.includes('@')||authority.includes('..')||!/^([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::\d{1,5})?$/i.test(authority))return null;
 return 'https://'+authority.toLowerCase()+tail;
}
function render(input){
 const x=object(input)?input:{},c=x.campaign?.config||{},lead=x.lead||{},errors=[];
 const add=(code,field)=>errors.push({code,field});
 const id=v=>Number.isSafeInteger(v)&&v>0;
 if(!id(x.org_id)||x.campaign?.org_id!==x.org_id||lead.org_id!==x.org_id)add('ORGANIZATION_MISMATCH','org_id');
 if(c.mode!=='template')add('CUSTOMER_DEFINED_MODE_REQUIRED','mode');
 if(!Array.isArray(c.channels)||c.channels.length!==1||c.channels[0]!=='email')add('EMAIL_ONLY_SLICE','channels');
 if(typeof lead.email!=='string'||! /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(lead.email))add('RECIPIENT_REQUIRED','lead.email');
 const data={company_name:lead.company_name,city:lead.city,offer_name:c.offer?.name,offer_description:c.offer?.description,
  cta:c.cta?.text,demo_url:c.cta?.url,sender_name:c.sender?.name,sender_company:c.sender?.company};
 function fill(value,field){
  if(typeof value!=='string'||!value.trim()){add('TEXT_REQUIRED',field);return '';}
  if(value.length>6000){add('TEMPLATE_TOO_LONG',field);return '';}
  if(controls.test(value))add('CONTROL_CHARACTERS',field);
  const result=value.replace(/\{\{\s*([^{}]+?)\s*\}\}/g,(_,key)=>{
   key=key.trim();if(!variables.has(key)){add('UNKNOWN_VARIABLE',field);return '';}
   const v=data[key];if(typeof v!=='string'||!v.trim()){add('MISSING_VARIABLE',field+':'+key);return '';}
   if(v.length>1500||controls.test(v)||/[\r\n\t]/.test(v)||/[{}]/.test(v)){add('UNSAFE_VARIABLE',field+':'+key);return '';}
   return v; // Single substitution only. Never evaluate expressions or nested templates.
  });
  if(result.includes('{{')||result.includes('}}'))add('MALFORMED_VARIABLE',field);
  return result;
 }
 const signature=c.sender?.signature||[c.sender?.name,c.sender?.company].join(' | ');
 if(typeof c.sender?.name!=='string'||!c.sender.name.trim()||typeof c.sender?.company!=='string'||!c.sender.company.trim())add('SENDER_REQUIRED','sender');
 if(typeof signature!=='string'||!signature.trim()||/[\r\n]/.test(signature)||controls.test(signature))add('INVALID_SIGNATURE','sender.signature');
 // First slice uses the existing English opt-out wording; localization is explicit future work.
 if(c.language!=='en')add('LANGUAGE_NOT_SUPPORTED_IN_SLICE','language');
 const optOut='Reply STOP to opt out.';
 const allowed=new Set();
 if(c.cta?.url){const url=safeHttpsUrl(c.cta.url);if(url)allowed.add(url);else add('INVALID_CTA_URL','cta.url');}
 if(!Array.isArray(c.offer?.prohibited_claims)||c.offer.prohibited_claims.some(v=>typeof v!=='string'||!v.trim()))add('PROHIBITED_CLAIMS_REQUIRED','offer.prohibited_claims');
 const prohibited=Array.isArray(c.offer?.prohibited_claims)?c.offer.prohibited_claims.filter(v=>typeof v==='string'&&v.trim()):[];
 const template=c.templates?.email,sequence=c.sequence;
 if(!object(template)||!Array.isArray(template.followups))add('EMAIL_TEMPLATE_REQUIRED','templates.email');
 if(!Array.isArray(sequence)||!sequence.length||sequence.length>10)add('INVALID_SEQUENCE','sequence');
 const steps=Array.isArray(sequence)&&sequence.length<=10?sequence:[];
 if(Array.isArray(template?.followups)&&template.followups.length!==Math.max(0,steps.length-1))add('FOLLOWUP_COUNT_MISMATCH','templates.email.followups');
 const drafts=[];
 for(const [i,step] of steps.entries()){
  if(!object(step)||step.channel!=='email'||!Number.isInteger(step.delay_days)||step.delay_days<0||step.delay_days>60||(i===0&&step.delay_days!==0))add('INVALID_SEQUENCE_STEP','sequence.'+i);
  const subject=fill(template?.subject,'step.'+(i+1)+'.subject');
  const body=fill(i===0?template?.body:template?.followups?.[i-1],'step.'+(i+1)+'.body');
  if(subject.length>200||/[\r\n\t]/.test(subject))add('INVALID_SUBJECT','step.'+(i+1));
  if(body.length>1200)add('EMAIL_TOO_LONG','step.'+(i+1));
  const lines=body.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if(lines.at(-1)!==optOut)add('OPT_OUT_FOOTER_REQUIRED','step.'+(i+1));
  if(!lines.includes(signature))add('SENDER_SIGNATURE_REQUIRED','step.'+(i+1));
  const combined=subject+'\n'+body;
  for(const phrase of prohibited)if(combined.toLowerCase().includes(phrase.toLowerCase()))add('PROHIBITED_CLAIM','step.'+(i+1));
  if(/\b(?:https?:\/\/|www\.)/i.test(combined)){
   for(const token of combined.match(/(?:https?:\/\/|www\.)[^\s<>"']+/gi)||[]){
    const url=safeHttpsUrl(token.replace(/[.,!?;)]+$/,''));if(!url||!allowed.has(url))add('URL_NOT_ALLOWED','step.'+(i+1));
   }
  }
  if(/\b(?:javascript|data|ftp):/i.test(combined))add('URL_NOT_ALLOWED','step.'+(i+1));
  // Recognizable unscoped absence is blocked. General factual truth requires review.
  if(/\byou(?:r business)? (?:do not|don't|have no|lack) (?:have )?(?:a |an )?website\b/i.test(combined))add('UNSCOPED_WEBSITE_ABSENCE','step.'+(i+1));
  drafts.push({step:i+1,channel:'email',delay_days:step?.delay_days,subject,body,
   condition:i===0?'initial':'no_reply_after_previous_confirmed_send',stop_on:['reply','opt_out','bounce','wrong_person','meeting_booked']});
 }
 try{if(!c.timezone||typeof c.timezone!=='string')throw Error();new Intl.DateTimeFormat('en',{timeZone:c.timezone});}catch{add('TIMEZONE_REQUIRED','timezone');}
 const window=c.sending_window;
 if(!object(window)||!Number.isInteger(window.start_hour)||!Number.isInteger(window.end_hour)||window.start_hour<0||window.end_hour>24||window.start_hour>=window.end_hour||!Array.isArray(window.weekdays)||!window.weekdays.length||window.weekdays.some(d=>!Number.isInteger(d)||d<1||d>7))add('INVALID_SENDING_WINDOW','sending_window');
 const result={version:'customer_email_preview_v1',org_id:x.org_id||null,state:errors.length?'needs_correction':'requires_review',
  mode:'template',preview_only:true,execution_authorized:false,approval_required:true,ai_calls:0,ai_tokens:0,
  claim_provenance:'customer_supplied_not_independently_verified',validation_errors:errors,
  limitations:['Plain-text English email only; exact supplied wording is not a factual accuracy guarantee.',
   'URL/phrase checks are not a comprehensive semantic, phishing or factual-verification engine.',
   'Not accepted by the current strategy_v2 executor; no policy/approval or recipient-verification gates are bypassed.'],
  draft:errors.length?null:{recipient:lead.email,timezone:c.timezone,sending_window:JSON.parse(JSON.stringify(window)),steps:drafts}};
 // New preview hash only, deliberately distinct from existing SQL plan/content hashes.
 const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
 result.preview_hash=result.draft?crypto.createHash('sha256').update(JSON.stringify(canonical(result.draft))).digest('hex'):null;
 return result;
}
module.exports={render};
