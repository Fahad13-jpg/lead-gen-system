'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const{gmailService}=require('../../scripts/dashboard/gmail-service.cjs');
test('recovery authenticates and clears only a proven empty local enrollment state',async()=>{
 let reads=0;const s=gmailService({config:{},principal:async(token,org_id)=>{assert.equal(token,'valid');assert.equal(org_id,7);return{org_id,subject:'owner'};},canRestartGmail:async()=>{reads++;return true;}});
 assert.equal((await s.reconcileGmail('valid',{org_id:7,state:'a'.repeat(43)})).safe_to_restart,true);assert.equal(reads,1);
 await assert.rejects(s.reconcileGmail('valid',{org_id:7,state:'invalid'}),/INVALID_FILTER/);
});
test('saved credentials, unavailable reconciliation and database failure never unlock retry',async()=>{
 for(const canRestartGmail of [undefined,async()=>false]){
  const s=gmailService({config:{},principal:async()=>({org_id:7}),canRestartGmail});
  assert.equal((await s.reconcileGmail('valid',{org_id:7,state:'a'.repeat(43)})).safe_to_restart,false);
 }
 const s=gmailService({config:{},principal:async()=>({org_id:7}),canRestartGmail:async()=>{throw Error('database unavailable');}});
 await assert.rejects(s.reconcileGmail('valid',{org_id:7,state:'a'.repeat(43)}));
});
test('an in-flight finish blocks recovery, including when it starts during the database read',async()=>{
 let releaseRead,releaseExchange,exchangeStarted;
 const started=new Promise(r=>exchangeStarted=r),read=new Promise(r=>releaseRead=r),exchange=new Promise(r=>releaseExchange=r);
 const s=gmailService({config:{enabled:true,client_id:'fixture.apps.googleusercontent.com',origin:'http://localhost:3002',redirect_uri:'http://localhost:3002/oauth/gmail/callback'},principal:async(token,org_id)=>({org_id,subject:'a'.repeat(64),role:'owner'}),canRestartGmail:()=>read,
 exchangeCode:async()=>{exchangeStarted();await exchange;throw Error('fixture failed');},verifyIdentity:async()=>{},getProfile:async()=>{},provisionCredential:async()=>{},registerSender:async()=>{},quarantineCredential:async()=>{}});
 const begin=await s.beginGmail('valid',{org_id:7,sharing:'private'}),state=new URL(begin.authorization_url).searchParams.get('state');s.capture(new URLSearchParams({state,code:'fixture'}));
 const recovery=s.reconcileGmail('valid',{org_id:7,state});await new Promise(r=>setImmediate(r));
 const finish=s.finishGmail('valid',{org_id:7,state});await started;
 assert.equal((await s.reconcileGmail('valid',{org_id:7,state})).safe_to_restart,false);
 releaseRead(true);assert.equal((await recovery).safe_to_restart,false);releaseExchange();await assert.rejects(finish,/CONNECTION_UNCONFIRMED/);
});

test('recovery explains the proven outcome without repeating OAuth exchange or enabling automatic retry',async()=>{
 for(const [canRestartGmail,reason,safe]of [[undefined,'gmail_reconciliation_unavailable',false],[async()=>false,'gmail_link_outcome_unconfirmed',false],[async()=>true,'gmail_fresh_authorization_available',true]]){
  const s=gmailService({config:{},principal:async()=>({org_id:7}),canRestartGmail,exchangeCode:()=>assert.fail('recovery must not exchange a code')});
  const r=await s.reconcileGmail('valid',{org_id:7,state:'a'.repeat(43)});assert.equal(r.safe_to_restart,safe);assert.equal(r.recovery.reason,reason);assert.equal(r.recovery.automatic_retry_allowed,false);assert.equal(r.recovery.execution_authorized,false);
 }
});
