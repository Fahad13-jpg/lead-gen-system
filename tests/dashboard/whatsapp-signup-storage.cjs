'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {storage}=require('../../scripts/dashboard/whatsapp-signup-storage.cjs');
function fixture(){
 const principal={org_id:7,subject:'a'.repeat(64),active:true,role:'owner'},calls=[],encrypted=[];
 const f={principal,calls,encrypted,registered:false,fail:false,ambiguous:false};
 f.api=storage({identity:{principal:async()=>principal},encrypt:async data=>{encrypted.push(data);return 'ENCRYPTEDONLY';},transaction:async work=>{
  const db={query:async(sql,args=[])=>{calls.push({sql,args});if(sql.startsWith('SELECT m.role'))return {rows:[{role:principal.role}]};if(sql.includes('SELECT "projectId"'))return {rows:[{projectId:'project'}]};
   if(sql.includes('SELECT sender_whatsapp_manage')){if(f.fail)throw Error('REGISTRATION_DENIED');const body=JSON.parse(args[2]);return {rows:[{result:{org_id:7,connection_id:body.connection_id,state:'pending_check',version:1,execution_authorized:false}}]};}return {rows:[]};}};
  const r=await work(db);if(f.ambiguous&&calls.some(c=>c.sql.startsWith('INSERT'))){f.ambiguous=false;throw Error('COMMIT_RESPONSE_LOST');}return r;
 }});
 f.p={org_id:7,owner_subject:principal.subject,connection_id:'whatsapp_fixture',waba_id:'123456789',phone_number_id:'987654321',api_version:'v25.0',access_token:'PRIVATE_TOKEN',credential_expires_at:new Date(Date.now()+86400000).toISOString()};
 f.input=ref=>({org_id:7,connection_id:f.p.connection_id,provider:'whatsapp',credential_ref:ref,sharing:'private',limits:{daily_messages:10,rolling_24h_messages:10,min_interval_seconds:300},whatsapp:{waba_id:f.p.waba_id,phone_number_id:f.p.phone_number_id,api_version:f.p.api_version}});return f;
}
test('encrypted credential, project owner and pending registry are saved together without a ready flag',async()=>{
 const f=fixture(),r=await f.api.provisionCredential(f.p);assert.equal(f.calls.length,0);assert.equal(f.encrypted[0].accessToken,'PRIVATE_TOKEN');const saved=await f.api.registerSender('verified',f.input(r.credential_ref));assert.equal(saved.state,'pending_check');assert.equal(f.calls.filter(c=>c.sql.startsWith('INSERT')).length,2);assert(!JSON.stringify(f.calls).includes('PRIVATE_TOKEN'));assert(f.calls.some(c=>c.args.includes('ENCRYPTEDONLY')));await assert.rejects(f.api.registerSender('verified',f.input(r.credential_ref)),/OWNERSHIP/);
});
test('another principal or different selected phone cannot register a pending credential',async()=>{
 const f=fixture(),r=await f.api.provisionCredential(f.p),p=f.input(r.credential_ref);p.whatsapp.phone_number_id='555555555';await assert.rejects(f.api.registerSender('verified',p),/OWNERSHIP/);f.principal.subject='b'.repeat(64);await assert.rejects(f.api.registerSender('verified',f.input(r.credential_ref)),/OWNERSHIP/);assert.equal(f.calls.length,0);
});
test('uncertain registration is never replayed and quarantine fences a possibly committed sender',async()=>{
 const f=fixture(),r=await f.api.provisionCredential(f.p);f.ambiguous=true;await assert.rejects(f.api.registerSender('verified',f.input(r.credential_ref)),/COMMIT_RESPONSE_LOST/);const count=f.calls.length;await assert.rejects(f.api.registerSender('verified',f.input(r.credential_ref)),/OWNERSHIP/);assert.equal(f.calls.length,count);await f.api.quarantineCredential({org_id:7,credential_ref:r.credential_ref});assert(f.calls.some(c=>c.sql.startsWith('UPDATE sender_connections')&&c.sql.includes("state='disabled'")));assert(!f.calls.some(c=>/DELETE/.test(c.sql)));
});
