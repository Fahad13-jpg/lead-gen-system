'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{bridge}=require('../../scripts/dashboard/gmail-bridge.cjs');
test('provisioning stores only encrypted data and registers the authenticated owner',async()=>{
 const statements=[],owner={org_id:7,subject:'a'.repeat(64)};let ref;
 const b=bridge({identity:{principal:async()=>owner},client:{client_id:'client',client_secret:'PRIVATE_SECRET'},encrypt:async data=>{assert.equal(data.clientSecret,'PRIVATE_SECRET');return'ENCRYPTED';},read:async()=>({rows:[{projectId:'project'}]}),write:async sql=>{statements.push(sql);return{rows:[{result:{org_id:7,connection_id:'gmail_fixture',state:'pending_check'}}]};}});
 ref=(await b.provisionCredential({org_id:7,owner_subject:owner.subject,connection_id:'gmail_fixture',email:'sender@example.org',tokens:{refresh_token:'PRIVATE_TOKEN'}})).credential_ref;
 assert.equal(ref.length,36);assert.match(ref,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
 assert.ok(statements[0].includes('ENCRYPTED'));assert.ok(!statements.join('').includes('PRIVATE_'));assert.ok(statements[0].includes('WITH created AS'));
 await b.registerSender('fixture',{org_id:7,connection_id:'gmail_fixture',credential_ref:ref,email:'sender@example.org'});assert.ok(statements[1].includes(owner.subject));
});
test('a credential cannot be registered by another organization subject',async()=>{
 const b=bridge({identity:{principal:async()=>({org_id:8,subject:'b'.repeat(64)})},client:{},encrypt:async()=> 'ENCRYPTED',read:async()=>({rows:[{projectId:'project'}]}),write:async()=>({rows:[]})});
 const ref=(await b.provisionCredential({org_id:7,owner_subject:'a'.repeat(64),connection_id:'gmail_fixture',email:'sender@example.org',tokens:{}})).credential_ref;
 await assert.rejects(b.registerSender('fixture',{org_id:8,connection_id:'gmail_fixture',credential_ref:ref,email:'sender@example.org'}),/OWNERSHIP_REQUIRED/);
});

test('initial check requires a fresh registered ownership receipt and fences the saved version',async()=>{
 const statements=[],owner={org_id:7,subject:'a'.repeat(64)};
 const b=bridge({identity:{principal:async()=>owner},client:{},encrypt:async()=> 'ENCRYPTED',read:async()=>({rows:[{projectId:'project'}]}),write:async sql=>{statements.push(sql);return{rows:[{result:sql.includes('sender_connection_checked(')?{state:'ready',version:2,execution_authorized:false}:{org_id:7,connection_id:'gmail_fixture',state:'pending_check',version:1}}]};}});
 const ref=(await b.provisionCredential({org_id:7,owner_subject:owner.subject,connection_id:'gmail_fixture',email:'sender@example.org',tokens:{}})).credential_ref;
 const input={org_id:7,connection_id:'gmail_fixture',credential_ref:ref,email:'sender@example.org'};
 await assert.rejects(b.checkSender('fixture',input),/OWNERSHIP_REQUIRED/);
 await b.registerSender('fixture',input);
 await assert.rejects(b.checkSender('fixture',{...input,credential_ref:'foreign'}),/OWNERSHIP_REQUIRED/);
 assert.equal((await b.checkSender('fixture',input)).state,'ready');
 assert.ok(statements.at(-1).includes(",1,'"));assert.ok(statements.at(-1).includes('"send":true'));
 await assert.rejects(b.checkSender('fixture',input),/OWNERSHIP_REQUIRED/);
});
