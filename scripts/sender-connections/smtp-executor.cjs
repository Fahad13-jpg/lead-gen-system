'use strict';
const handoff=require('../lead-strategy/v2/email-handoff.cjs'),smtp=require('./smtp-message.cjs');
const rollout=require('../lead-strategy/v2/email-rollout.cjs');
const allowed=new Set(['outreach_email_step_reserve','outreach_smtp_begin','outreach_smtp_finish','outreach_imap_scan_finish']);
function query(name,p){if(!allowed.has(name))throw Error('UNKNOWN_OPERATION');return `SELECT ${name}('${JSON.stringify(p).replace(/'/g,"''")}'::jsonb) AS result`;}
async function execute(row,deps,release){
 if(!release||!rollout.allows(row,release))return {state:'blocked',reason:'release_not_authorized'};
 const sender=deps.sender;
 if(sender.org_id!==release.binding.org_id||sender.email!==release.binding.email||sender.credential_ref!==release.binding.credential_ref)return {state:'blocked',reason:'sender_binding_mismatch'};
 let message,parent,checkpoint,reserved;
 try{
  message=handoff.executionDraft(row);
  parent=message.step>1?await deps.loadParent(message):null;
  if(parent)parent={...parent,plan_id:Number(parent.plan_id),org_id:Number(parent.org_id),step:Number(parent.step)};
  checkpoint=await deps.captureCheckpoint();
  reserved=await deps.executeQuery(query('outreach_email_step_reserve',{org_id:message.org_id,plan_id:message.plan_id,step:message.step,content_hash:message.content_hash}));
 }catch{return {state:'blocked',reason:'preflight_failed',sent:false};}
 if(!reserved?.reserved)return {state:'blocked',reason:reserved?.reason||'reservation_denied',sent:false};
 let prepared;try{prepared=smtp.prepare(message,sender,reserved.lease,parent);}catch{return {state:'blocked',reason:'message_or_parent_invalid',sent:false};}
 const p={org_id:message.org_id,plan_id:message.plan_id,step:message.step,content_hash:message.content_hash,lease:reserved.lease,
 credential_ref:sender.credential_ref,inbox_credential_ref:sender.inbox_credential_ref,connection_id:sender.connection_id,sender_email:sender.email,
 to_email:message.to_email,subject:message.subject_line,body:message.email_body,message_id:prepared.messageId,references:prepared.references||[],checkpoint};
 let begin;try{begin=await deps.executeQuery(query('outreach_smtp_begin',p));}catch{return {state:'reconciliation_required',reason:'begin_commit_unknown',retry_allowed:false};}
 if(!begin?.ready||!begin.execution_authorized)return {state:begin?.queued?'queued':'blocked',reason:begin?.reason||'begin_denied',sent:false};
 let receipt;try{receipt=smtp.receipt(await deps.sendMail(prepared),prepared);}catch{receipt=smtp.receipt(null,prepared);}
 try{
  const saved=await deps.executeQuery(query('outreach_smtp_finish',{...p,outcome:receipt.state,message_id:receipt.message_id}));
  if(!saved?.saved||saved.state!==receipt.state)return {state:'reconciliation_required',reason:'receipt_not_saved',retry_allowed:false};
 }catch{return {state:'reconciliation_required',reason:'receipt_commit_unknown',retry_allowed:false};}
 return {...receipt,provider_accepted:receipt.state==='provider_accepted'};
}
module.exports={query,execute};
