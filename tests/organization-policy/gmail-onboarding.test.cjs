'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{onboarding,scopes,sessions}=require('../../scripts/sender-connections/gmail-onboarding.cjs');
function fixture(overrides={}){
 let nonce,exchanges=0,provisions=0,quarantines=0;const config={enabled:true,client_id:'fixture.apps.googleusercontent.com',origin:'http://localhost:3002',redirect_uri:'http://localhost:3002/oauth/gmail/callback'};
 const deps={config,principal:async(token,org_id)=>({org_id,subject:token==='other'?'b'.repeat(64):'a'.repeat(64),role:'owner'}),exchangeCode:async()=>{exchanges++;return{access_token:'SECRET',refresh_token:'SECRET_REFRESH',scope:scopes.join(' '),id_token:'JWT'};},verifyIdentity:async input=>{nonce=input.nonce;return{iss:'https://accounts.google.com',aud:config.client_id,nonce,email:'sender@example.org',email_verified:true,sub:'google-subject',exp:Math.floor(Date.now()/1000)+3600};},getProfile:async()=>({emailAddress:'sender@example.org'}),provisionCredential:async()=>{provisions++;return{credential_ref:'private_ref'};},registerSender:async(token,p)=>({...p,state:'pending_check'}),quarantineCredential:async()=>{quarantines++;},...overrides};
 return{service:onboarding(deps),counts:()=>({exchanges,provisions,quarantines}),nonce:()=>nonce};
}
test('Google signup uses state, nonce, PKCE and offline consent; tokens never return to caller',async()=>{
 const f=fixture(),start=await f.service.begin('user',{org_id:1,sharing:'private'}),url=new URL(start.authorization_url);assert.equal(url.origin,'https://accounts.google.com');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('access_type'),'offline');
 const result=await f.service.finish('user',{org_id:1,state:url.searchParams.get('state'),code:'fixture-code'});assert.equal(result.state,'pending_check');assert.ok(!JSON.stringify(result).includes('SECRET'));assert.ok(!('credential_ref'in result));assert.deepEqual(f.counts(),{exchanges:1,provisions:1,quarantines:0});
 await assert.rejects(f.service.finish('user',{org_id:1,state:url.searchParams.get('state'),code:'fixture-code'}),/STATE_EXPIRED/);assert.equal(f.counts().exchanges,1);
});
test('a different organization member cannot consume the authorization session',async()=>{
 const f=fixture(),start=await f.service.begin('user',{org_id:1,sharing:'private'}),state=new URL(start.authorization_url).searchParams.get('state');await assert.rejects(f.service.finish('other',{org_id:1,state,code:'fixture'}),/STATE_EXPIRED/);assert.equal(f.counts().exchanges,0);
});
test('missing scopes prevent credential creation; failed registration quarantines its credential',async()=>{
 const f=fixture({exchangeCode:async()=>({access_token:'a',refresh_token:'b',scope:''})}),start=await f.service.begin('user',{org_id:1,sharing:'private'});await assert.rejects(f.service.finish('user',{org_id:1,state:new URL(start.authorization_url).searchParams.get('state'),code:'fixture'}),/CONNECTION_UNCONFIRMED/);assert.equal(f.counts().provisions,0);
 const bad=fixture({registerSender:async()=>{throw Error('private details');}}),s=await bad.service.begin('user',{org_id:1,sharing:'private'});await assert.rejects(bad.service.finish('user',{org_id:1,state:new URL(s.authorization_url).searchParams.get('state'),code:'fixture'}),/CONNECTION_UNCONFIRMED/);assert.equal(bad.counts().quarantines,1);
});
test('missing configuration keeps onboarding unavailable',()=>assert.equal(onboarding({}).ready(),false));

test('verified enrollment can perform a trusted initial check without authorizing sending',async()=>{
 let checks=0;const f=fixture({checkSender:async(token,input)=>{checks++;assert.equal(input.email,'sender@example.org');return{state:'ready',execution_authorized:false};}});
 const start=await f.service.begin('user',{org_id:1,sharing:'private'});
 const result=await f.service.finish('user',{org_id:1,state:new URL(start.authorization_url).searchParams.get('state'),code:'fixture'});
 assert.equal(result.state,'ready');assert.equal(result.execution_authorized,false);assert.equal(checks,1);
});

test('initial check failure preserves registered sender and does not quarantine a successful enrollment',async()=>{
 const events=[];const f=fixture({checkSender:async()=>{throw Error('SECRET');},onFailure:e=>events.push(e)});
 const start=await f.service.begin('user',{org_id:1,sharing:'private'});
 const result=await f.service.finish('user',{org_id:1,state:new URL(start.authorization_url).searchParams.get('state'),code:'fixture'});
 assert.equal(result.state,'pending_check');assert.equal(f.counts().quarantines,0);assert.deepEqual(events,[{stage:'initial_capability_check',reason:'CHECK_UNCONFIRMED'}]);
});

test('failure diagnostics identify the stage without exposing provider details or tokens',async()=>{
 const events=[];const f=fixture({getProfile:async()=>{throw Error('SECRET mailbox provider body');},onFailure:e=>events.push(e)});
 const start=await f.service.begin('user',{org_id:1,sharing:'private'});
 await assert.rejects(f.service.finish('user',{org_id:1,state:new URL(start.authorization_url).searchParams.get('state'),code:'SECRET_CODE'}),/CONNECTION_UNCONFIRMED/);
 assert.deepEqual(events,[{stage:'mailbox_profile',reason:'STEP_FAILED'}]);assert.ok(!JSON.stringify(events).includes('SECRET'));assert.equal(f.counts().provisions,0);
});
test('expired state is unusable and unverified Google identity never provisions credentials',async()=>{
 let now=0;const store=sessions({now:()=>now}),binding={org_id:1,subject:'a',client_id:'b',redirect_uri:'c'};const state=store.issue(binding);now=300001;assert.equal(store.consume(state,binding),null);
 const f=fixture({verifyIdentity:async()=>({email_verified:false})}),start=await f.service.begin('user',{org_id:1,sharing:'private'});await assert.rejects(f.service.finish('user',{org_id:1,state:new URL(start.authorization_url).searchParams.get('state'),code:'fixture'}),/CONNECTION_UNCONFIRMED/);assert.equal(f.counts().provisions,0);
});
