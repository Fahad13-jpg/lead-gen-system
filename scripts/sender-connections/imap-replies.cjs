'use strict';
// Parsed values must come from the bound IMAP inbox and a vetted MIME parser.
const {mailbox,messageId}=require('./smtp-message.cjs');
const {clearOptOut}=require('../lead-strategy/v2/gmail-replies.cjs');
const crypto=require('node:crypto');
const positive=v=>/^[1-9][0-9]*$/.test(String(v))&&Number.isSafeInteger(Number(v));
function match(binding,activity,incoming){
 const review=reason=>({matched:false,requires_review:true,reason});
 if(!positive(binding?.org_id)||!binding?.connection_id||!binding?.credential_ref||!binding?.inbox_credential_ref||!mailbox(binding?.email)
 ||binding.org_id!==activity?.org_id||binding.connection_id!==activity?.connection_id||binding.credential_ref!==activity?.credential_ref||binding.inbox_credential_ref!==activity?.inbox_credential_ref||activity?.sender_email!==binding.email)return review('mailbox_binding_mismatch');
 if(activity.state!=='provider_accepted'||!positive(activity.activity_id)||!messageId(activity.message_id)||!mailbox(activity.recipient))return review('original_message_unverified');
 if(!positive(incoming?.uid)||!positive(incoming?.uid_validity)||incoming.mailbox!=='INBOX'||!messageId(incoming.message_id))return review('incoming_identity_unverified');
 const dsn=require('./mime.cjs').bounce(activity,incoming);
 if(dsn){
  const received=Date.parse(incoming.received_at),sent=Date.parse(activity.sent_at);
  if(!dsn.matched||!incoming.to?.includes(binding.email)||!Number.isFinite(received)||!Number.isFinite(sent)||received<=sent)return review('delivery_report_requires_review');
  const key=[binding.org_id,binding.connection_id,binding.inbox_credential_ref,'INBOX',String(incoming.uid_validity),String(incoming.uid)];
  return {matched:true,requires_review:false,kind:'bounce',activity_id:activity.activity_id,org_id:binding.org_id,event_id:'imap:'+crypto.createHash('sha256').update(JSON.stringify(key)).digest('hex'),source_ref:{mailbox:'INBOX',uid_validity:String(incoming.uid_validity),uid:String(incoming.uid)},stop_followups:true,execution_authorized:false};
 }
 if(incoming.from===binding.email||incoming.message_id===activity.message_id)return review('outgoing_or_original_message');
 if(incoming.from!==activity.recipient||!Array.isArray(incoming.to)||!incoming.to.includes(binding.email)||incoming.to.some(a=>!mailbox(a)))return review('reply_participants_mismatch');
 if(incoming.auto_submitted&&incoming.auto_submitted!=='no')return review('automatic_reply');
 const sent=Date.parse(activity.sent_at),received=Date.parse(incoming.received_at);
 if(!Number.isFinite(sent)||!Number.isFinite(received)||received<=sent)return review('reply_time_invalid');
 if(!Array.isArray(incoming.references)||incoming.references.length>20||incoming.references.some(v=>!messageId(v))||!messageId(incoming.in_reply_to))return review('thread_headers_unverified');
 if(incoming.in_reply_to!==activity.message_id&&!incoming.references.includes(activity.message_id))return review('unrelated_thread');
 if(typeof incoming.text!=='string'||Buffer.byteLength(incoming.text)>50000)return review('body_unavailable_or_too_large');
 const key=[binding.org_id,binding.connection_id,binding.inbox_credential_ref,'INBOX',String(incoming.uid_validity),String(incoming.uid)];
 return {matched:true,requires_review:true,kind:clearOptOut(incoming.text)?'opt_out':'reply',activity_id:activity.activity_id,org_id:binding.org_id,
  event_id:'imap:'+crypto.createHash('sha256').update(JSON.stringify(key)).digest('hex'),message_id:incoming.message_id,
  source_ref:{mailbox:'INBOX',uid_validity:String(incoming.uid_validity),uid:String(incoming.uid)},received_at:new Date(received).toISOString(),stop_followups:true,execution_authorized:false};
}
function checkpoint(previous,current){
 if(!positive(current?.uid_validity)||!positive(current?.uid_next))return {usable:false,reason:'invalid_mailbox_checkpoint'};
 if(previous&&String(previous.uid_validity)!==String(current.uid_validity))return {usable:false,reason:'uid_validity_changed_reconcile_required'};
 return {usable:true,uid_validity:String(current.uid_validity),uid_next:String(current.uid_next)};
}
module.exports={match,checkpoint};
