'use strict';
// Read-only, bounded inbox scan. Inject an authenticated, mailbox-bound client.
// Persist events and cursor atomically; a failed/partial fetch never advances it.
const assert=require('node:assert/strict');
const replies=require('./imap-replies.cjs');
async function poll(binding,activity,previous,deps){
 let lock;
 try{
  lock=await deps.client.getMailboxLock('INBOX',{readOnly:true,acquireTimeout:10000});
  const box=deps.client.mailbox;
  const current={uid_validity:String(box.uidValidity),uid_next:String(box.uidNext)};
  const check=replies.checkpoint(previous,current);
  if(!check.usable)return {saved:false,reason:check.reason};
  // First scan needs a cursor captured BEFORE the send; never skip older replies.
  if(!previous)return {saved:false,reason:'initial_checkpoint_required'};
  const start=Number(previous.uid_next),end=Number(current.uid_next)-1;
  if(end<start-1)return {saved:false,reason:'checkpoint_regressed'};
  const last=Math.min(end,start+99),events=[],reviews=[];
  let bytes=0,count=0;const seen=new Set();
  if(last>=start)for await(const item of deps.client.fetch(`${start}:${last}`,{uid:true,source:true},{uid:true})){
   assert(Number.isInteger(item.uid)&&item.uid>=start&&item.uid<=last&&!seen.has(item.uid),'INVALID_UID');
   seen.add(item.uid);count++;assert(count<=100&&Buffer.isBuffer(item.source),'INVALID_SOURCE');
   bytes+=item.source.length;assert(item.source.length<=1024*1024&&bytes<=5*1024*1024,'SCAN_BYTE_LIMIT');
   const incoming=await deps.parse(item.source);
   const result=replies.match(binding,activity,{...incoming,received_at:item.received_at||incoming.received_at,uid:item.uid,uid_validity:current.uid_validity,mailbox:'INBOX'});
   if(result.matched)events.push(result);
   else if(result.reason!=='unrelated_thread'&&result.reason!=='reply_participants_mismatch'&&result.reason!=='outgoing_or_original_message')reviews.push({uid:item.uid,reason:result.reason});
  }
  const checkpoint={mailbox:'INBOX',uid_validity:current.uid_validity,uid_next:String(last>=start?last+1:start)};
  const payload={org_id:binding.org_id,activity_id:activity.activity_id,connection_id:binding.connection_id,
   credential_ref:binding.credential_ref,inbox_credential_ref:binding.inbox_credential_ref,sender_email:binding.email,
   message_id:activity.message_id,expected_checkpoint:previous,checkpoint,scan_highwater:current.uid_next,complete:checkpoint.uid_next===current.uid_next,events,reviews};
  const saved=await deps.persist(payload);
  return {saved:saved?.saved===true,reason:saved?.reason,matched:events.length,review_count:reviews.length,more:Number(checkpoint.uid_next)<Number(current.uid_next)};
 }catch{return {saved:false,reason:'scan_incomplete',retry_allowed:true};}
 finally{try{lock?.release();}catch{}}
}
module.exports={poll};
