'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{provider}=require('../../scripts/dashboard/gmail-provider.cjs');
const client={client_id:'fixture.apps.googleusercontent.com',client_secret:'SECRET',redirect_uris:['http://localhost:3002/oauth/gmail/callback']};
test('token exchange has a fixed destination, bound client/callback and no retry after uncertainty',async()=>{
 let calls=0;const p=provider({client,verifier:{},fetchImpl:async(url,options)=>{calls++;assert.equal(url,'https://oauth2.googleapis.com/token');assert.equal(options.redirect,'error');assert.equal(new URLSearchParams(options.body).get('code_verifier'),'verifier');throw Error('provider private error SECRET');}});
 await assert.rejects(p.exchangeCode({client_id:client.client_id,redirect_uri:client.redirect_uris[0],code:'code',code_verifier:'verifier'}),/^Error: GMAIL_PROVIDER_UNCONFIRMED$/);assert.equal(calls,1);
 await assert.rejects(p.exchangeCode({client_id:client.client_id,redirect_uri:'https://evil.example/callback'}),/CONFIG_INVALID/);assert.equal(calls,1);
});
test('Google library verifier receives fixed audience and nonce mismatch is rejected',async()=>{
 const p=provider({client,verifier:{verifyIdToken:async input=>{assert.equal(input.audience,client.client_id);return{getPayload:()=>({nonce:'expected',email_verified:true})};}}});
 assert.equal((await p.verifyIdentity({id_token:'JWT',audience:client.client_id,nonce:'expected'})).email_verified,true);await assert.rejects(p.verifyIdentity({id_token:'JWT',audience:client.client_id,nonce:'wrong'}),/IDENTITY_UNCONFIRMED/);
});

test('provider diagnostic emits only allowlisted transport codes and HTTP status',async()=>{
 const events=[];const p=provider({client,verifier:{},onDiagnostic:e=>events.push(e),fetchImpl:async()=>{throw Object.assign(Error('SECRET'),{cause:{code:'EAI_AGAIN',private:'SECRET'}});}});
 await assert.rejects(p.getProfile({access_token:'SECRET'}),/PROVIDER_UNCONFIRMED/);
 assert.deepEqual(events,[{endpoint:'mailbox_profile',http_status:null,failure_class:'EAI_AGAIN'}]);assert.ok(!JSON.stringify(events).includes('SECRET'));
});

test('client loading accepts the exact HTTPS deployment callback without requiring localhost',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{loadClient}=require('../../scripts/dashboard/gmail-provider.cjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gmail-callback-test-')),file=path.join(dir,'client.json'),uri='https://app.example.com/oauth/gmail/callback';
 try{fs.writeFileSync(file,JSON.stringify({web:{...client,redirect_uris:[uri]}}));assert.equal(loadClient(file,{redirect_uri:uri}).client_id,client.client_id);
 for(const bad of ['https://other.example.com/oauth/gmail/callback','http://app.example.com/oauth/gmail/callback',uri+'?x=1',uri+'#fragment','https://user:pass@app.example.com/oauth/gmail/callback'])assert.throws(()=>loadClient(file,{redirect_uri:bad}),/CONFIG_INVALID/);
 assert.throws(()=>loadClient(file),/CONFIG_INVALID/);
 }finally{assert(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'gmail-callback-test-'));fs.rmSync(dir,{recursive:true,force:true});}
});
