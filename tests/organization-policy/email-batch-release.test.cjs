'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const controller=require('../../scripts/sender-connections/email-batch-release.cjs');
const{assess}=require('../../scripts/dashboard/email-preflight.cjs');
const now=Date.parse('2026-11-10T12:00:00Z'),subject='a'.repeat(64);
function input(provider='gmail'){
 const sender={org_id:7,connection_id:provider+'_'+'a'.repeat(32),version:2,provider,email:'sender@example.test',credential_ref:'send-ref',inbox_credential_ref:'imap-ref',owner_subject:subject,sharing:'private',state:'ready',send_capable:true,reply_capable:true,member_active:true,checked_at:new Date(now-1000).toISOString(),daily_limit:10,mailbox_rolling_limit:10,min_interval_seconds:300};
 const snapshot={id:8,org_id:7,version:3,config:{sender_connection:{connection_id:sender.connection_id,version:2,provider},email_dispatch:{enabled:true,credential_ref:sender.credential_ref,sender_email:sender.email,daily_limit:10,mailbox_rolling_limit:10,min_interval_seconds:300}},sender,plans:[{id:9,campaign_version:3,content_hash:'b'.repeat(32),expires_at:new Date(now+3600000).toISOString(),email:'recipient@example.test',integrity_matches:true,approval_action:'approve',approval_hash_matches:true,dispatch_check:{ready:true},attempt_recorded:false}]};
 return{snapshot,packet:assess(snapshot,{org:7,campaign:8,version:3,ids:[9],subject,now}).review_packet,principal:{org_id:7,active:true,role:'owner',subject},project_id:'project',postgres:{id:'db-ref'},email:require('../../workflows/07a_email_outreach_executor.json'),reply:require('../../workflows/09_reply_detection.json')};
}
function mock(bundle){const records=new Map(),journal=new Map(),calls=[];let serial=0;const ports={authorize:async()=>{},revalidate:async()=>{},projectFor:async()=>bundle.project_id,readJournal:async op=>journal.get(op),writeJournal:async(op,v)=>journal.set(op,v),request:async(method,url,body)=>{
 calls.push({method,url});if(method==='GET'&&url.startsWith('/workflows?'))return{data:[...records.values()]};
 if(method==='POST'&&url==='/workflows'){const w={...structuredClone(body),id:'w'+ ++serial,active:false};records.set(w.id,w);return structuredClone(w);}
 const id=url.split('/')[2],w=records.get(id);assert(w,'MISSING_MOCK_WORKFLOW');if(method==='POST')w.active=url.endsWith('/activate');return structuredClone(w);
 }};return{records,journal,calls,ports};}
test('Gmail and SMTP release copies preserve notes, closed originals and exact first-message scope',()=>{
 for(const provider of ['gmail','smtp']){const i=input(provider),b=controller.prepare(i,now);controller.verify(b,now);assert.deepEqual(b.release.plans,i.packet.plans);assert.equal(b.release.plans[0].max_step,1);assert.equal(b.workflows.send.active,false);assert.equal(b.workflows.reply.active,false);
  if(provider==='gmail'){assert.equal(b.workflows.send.nodes.find(n=>n.name==='Send Email - Gmail').credentials.gmailOAuth2.id,'send-ref');assert.deepEqual(b.workflows.reply.connections,i.reply.connections);for(const note of i.email.nodes.filter(n=>n.type==='n8n-nodes-base.stickyNote'))assert.deepEqual(b.workflows.send.nodes.find(n=>n.id===note.id),note);}
  else assert.deepEqual(JSON.parse(b.workflows.send.nodes.find(n=>n.type==='CUSTOM.managedSender').parameters.release),b.release);
  assert(b.workflows.send.nodes.some(n=>n.name==='Batch release boundary'));assert(!b.workflows.send.id);
 }
});
test('changed identity, plan/hash/recipient/version, expiry or bundle bytes reject preparation',()=>{
 for(const mutate of [i=>i.principal.role='member',i=>i.snapshot.sender.version++,i=>i.packet.plans[0].recipient='other@example.test',i=>i.packet.plans[0].max_step=2,i=>i.packet.campaign_version++,i=>i.packet.expires_at=new Date(now-1).toISOString(),i=>i.packet.expires_at=new Date(now+86400001).toISOString()]){const i=input();mutate(i);assert.throws(()=>controller.prepare(i,now));}
 const b=controller.prepare(input(),now);b.workflows.send.connections={};assert.throws(()=>controller.verify(b,now),/BUNDLE_CHANGED/);
});
test('install is inactive/idempotent and explicit start enables replies before sending; pause retains replies',async()=>{
 const b=controller.prepare(input(),now),f=mock(b);await controller.install(b,f.ports,now);assert.equal(f.records.size,2);assert([...f.records.values()].every(w=>!w.active));assert(!f.calls.some(c=>c.url.endsWith('/activate')));await controller.install(b,f.ports,now);assert.equal(f.records.size,2);
 await controller.start(b,f.ports,now);const activated=f.calls.filter(c=>c.url.endsWith('/activate'));assert.equal(activated.length,2);assert(f.records.get(activated[0].url.split('/')[2]).name.includes(' reply '));assert(f.records.get(activated[1].url.split('/')[2]).name.includes(' send '));
 const paused=await controller.pause(b,f.ports);assert.equal(paused.sending_active,false);assert.equal(paused.reply_active,true);assert.equal(paused.in_flight_may_complete,true);
});
test('ambiguous create reconciles accepted copies and never blindly repeats unknown requests',async()=>{
 const b=controller.prepare(input('smtp'),now),f=mock(b),request=f.ports.request;f.ports.request=async(m,u,p)=>{const r=await request(m,u,p);if(m==='POST'&&u==='/workflows')throw Error('lost response');return r;};await controller.install(b,f.ports,now);assert.equal(f.records.size,2);
 const g=mock(b),base=g.ports.request;let attempts=0;g.ports.request=async(m,u,p)=>{if(m==='POST'){attempts++;throw Error('timeout');}return base(m,u,p);};await assert.rejects(controller.install(b,g.ports,now),/CREATE_UNCONFIRMED/);await assert.rejects(controller.install(b,g.ports,now),/CREATE_UNCONFIRMED/);assert.equal(attempts,1);
});

test('n8n credential display-name normalization reconciles creation while changed IDs remain blocked',async()=>{
 const b=controller.prepare(input(),now),f=mock(b),base=f.ports.request;
 f.ports.request=async(m,u,p)=>{const result=await base(m,u,p);if(m==='POST'&&u==='/workflows'){
  const stored=f.records.get(result.id);for(const node of stored.nodes)for(const credential of Object.values(node.credentials||{}))credential.name='Resolved name';
 }return result;};
 await controller.install(b,f.ports,now);await controller.install(b,f.ports,now);
 assert.equal(f.calls.filter(c=>c.method==='POST'&&c.url==='/workflows').length,2);
 assert([...f.records.values()].every(w=>!w.active));
 const node=[...f.records.values()][0].nodes.find(n=>n.credentials?.gmailOAuth2);
 node.credentials.gmailOAuth2.id='other-credential';
 await assert.rejects(controller.start(b,f.ports,now),/BATCH_WORKFLOW_CHANGED/);
 assert(!f.calls.some(c=>c.url.endsWith('/activate')));
});
test('reply activation uncertainty prevents sender activation and retry; accepted lost response reconciles',async()=>{
 for(const accepted of [false,true]){const b=controller.prepare(input(),now),f=mock(b);await controller.install(b,f.ports,now);const base=f.ports.request;let attempts=0;f.ports.request=async(m,u,p)=>{if(m==='POST'&&u.endsWith('/activate')){attempts++;if(accepted)await base(m,u,p);throw Error('lost response');}return base(m,u,p);};
 if(accepted){await controller.start(b,f.ports,now);assert.equal(attempts,2);}else{await assert.rejects(controller.start(b,f.ports,now),/TRANSITION_UNCONFIRMED/);await assert.rejects(controller.start(b,f.ports,now),/TRANSITION_UNCONFIRMED/);assert.equal(attempts,1);assert([...f.records.values()].every(w=>!w.active));}
 }
});
test('revocation between activations, changed workflow and wrong project cannot start sending',async()=>{
 const b=controller.prepare(input(),now),f=mock(b);await controller.install(b,f.ports,now);let checks=0;f.ports.revalidate=async()=>{if(++checks===2)throw Error('APPROVAL_REVOKED');};await assert.rejects(controller.start(b,f.ports,now),/REVOKED/);assert.equal([...f.records.values()].find(w=>w.name.includes(' send ')).active,false);assert.equal([...f.records.values()].find(w=>w.name.includes(' reply ')).active,true);
 for(const mutate of [g=>g.ports.projectFor=async()=> 'wrong',g=>[...g.records.values()][0].connections={}]){const g=mock(b);await controller.install(b,g.ports,now);mutate(g);await assert.rejects(controller.start(b,g.ports,now));assert(!g.calls.some(c=>c.url.endsWith('/activate')));}
});
test('expired release cannot install/start but can still pause its exact send workflow',async()=>{
 const b=controller.prepare(input(),now),f=mock(b);await controller.install(b,f.ports,now);await controller.start(b,f.ports,now);await assert.rejects(controller.start(b,f.ports,now+86400000),/expire/);await controller.pause(b,f.ports);assert.equal([...f.records.values()].find(w=>w.name.includes(' send ')).active,false);
});

test('uncertain pause is reconciled without stopping replies or blindly repeating deactivation',async()=>{
 const b=controller.prepare(input(),now),f=mock(b);await controller.install(b,f.ports,now);await controller.start(b,f.ports,now);const base=f.ports.request;let calls=0;
 f.ports.request=async(m,u,p)=>{if(m==='POST'&&u.endsWith('/deactivate')){calls++;throw Error('timeout');}return base(m,u,p);};
 await assert.rejects(controller.pause(b,f.ports),/TRANSITION_UNCONFIRMED/);await assert.rejects(controller.pause(b,f.ports),/TRANSITION_UNCONFIRMED/);assert.equal(calls,1);assert.equal([...f.records.values()].find(w=>w.name.includes(' reply ')).active,true);
});

test('operator live-loader path reuses read-only preflight and local templates, without provider/API requests for Gmail',async()=>{
 const{buildFromLive}=require('../../scripts/sender-connections/email-batch-operator.cjs'),i=input();
 const originalNow=Date.now;Date.now=()=>now;
 try{const pool={query:async sql=>{
  assert(!/\b(INSERT|UPDATE|DELETE|FOR SHARE)\b/.test(sql));
  if(sql.startsWith('WITH campaign'))return{rows:[i.snapshot]};
  if(sql.startsWith('SELECT m.org_id'))return{rows:[i.principal]};
  if(sql.startsWith('SELECT sc.'))return{rows:[{id:'project'}]};
  if(sql.startsWith('SELECT 1 AS ok'))return{rows:[{ok:1}]};throw Error('UNEXPECTED_SQL');
 }};const built=await buildFromLive(i.packet,subject,pool,()=>{throw Error('NO_API_REQUEST_EXPECTED');});assert.equal(built.provider,'gmail');assert.equal(built.digest,controller.prepare(i,now).digest);
 }finally{Date.now=originalNow;}
});

function followupInput(provider='gmail'){
 const i=input(provider);i.snapshot.plans[0].parent_accepted=true;i.snapshot.plans[0].parent_sender_matches=true;
 i.packet=assess(i.snapshot,{org:7,campaign:8,version:3,ids:[9],subject,step:2,now}).review_packet;return i;
}
test('second-email renewal uses the unchanged two-step/24-hour contract and exact Gmail step scope',()=>{
 for(const provider of ['gmail','smtp']){const i=followupInput(provider),b=controller.prepare(i,now);controller.verify(b,now);assert.equal(b.packet.kind,'email_followup_batch_review_v1');assert.equal(b.release.plans[0].max_step,2);assert(Date.parse(b.release.expires_at)-now<=86400000);assert.equal(b.workflows.send.active,false);
  if(provider==='gmail')assert(b.workflows.send.nodes.find(n=>n.name==='Get Email-Ready Leads').parameters.query.includes('WHERE steps.step=2 AND p.org_id=7'));
  else assert.equal(JSON.parse(b.workflows.send.nodes.find(n=>n.type==='CUSTOM.managedSender').parameters.release).plans[0].max_step,2);
  assert(b.workflows.send.nodes.find(n=>n.name==='Batch release boundary').parameters.content.includes('first-step duplicate guards retained'));
 }
});
test('follow-up renewal refuses uncertain/mismatched parents, existing attempts, waiting delay, reply stops or changed approval',()=>{
 for(const mutate of [p=>p.parent_accepted=false,p=>p.parent_sender_matches=false,p=>p.attempt_recorded=true,p=>p.dispatch_check={ready:false,reason:'delay_not_elapsed'},p=>p.dispatch_check={ready:false,reason:'suppressed_replied_or_bounced'},p=>p.approval_action='revoke']){const i=followupInput();mutate(i.snapshot.plans[0]);assert.throws(()=>controller.prepare(i,now),/PREFLIGHT_BLOCKED/);}
 const i=followupInput();i.packet.plans[0].max_step=3;assert.throws(()=>controller.prepare(i,now),/PACKET_CHANGED/);
});
