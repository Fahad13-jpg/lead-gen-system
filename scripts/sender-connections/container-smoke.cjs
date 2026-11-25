'use strict';
// Offline tests against the actual installed n8n libraries. No connections or sends.
const assert=require('node:assert/strict'),path=require('node:path');
const root=process.argv[2],base=path.join(root,'lead-system/scripts/sender-connections');
const {libraries,imapAdapter}=require(path.join(base,'clients.cjs')),mime=require(path.join(base,'mime.cjs')),reply=require(path.join(base,'imap-replies.cjs'));
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
async function run(){
 const timeout=setTimeout(()=>{console.error('Offline smoke deadline exceeded');process.exit(1);},30000);timeout.unref();
 const lib=libraries(),binding={org_id:1,connection_id:'one',email:'sender@example.org',credential_ref:'smtp',inbox_credential_ref:'imap'};
 const activity={...binding,activity_id:2,sender_email:binding.email,state:'provider_accepted',recipient:'recipient@example.org',message_id:'<original@example.org>',sent_at:'2026-10-24T01:00:00Z'};
 const common='To: sender@example.org\r\nDate: Sat, 24 Oct 2026 03:00:00 +0000\r\nMessage-ID: <response@example.org>\r\nMIME-Version: 1.0\r\n';
 const raw=common+'From: recipient@example.org\r\nIn-Reply-To: <original@example.org>\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nSTOP';
 const parsed=await mime.parse(Buffer.from(raw),lib.simpleParser);
 console.log('PASS real reply MIME parser');
 assert.equal(reply.match(binding,activity,{...parsed,uid:10,uid_validity:2,mailbox:'INBOX'}).kind,'opt_out');
 const dsn=common+'From: mailer-daemon@example.org\r\nContent-Type: multipart/report; report-type=delivery-status; boundary="b"\r\n\r\n--b\r\nContent-Type: text/plain\r\n\r\nDelivery failed\r\n--b\r\nContent-Type: message/delivery-status\r\n\r\nReporting-MTA: dns; mail.example.org\r\n\r\nFinal-Recipient: rfc822; recipient@example.org\r\nAction: failed\r\nStatus: 5.1.1\r\n\r\n--b\r\nContent-Type: text/rfc822-headers\r\n\r\nMessage-ID: <original@example.org>\r\nTo: recipient@example.org\r\n\r\n--b--\r\n';
 const bounce=await mime.parse(Buffer.from(dsn),lib.simpleParser);
 console.log('PASS real DSN MIME parser');
 assert.equal(reply.match(binding,activity,{...bounce,uid:11,uid_validity:2,mailbox:'INBOX'}).kind,'bounce');
 const wrong=await mime.parse(Buffer.from(dsn.replace('Status: 5.1.1','Status: 4.2.0')),lib.simpleParser);
 assert.equal(reply.match(binding,activity,{...wrong,uid:12,uid_validity:2,mailbox:'INBOX'}).matched,false);
 const transport=lib.nodemailer.createTransport({streamTransport:true,buffer:true,newline:'windows'});
 const compiled=await transport.sendMail({from:binding.email,to:activity.recipient,subject:'Offline fixture',text:'Approved body',messageId:'<new@example.org>',inReplyTo:activity.message_id,references:[activity.message_id]});
 const compiledParsed=await lib.simpleParser(compiled.message);assert.equal(compiledParsed.messageId,'<new@example.org>');assert.equal(compiledParsed.inReplyTo,activity.message_id);transport.close();
 console.log('PASS offline SMTP composition');
 const rawImap={openBox(name,readonly,cb){assert.equal(readonly,true);cb(null,{uidvalidity:2,uidnext:11});},destroy(){},end(){},fetch(range,options){assert.equal(range,'10:10');assert.equal(options.markSeen,false);const f=new EventEmitter();process.nextTick(()=>{const m=new EventEmitter();f.emit('message',m);m.emit('attributes',{uid:10,date:new Date('2026-10-24T03:00:00Z')});const stream=new PassThrough();m.emit('body',stream);stream.end(raw);m.emit('end');f.emit('end');});return f;}};
 const adapter=imapAdapter(rawImap);await adapter.getMailboxLock();let count=0;for await(const item of adapter.fetch('10:10')){assert.equal(item.uid,10);assert(item.source.length>0);count++;}assert.equal(count,1);
 const Node=require(path.join(root,'ManagedSender.node.js')).ManagedSender;
 const context={getNodeParameter(name){return {operation:'send',binding:JSON.stringify({org_id:1,connection_id:'one'}),release:'null'}[name];},getNode(){return {credentials:{smtp:{id:'smtp'},imap:{id:'imap'}}};},getCredentials(){throw Error('Closed release accessed credentials');}};
 const out=await Node.prototype.execute.call(context);assert.equal(out[0][0].json.reason,'release_not_authorized');
 console.log(JSON.stringify({passed:['installed libraries load','real MIME opt-out parsing','real permanent DSN bounce parsing','temporary DSN not hard bounce','Nodemailer offline thread headers','read-only bounded IMAP adapter','custom node closed release before credentials'],provider_calls:0,emails_sent:0}));
}
run().catch(e=>{console.error(e.message);process.exitCode=1;});
