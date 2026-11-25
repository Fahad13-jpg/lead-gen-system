'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const{normalize,smtpOnboarding}=require('../../scripts/dashboard/smtp-onboarding.cjs');
const subject='a'.repeat(64),body={org_id:7,request_id:'smtp_'+'b'.repeat(32),email:'owner@example.org',sharing:'private',smtp:{host:'smtp.example.org',port:587,password:'SMTP_SECRET_FIXTURE'},imap:{host:'imap.example.org',port:993,password:'IMAP_SECRET_FIXTURE'}};
function fixture(){let calls=[],encrypted=[],existing,committed=false,rolledBack=false;const db={async query(sql){calls.push(sql);if(sql.startsWith('SELECT id FROM organizations'))return{rows:[{id:7}]};if(sql.startsWith('SELECT role'))return{rows:[{role:'owner'}]};if(sql.startsWith('SELECT connection_id'))return{rows:existing?[existing]:[]};if(sql.startsWith('SELECT "projectId"'))return{rows:[{projectId:'trusted_project'}]};if(sql.startsWith('SELECT sender_connection_manage')){const match=sql.match(/"connection_id":"([^"]+)"/);return{rows:[{result:{org_id:7,connection_id:match[1],state:'pending_check',version:1,execution_authorized:false}}]};}return{rows:[]};}};
 const deps={identity:{principal:async()=>({org_id:7,subject,role:'owner'})},encrypt:async data=>{encrypted.push(data);return Buffer.from('MOCK_CIPHERTEXT_'+encrypted.length).toString('base64');},transaction:async fn=>{try{const result=await fn(db);committed=true;return result;}catch(e){rolledBack=true;throw e;}}};
 return{deps,calls,encrypted,setExisting:v=>{existing=v;},status:()=>({committed,rolledBack})};}
test('enrollment stores only encrypted credentials and registers pending with fixed limits, no provider calls',async()=>{
 const f=fixture(),s=smtpOnboarding(f.deps),r=await s.connectSmtp('token',body);assert.equal(r.state,'pending_check');assert.equal(r.execution_authorized,false);assert.equal(r.connection_check_required,true);assert.equal(f.encrypted.length,2);assert(f.encrypted.every(v=>v.user===body.email));assert(f.encrypted[1].secure);assert.equal(f.calls.filter(v=>v.startsWith('INSERT INTO credentials_entity')).length,2);assert(!f.calls.join('').includes('SECRET_FIXTURE'));assert(!JSON.stringify(r).includes('credential_ref'));assert(f.calls.some(v=>v.includes('"daily_limit":10')&&v.includes('"min_interval_seconds":300')));assert(f.status().committed);
});
test('uncertain transactions are not replayed and failures roll back the enrollment unit',async()=>{
 const f=fixture();f.deps.encrypt=async()=>{throw Error('secret-bearing provider failure');};await assert.rejects(smtpOnboarding(f.deps).connectSmtp('token',body),/^Error: SMTP_CONNECTION_UNCONFIRMED$/);assert(f.status().rolledBack);assert(!f.calls.some(v=>v.startsWith('INSERT')));
 const g=fixture();let calls=0;g.deps.transaction=async()=>{calls++;throw Error('commit outcome unknown');};await assert.rejects(smtpOnboarding(g.deps).connectSmtp('token',body),/SMTP_CONNECTION_UNCONFIRMED/);assert.equal(calls,1);
});
test('same request reuses its pending registry entry without replacing credentials',async()=>{
 const f=fixture(),s=smtpOnboarding(f.deps),first=await s.connectSmtp('token',body);f.encrypted.length=0;f.calls.length=0;f.setExisting({...first,owner_subject:subject,email:body.email,sharing:'private',provider:'smtp'});const replay=await s.connectSmtp('token',body);assert.deepEqual(replay,first);assert.equal(f.encrypted.length,0);assert(!f.calls.some(v=>v.startsWith('INSERT')));
 f.setExisting({...first,owner_subject:'c'.repeat(64),email:body.email,sharing:'private',provider:'smtp'});await assert.rejects(s.connectSmtp('token',body),/SMTP_REQUEST_CONFLICT/);
});
test('malformed endpoints, TLS bypasses, secret refs, cross-org identity and unauthorized team sharing are denied',async()=>{
 for(const patch of [{credential_ref:'forged'},{smtp:{...body.smtp,port:25}},{imap:{...body.imap,port:143}},{smtp:{...body.smtp,host:'127.0.0.1'}},{smtp:{...body.smtp,disableStartTls:true}},{imap:{...body.imap,password:'\0secret'}},{org_id:'7'},{email:'=literal@example.org'},{smtp:{...body.smtp,password:'=expression'}},{imap:{...body.imap,password:'=expression'}}])assert.throws(()=>normalize({...body,...patch}),/INVALID_FILTER/);
 const f=fixture();f.deps.identity.principal=async()=>({org_id:8,subject,role:'owner'});await assert.rejects(smtpOnboarding(f.deps).connectSmtp('token',body),/AUTHENTICATION_FAILED/);assert.equal(f.calls.length,0);
 f.deps.identity.principal=async()=>({org_id:7,subject,role:'member'});await assert.rejects(smtpOnboarding(f.deps).connectSmtp('token',{...body,sharing:'team'}),/ROLE_REQUIRED/);assert.equal(f.calls.length,0);
});

test('post-commit workflow setup never changes enrollment authority or misreports a confirmed save',async()=>{
 const f=fixture();f.deps.provision=async p=>{assert.equal(p.subject,subject);assert.equal(p.org_id,7);assert(!JSON.stringify(p).includes('SECRET'));throw Error('API unknown');};const r=await smtpOnboarding(f.deps).connectSmtp('token',body);assert.equal(r.workflow_setup,'pending_operator_review');assert.equal(r.execution_authorized,false);assert(f.status().committed);
 const g=fixture();g.deps.provision=async()=>({workflow_setup:'configured',connection_check_scheduled:true,execution_authorized:true,state:'ready'});const s=await smtpOnboarding(g.deps).connectSmtp('token',body);assert.equal(s.execution_authorized,false);assert.equal(s.state,'pending_check');assert.equal(s.connection_check_scheduled,true);assert.equal(s.sending_activated,false);
});
