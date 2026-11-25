'use strict';
// Injected adapter; no actual Gmail implementation or credential loading.
const handoff=require('./email-handoff.cjs'),dispatch=require('./dispatch.cjs');
const gmailMessage=require('./gmail-message.cjs');
function query(name,p){
 if(!['outreach_email_step_begin','outreach_email_step_finish'].includes(name))throw Error('INVALID_EMAIL_OPERATION');
 return 'SELECT '+name+"('"+JSON.stringify(p).replace(/'/g,"''")+"'::jsonb) AS result";
}
async function execute(row,lease,deps,options={}){
 if(options.enabled!==true)return {state:'blocked',reason:'transport_disabled',sent:false};
 const message=handoff.executionDraft(row),identity={...dispatch.payload(message),step:message.step};
 if(!/^[a-f0-9]{32}$/.test(lease||''))throw Error('INVALID_DISPATCH_LEASE');
 if(typeof deps?.sender?.credential_ref!=='string'||!deps.sender.credential_ref||typeof deps.sender.email!=='string'||!deps.sender.email) return {state:'blocked',reason:'sender_mapping_missing',sent:false};
 let gmailRequest;
 try{
  if(message.step>1&&typeof deps.loadParent!=='function')return {state:'blocked',reason:'conversation_context_required',sent:false};
  const parent=message.step>1?await deps.loadParent({...identity,previous_step:message.step-1,credential_ref:deps.sender.credential_ref}):null;
  gmailRequest=gmailMessage.prepare(message,deps.sender,parent);
 }catch{return {state:'blocked',reason:'conversation_or_message_requires_review',sent:false};}
 const p={...identity,lease,credential_ref:deps.sender.credential_ref,sender_email:deps.sender.email,to_email:message.to_email,subject:message.subject_line,body:message.email_body};
 let begin;
 try{begin=await deps.executeQuery(query('outreach_email_step_begin',p));}
 catch{return {state:'reconciliation_required',reason:'begin_commit_unknown',sent:false,retry_allowed:false};}
 if(begin?.ready!==true||begin.execution_authorized!==true){
  if(begin?.queued===true&&typeof begin.next_check_at==='string'&&Number.isFinite(Date.parse(begin.next_check_at)))
   return {state:'queued',reason:begin.reason,next_check_at:begin.next_check_at,sent:false,retry_allowed:false};
  return {state:'blocked',reason:begin?.reason||'begin_denied',sent:false};
 }
 // The attempt is durably charged before transport. A crash here is conservative:
 // the record stays attempting and requires reconciliation, never automatic resend.
 let outcome;
 try{outcome=handoff.receipt(await deps.transport({to:message.to_email,subject:message.subject_line,body:message.email_body,credential_ref:deps.sender.credential_ref,gmail_request:gmailRequest}));}
 catch{outcome=handoff.receipt(null);}
 let saved;
 try{saved=await deps.executeQuery(query('outreach_email_step_finish',{...identity,lease,outcome:outcome.state,external_id:outcome.external_id}));}
 catch{return {state:'reconciliation_required',reason:'receipt_commit_unknown',provider_accepted:outcome.state==='provider_accepted',retry_allowed:false};}
 if(saved?.saved!==true||saved.state!==outcome.state)return {state:'reconciliation_required',reason:'receipt_not_persisted',provider_accepted:outcome.state==='provider_accepted',retry_allowed:false};
 return {state:outcome.state,provider_accepted:outcome.state==='provider_accepted',delivered:false,retry_allowed:false};
}
module.exports={execute,query};
