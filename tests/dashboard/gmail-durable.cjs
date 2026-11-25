'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const{vault}=require('../../scripts/dashboard/gmail-durable-store.cjs');
const{gmailService}=require('../../scripts/dashboard/gmail-service.cjs');
test('OAuth encryption authenticates the session and rejects ciphertext or key substitution',()=>{
 const key=crypto.randomBytes(32),v=vault(key),payload=v.seal('state-a',{code:'PRIVATE_CODE',verifier:'PRIVATE_VERIFIER'});
 assert(!JSON.stringify(payload).includes('PRIVATE_'));
 assert.deepEqual(v.open('state-a',payload),{code:'PRIVATE_CODE',verifier:'PRIVATE_VERIFIER'});
 assert.throws(()=>v.open('state-b',payload));assert.throws(()=>vault(crypto.randomBytes(32)).open('state-a',payload));
 const data=Buffer.from(payload.data,'base64');data[0]^=1;assert.throws(()=>v.open('state-a',{...payload,data:data.toString('base64')}));
});
const owner={org_id:7,subject:'a'.repeat(64)},state='a'.repeat(43);
test('durable completed receipts return without repeating OAuth or granting sending',async()=>{
 const receipt={org_id:7,connection_id:'gmail_'+'a'.repeat(32),state:'ready',execution_authorized:false};
 const service=gmailService({config:{},principal:async()=>owner,oauthStore:{get:async(s,p)=>{assert.equal(s,state);assert.equal(p,owner);return{phase:'completed',receipt};}},exchangeCode:()=>assert.fail('must not exchange')});
 assert.deepEqual(await service.finishGmail('fixture',{org_id:7,state}),receipt);
 assert.equal((await service.reconcileGmail('fixture',{org_id:7,state})).confirmed,true);
});
test('unknown claimed outcome remains locked even after state TTL',async()=>{
 let exchanges=0;const service=gmailService({config:{},principal:async()=>owner,oauthStore:{get:async()=>({phase:'claimed',fresh:false}),reconcile:async()=>null},exchangeCode:()=>{exchanges++;}});
 await assert.rejects(service.finishGmail('fixture',{org_id:7,state}),/CONNECTION_UNCONFIRMED/);
 const r=await service.reconcileGmail('fixture',{org_id:7,state});assert.equal(r.safe_to_restart,false);assert.equal(r.recovery.automatic_retry_allowed,false);assert.equal(r.recovery.execution_authorized,false);assert.equal(exchanges,0);
});
test('missing durable session is not proof that a historical enrollment failed',async()=>{
 const service=gmailService({config:{},principal:async()=>owner,oauthStore:{get:async()=>null},canRestartGmail:()=>assert.fail('global emptiness cannot prove this operation')});
 assert.equal((await service.reconcileGmail('fixture',{org_id:7,state})).safe_to_restart,false);
});
