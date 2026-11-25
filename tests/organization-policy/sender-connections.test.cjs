'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const c=require('../../scripts/sender-connections/connections.cjs');
const pack=require('../../scripts/sender-connections/gmail-package.cjs');
const smtp=require('../../scripts/sender-connections/smtp-check.cjs');
const now=Date.parse('2026-10-23T00:00:00Z');
const principal={org_id:2,subject:'member-a',role:'owner',active:true};
const catalog=[{id:'gmail_other',org_id:2,type:'gmailOAuth2',active:true},{id:'smtp_other',org_id:2,type:'smtp',active:true},{id:'imap_other',org_id:2,type:'imap',active:true}];
const input=()=>({org_id:2,connection_id:'personal-mailbox',provider:'gmail',credential_ref:'gmail_other',email:'owner@example.org',sharing:'private',limits:{daily_limit:10,mailbox_rolling_limit:10,min_interval_seconds:300}});
const pending=()=>c.create(input(),principal,catalog);
const ready=()=>c.checked(pending(),{email:'owner@example.org',credential_ref:'gmail_other',send:true,read_replies:true},new Date(now).toISOString());
test('same org-scoped contract supports personal and team connections',()=>{
 assert.equal(pending().state,'pending_check');assert.equal(ready().execution_authorized,false);
 const team=c.create({...input(),sharing:'team'},principal,catalog);assert.equal(team.org_id,2);
 assert.equal(c.campaignPatch(ready(),principal,now).email_dispatch.enabled,false);
});
test('reject cross-org principals, credential refs and credential types',()=>{
 assert.throws(()=>c.create(input(),{...principal,org_id:3},catalog));
 assert.throws(()=>c.create(input(),principal,catalog.map(x=>({...x,org_id:3}))));
 assert.throws(()=>c.create({...input(),credential_ref:'smtp_other'},principal,catalog));
 assert.throws(()=>c.create({...input(),password:'never-store'},principal,catalog));
});
test('members cannot expose a team sender or use another private sender',()=>{
 assert.throws(()=>c.create({...input(),sharing:'team'},{...principal,role:'member'},catalog));
 assert.throws(()=>c.binding(ready(),{...principal,subject:'other',role:'member'},now));
});
test('both identity and inbox capability required; health expires',()=>{
 for(const patch of [{email:'wrong@example.org'},{credential_ref:'wrong'},{send:false},{read_replies:false}]){
  const x=c.checked(pending(),{email:'owner@example.org',credential_ref:'gmail_other',send:true,read_replies:true,...patch},new Date(now).toISOString());
  assert.equal(x.state,'reconnect_required');assert.throws(()=>c.binding(x,principal,now));
 }
 assert.throws(()=>c.binding(ready(),principal,now+86400001));assert.throws(()=>c.binding(ready(),principal,now-1));
});
test('pause and disconnect clear capabilities; reconnect needs a fresh check',()=>{
 for(const action of ['pause','disconnect','recheck']){
  const x=c.transition(ready(),action,principal,2);assert.equal(x.version,3);assert.equal(x.capabilities.send,false);assert.throws(()=>c.binding(x,principal,now));
 }
 assert.throws(()=>c.transition(ready(),'pause',principal,1));
 assert.throws(()=>c.checked(c.transition(ready(),'pause',principal,2),{},new Date(now).toISOString()));
});
test('SMTP requires an org-owned IMAP connection but cannot use Gmail transport',()=>{
 const x=c.create({...input(),provider:'smtp',credential_ref:'smtp_other',inbox_credential_ref:'imap_other'},principal,catalog);
 assert.equal(x.state,'pending_check');assert.throws(()=>c.create({...input(),provider:'smtp',credential_ref:'smtp_other'},principal,catalog));
 assert.throws(()=>pack.build({}, {}, x,principal,{},now),/SMTP_EXECUTOR_NOT_INTEGRATED/);
});
test('Gmail package rebinds actual workflow checks, preserves graph and closes activation',()=>{
 const email=require('../../workflows/07a_email_outreach_executor.json'),reply=require('../../workflows/09_reply_detection.json');
 const before=JSON.stringify([email,reply]);const binding=c.binding(ready(),principal,now);
 const release={binding,expires_at:new Date(now+3600000).toISOString(),plans:[{plan_id:7,content_hash:'a'.repeat(32),recipient:'test@example.org',max_step:2}]};
 const out=pack.build(email,reply,ready(),principal,release,now);
 for(const [w,original] of [[out.email,email],[out.reply,reply]]){
  assert.equal(w.active,false);assert.equal(w.id,undefined);assert.equal(w.staticData,undefined);assert.deepEqual(w.connections,original.connections);
  assert.deepEqual(w.nodes.filter(n=>n.type.endsWith('stickyNote')),original.nodes.filter(n=>n.type.endsWith('stickyNote')));
  for(const n of w.nodes){if(n.credentials?.gmailOAuth2)assert.equal(n.credentials.gmailOAuth2.id,'gmail_other');
   if(n.parameters?.jsCode)assert(!n.parameters.jsCode.includes('ErvKkvbo4c5GQjPn'),'old hard-coded identity remains');}
 }
 const gate=out.email.nodes.find(n=>n.name==='Daily limit check').parameters.jsCode;
 class Clock extends Date{static now(){return now;}}
 const row={org_id:2,plan_id:7,content_hash:'a'.repeat(32),email:'test@example.org',step:1,sender_policy:{...c.campaignPatch(ready(),principal,now).email_dispatch,enabled:true}};
 assert.equal(new Function('$input','Date',gate)({all:()=>[{json:row},{json:{...row,org_id:1}}]},Clock).length,1);
 assert.equal(JSON.stringify([email,reply]),before);
});
test('SMTP endpoint policy rejects internal, mixed DNS, IPv6 and non-TLS ports',async()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','172.16.0.1','192.168.1.1','100.64.0.1','::1','::ffff:127.0.0.1'])assert.equal(smtp.publicV4(ip),false);
 for(const addresses of [[{address:'127.0.0.1'}],[{address:'8.8.8.8'},{address:'10.0.0.1'}],[]])await assert.rejects(()=>smtp.endpoint({host:'smtp.example.org',port:465},'smtp',async()=>addresses));
 await assert.rejects(()=>smtp.endpoint({host:'smtp.example.org',port:25},'smtp',async()=>[{address:'8.8.8.8'}]));
 const x=await smtp.endpoint({host:'smtp.example.org',port:587},'smtp',async()=>[{address:'8.8.8.8'}]);
 assert.equal(x.host,'8.8.8.8');assert.equal(x.tls.servername,'smtp.example.org');assert.equal(x.requireTLS,true);assert.equal(x.tls.rejectUnauthorized,true);
});

test('closed Gmail installation binds the ready sender without inventing a plan release',()=>{
 const email=require('../../workflows/07a_email_outreach_executor.json'),reply=require('../../workflows/09_reply_detection.json');
 const out=pack.prepare(email,reply,ready(),principal,now);
 assert.equal(out.manifest.bounded_release_required,true);assert.equal(out.manifest.execution_authorized,false);
 for(const [w,original]of [[out.email,email],[out.reply,reply]]){
  assert.equal(w.id,undefined);assert.equal(w.active,false);assert.deepEqual(w.connections,original.connections);
  assert.deepEqual(w.nodes.filter(n=>n.type.endsWith('stickyNote')),original.nodes.filter(n=>n.type.endsWith('stickyNote')));
  for(const n of w.nodes){if(n.credentials?.gmailOAuth2)assert.equal(n.credentials.gmailOAuth2.id,'gmail_other');if(n.type==='n8n-nodes-base.code')assert.ok(n.parameters.mode);}
 }
 assert.ok(out.email.nodes.find(n=>n.name==='Get Email-Ready Leads').parameters.query.includes('WHERE p.org_id=2 AND'));
 assert.ok(out.reply.nodes.find(n=>n.name==='Get Recent Outreach Emails').parameters.query.includes('AND a.org_id=2 AND'));
 assert.ok(out.email.nodes.find(n=>n.name==='Send Email - Gmail').parameters.url.includes('EMAIL_TRANSPORT_NOT_ENABLED'));
 assert.equal(new Function(out.reply.nodes.find(n=>n.name==='Bound Mailbox Gate').parameters.jsCode)(),null);
 const unsafe=structuredClone(email);unsafe.nodes.find(n=>n.name==='Send Email - Gmail').parameters.url='https://gmail.googleapis.com/gmail/v1/users/me/messages/send';assert.throws(()=>pack.prepare(unsafe,reply,ready(),principal,now),/CLOSED_TRANSPORT/);
 assert.throws(()=>pack.prepare(email,reply,ready(),{...principal,org_id:3},now));assert.throws(()=>pack.prepare(email,reply,ready(),principal,now+86400001));
});
test('SMTP and inbox check never sends; does not claim sender identity or reply matching',async()=>{
 const events=[];const config={org_id:2,credential_ref:'smtp_other',inbox_credential_ref:'imap_other',smtp:{host:'smtp.example.org',port:465},imap:{host:'imap.example.org',port:993}};
 const deps={resolve:async()=>[{address:'8.8.8.8'}],loadCredentials:async org=>{assert.equal(org,2);return {smtp:{user:'a',pass:'secret'},imap:{user:'a',pass:'secret'}};},
 createSmtp:o=>({verify:async()=>events.push('verify'),close:()=>events.push('close'),sendMail:()=>assert.fail('must not send')}),
 createImap:o=>({mailbox:{path:'INBOX'},connect:async()=>events.push('connect'),getMailboxLock:async()=>({release:()=>events.push('release')}),logout:async()=>events.push('logout')})};
 const result=await smtp.check(config,deps);assert.equal(result.smtp_authenticated,true);assert.equal(result.send,false);assert.equal(result.messages_sent,0);assert(!JSON.stringify(result).includes('secret'));assert(events.includes('logout'));
 deps.createSmtp=()=>({verify:async()=>{throw Error('secret must not leak');},close:()=>{}});
 const failed=await smtp.check(config,deps);assert.equal(failed.reason,'connection_check_failed');assert(!JSON.stringify(failed).includes('secret'));
});
