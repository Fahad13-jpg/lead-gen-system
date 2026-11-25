'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const{operations}=require('../../scripts/credential-adapter/operations.cjs'),{createServer}=require('../../scripts/credential-adapter/server.cjs'),{create,fromEnvironment}=require('../../scripts/dashboard/credential-adapter-client.cjs');
const cipher={encrypt:p=>Buffer.from(JSON.stringify(p)).toString('base64'),decrypt:p=>Buffer.from(p,'base64').toString()},ops=operations({cipher}),token='a'.repeat(64);
function request(server,{url='/v1/encrypt',method='POST',authorization='Bearer '+token,type='application/json',body={fixture:'PRIVATE'}}={}){return new Promise(resolve=>{const res={destroyed:false,writableEnded:false,writeHead(status){this.status=status;},end(value){this.writableEnded=true;resolve({status:this.status,body:JSON.parse(value)});}};server.emit('request',{url,method,headers:{authorization,'content-type':type},async *[Symbol.asyncIterator](){yield Buffer.from(typeof body==='string'?body:JSON.stringify(body));}},res);});}
test('adapter exposes only authenticated fixed operations and redacts internal failures',async()=>{
 const server=createServer({token,operations:ops});assert.equal((await request(server,{authorization:''})).status,401);assert.equal((await request(server,{authorization:'é'.repeat(71)})).status,401);assert.equal((await request(server,{url:'/exec'})).status,404);assert.equal((await request(server,{url:'/v1/decrypt'})).status,404);assert.equal((await request(server,{type:'text/plain'})).status,415);assert.equal((await request(server,{body:'invalid'})).status,400);assert.equal((await request(server,{body:'x'.repeat(196609)})).status,413);
 const encrypted=await request(server);assert.equal(encrypted.status,200);assert.equal(JSON.parse(cipher.decrypt(encrypted.body.value)).fixture,'PRIVATE');
 const bad=await request(server,{url:'/v1/rotate-gmail',body:{cipher:'INVALID'}});assert.equal(bad.status,422);assert.deepEqual(bad.body,{error:'CREDENTIAL_OPERATION_UNCONFIRMED'});
 assert.equal((await request(server,{url:'/v1/runtime-check',body:{profile:'../../config'}})).status,422);
});
test('Gmail rotation preserves identity pin and configuration, rejecting a different account',()=>{
 const original={clientId:'client',clientSecret:'old',scope:'preserve',leadGenGoogleSubject:'google-subject',leadGenGoogleEmail:'owner@example.org',oauthTokenData:{refresh_token:'old'}};
 const p={cipher:cipher.encrypt(original),client_id:'client',client_secret:'new',google_subject:'google-subject',email:'owner@example.org',tokens:{access_token:'ACCESS',refresh_token:'REFRESH'}};
 const result=JSON.parse(cipher.decrypt(ops.gmail(p)));assert.equal(result.scope,'preserve');assert.equal(result.leadGenGoogleSubject,'google-subject');assert.equal(result.oauthTokenData.refresh_token,'REFRESH');assert.throws(()=>ops.gmail({...p,google_subject:'another'}),/ACCOUNT_MISMATCH/);
});
test('SMTP rotation retains secure ports and rejects plaintext or mismatched mailboxes',()=>{
 const p={email:'owner@example.org',smtp_password:'NEW_SMTP',imap_password:'NEW_IMAP',smtp_cipher:cipher.encrypt({user:'owner@example.org',host:'smtp.example.org',port:587}),imap_cipher:cipher.encrypt({user:'owner@example.org',host:'imap.example.org',port:993,secure:true})};
 const r=ops.smtp(p);assert.equal(JSON.parse(cipher.decrypt(r.smtp)).password,'NEW_SMTP');assert.equal(JSON.parse(cipher.decrypt(r.imap)).secure,true);assert.throws(()=>ops.smtp({...p,email:'another@example.org'}));assert.throws(()=>ops.smtp({...p,imap_cipher:cipher.encrypt({user:p.email,host:'imap.example.org',port:143,secure:false})}));
});
test('client validates the internal destination, pins routes and never follows redirects',async()=>{
 for(const url of ['http://evil.example:3013','https://credential-adapter:3013','http://credential-adapter:3013/path','http://127.0.0.1:5678'])assert.throws(()=>create({url,token}),/SETUP_REQUIRED/);
 assert.equal(fromEnvironment({}),null);assert.throws(()=>fromEnvironment({CREDENTIAL_ADAPTER_URL:'http://127.0.0.1:3013'}),/SETUP_REQUIRED/);
 let calls=0;const client=create({url:'http://credential-adapter:3013',token,fetcher:async(url,p)=>{calls++;assert.equal(url,'http://credential-adapter:3013/v1/encrypt');assert.equal(p.redirect,'error');assert.equal(p.headers.Authorization,'Bearer '+token);return{status:200,text:async()=>JSON.stringify({value:'ENCRYPTED'})};}});
 assert.equal(await client.encrypt({fixture:true}),'ENCRYPTED');assert.equal(calls,1);
 const denied=create({url:'http://127.0.0.1:3013',token,fetcher:async()=>({status:500,text:async()=>JSON.stringify({error:'PRIVATE_SECRET'})})});await assert.rejects(denied.encrypt({}),/^Error: CREDENTIAL_ADAPTER_UNAVAILABLE$/);
});
