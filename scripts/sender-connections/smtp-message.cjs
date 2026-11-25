'use strict';
// Pure provider adapter. No socket, credential access or dispatch authorization.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const mailbox=v=>typeof v==='string'&&v===v.toLowerCase()&&/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(v);
const messageId=v=>typeof v==='string'&&v.length<=250&&/^<[^<>\s\x00-\x1f\x7f]+@[^<>\s\x00-\x1f\x7f]+>$/.test(v);
function prepare(message,sender,lease,parent=null){
 assert(mailbox(sender?.email)&&mailbox(message?.to_email)&&sender.credential_ref,'INVALID_MAILBOX');
 assert(Number.isSafeInteger(message.org_id)&&message.org_id>0&&Number.isSafeInteger(message.plan_id)&&message.plan_id>0,'INVALID_IDENTITY');
 assert(Number.isInteger(message.step)&&message.step>=1&&message.step<=10&&/^[a-f0-9]{32}$/.test(lease||''),'INVALID_ATTEMPT');
 assert(/^[a-f0-9]{32}$/.test(message.content_hash||''),'INVALID_PLAN_HASH');
 assert(typeof message.subject_line==='string'&&message.subject_line.trim()&&message.subject_line.length<=200&&!/[\x00-\x1f\x7f]/.test(message.subject_line),'INVALID_SUBJECT');
 assert(typeof message.email_body==='string'&&message.email_body.length>0&&Buffer.byteLength(message.email_body)<=50000,'INVALID_BODY');
 const attempt=crypto.createHash('sha256').update(JSON.stringify([message.org_id,message.plan_id,message.step,lease,sender.credential_ref])).digest('hex');
 const result={from:sender.email,to:message.to_email,subject:message.subject_line,text:message.email_body,
  messageId:`<${attempt}@${sender.email.split('@')[1]}>`,envelope:{from:sender.email,to:[message.to_email]},disableFileAccess:true,disableUrlAccess:true};
 if(message.step>1){
  assert(parent&&parent.org_id===message.org_id&&parent.plan_id===message.plan_id&&parent.step===message.step-1&&parent.content_hash===message.content_hash&&parent.state==='provider_accepted','CONFIRMED_PARENT_REQUIRED');
  assert(parent.sender_email===sender.email&&parent.credential_ref===sender.credential_ref&&parent.recipient===message.to_email,'THREAD_PARTICIPANTS_MISMATCH');
  assert(parent.subject===message.subject_line,'THREAD_SUBJECT_REAPPROVAL_REQUIRED');
  assert(messageId(parent.message_id)&&Array.isArray(parent.references)&&parent.references.every(messageId),'THREAD_REFERENCE_INVALID');
  const refs=[...new Set([...parent.references,parent.message_id])];assert(refs.length<=20&&refs.join(' ').length<=800,'THREAD_REFERENCE_TOO_LONG');
  result.inReplyTo=parent.message_id;result.references=refs;
 }
 return result;
}
function receipt(result,prepared){
 const uncertain={state:'ambiguous',message_id:null,delivered:false,retry_allowed:false};
 // Accepted RCPT alone is insufficient; require the final positive DATA response.
 if(!prepared||!messageId(prepared.messageId)||result?.error||result?.messageId!==prepared.messageId||!/^250(?:[ -]|$)/.test(result?.response||''))return uncertain;
 if(!Array.isArray(result.accepted)||result.accepted.length!==1||result.accepted[0]!==prepared.to||!Array.isArray(result.rejected)||result.rejected.length||!Array.isArray(result.pending||[])||(result.pending||[]).length)return uncertain;
 return {state:'provider_accepted',message_id:result.messageId,delivered:false,retry_allowed:false};
}
module.exports={prepare,receipt,mailbox,messageId};
