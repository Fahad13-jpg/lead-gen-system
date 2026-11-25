'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const smtp=require('../../scripts/sender-connections/smtp-message.cjs'),imap=require('../../scripts/sender-connections/imap-replies.cjs');
const message={org_id:2,plan_id:7,step:1,content_hash:'a'.repeat(32),to_email:'prospect@example.org',subject_line:'Website demonstration',email_body:'Hello\n\nApproved message.\nReply STOP to opt out.'};
const sender={email:'sender@example.org',credential_ref:'smtp-a'},lease='b'.repeat(32);
const binding={org_id:2,connection_id:'one',credential_ref:'smtp-a',inbox_credential_ref:'imap-a',email:sender.email};
const activity={...binding,activity_id:11,sender_email:sender.email,recipient:message.to_email,state:'provider_accepted',message_id:'<sent@example.org>',sent_at:'2026-10-24T01:00:00Z'};
const incoming={uid:5,uid_validity:'124',mailbox:'INBOX',message_id:'<reply@example.org>',from:message.to_email,to:[sender.email],in_reply_to:activity.message_id,references:[activity.message_id],text:'Please tell me more.',received_at:'2026-10-24T02:00:00Z'};
test('SMTP preserves approved text, deterministic attempt Message-ID and sole recipient',()=>{
 const p=smtp.prepare(message,sender,lease);assert.equal(p.text,message.email_body);assert.equal(p.subject,message.subject_line);assert.deepEqual(p.envelope.to,[message.to_email]);
 assert.equal(p.messageId,smtp.prepare(message,sender,lease).messageId);assert.notEqual(p.messageId,smtp.prepare(message,sender,'c'.repeat(32)).messageId);
 assert.equal(p.disableFileAccess,true);assert.equal(p.disableUrlAccess,true);assert.equal(p.attachments,undefined);
});
test('header injection, invalid identity and missing confirmed parent are blocked',()=>{
 for(const patch of [{subject_line:'Hi\r\nBcc: other@example.org'},{to_email:'a@example.org,b@example.org'},{org_id:0},{step:2},{content_hash:'bad'}])assert.throws(()=>smtp.prepare({...message,...patch},sender,lease));
});
test('follow-up keeps exact approved subject and bound thread participants',()=>{
 const parent={...activity,plan_id:7,step:1,content_hash:message.content_hash,subject:message.subject_line,references:[]};
 const p=smtp.prepare({...message,step:2},sender,lease,parent);assert.equal(p.inReplyTo,activity.message_id);
 for(const patch of [{org_id:3},{recipient:'other@example.org'},{credential_ref:'other'},{state:'ambiguous'},{subject:'Re: '+message.subject_line},{message_id:'bad'},{references:['bad']}])assert.throws(()=>smtp.prepare({...message,step:2},sender,lease,{...parent,...patch}));
});
test('SMTP acceptance requires final positive receipt and exact recipient and Message-ID',()=>{
 const p=smtp.prepare(message,sender,lease),ok={messageId:p.messageId,accepted:[p.to],rejected:[],response:'250 2.0.0 queued'};
 assert.equal(smtp.receipt(ok,p).state,'provider_accepted');assert.equal(smtp.receipt(ok,p).delivered,false);
 for(const patch of [{messageId:'<other@example.org>'},{accepted:[]},{accepted:[p.to,'other@example.org']},{response:'354 start input'},{rejected:[p.to]},{pending:[p.to]},{error:true}]){
  const r=smtp.receipt({...ok,...patch},p);assert.equal(r.state,'ambiguous');assert.equal(r.retry_allowed,false);
 }
});
test('IMAP matching is mailbox-bound, thread-bound and replay-stable',()=>{
 const r=imap.match(binding,activity,incoming);assert.equal(r.matched,true);assert.equal(r.kind,'reply');assert.equal(r.stop_followups,true);assert.deepEqual(imap.match(binding,activity,incoming),r);
 assert.notEqual(imap.match(binding,activity,{...incoming,uid_validity:'125'}).event_id,r.event_id);
 for(const patch of [{org_id:3},{connection_id:'other'},{credential_ref:'other'},{inbox_credential_ref:'other'}])assert.equal(imap.match({...binding,...patch},activity,incoming).matched,false);
});
test('unrelated, automatic, outgoing, malformed and earlier messages require review',()=>{
 for(const patch of [{from:'stranger@example.org'},{from:sender.email},{to:['other@example.org']},{auto_submitted:'auto-replied'},{in_reply_to:'<other@example.org>',references:[]},{references:null},{received_at:'2020-01-01'},{uid:0},{mailbox:'Sent'},{text:null}])assert.equal(imap.match(binding,activity,{...incoming,...patch}).matched,false);
 assert.equal(imap.match(binding,{...activity,state:'ambiguous'},incoming).matched,false);
});
test('standalone opt-out stops follow-up without misclassifying quoted footer',()=>{
 assert.equal(imap.match(binding,activity,{...incoming,text:'STOP'}).kind,'opt_out');
 assert.equal(imap.match(binding,activity,{...incoming,text:'Tell me more.\n> Reply STOP to opt out.'}).kind,'reply');
});
test('UIDVALIDITY changes never silently advance the inbox cursor',()=>{
 assert.equal(imap.checkpoint({uid_validity:'124'},{uid_validity:'125',uid_next:9}).usable,false);
 assert.equal(imap.checkpoint(null,{uid_validity:'124',uid_next:9}).usable,true);
 assert.equal(imap.checkpoint(null,{uid_validity:0,uid_next:9}).usable,false);
});
