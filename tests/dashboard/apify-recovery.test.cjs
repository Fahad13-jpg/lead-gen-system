'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {recovery,loader}=require('../../scripts/dashboard/apify-recovery.cjs');
const {gatheringService}=require('../../scripts/dashboard/gathering.cjs');
const key='apify_api_fixture123',subject='a'.repeat(64),secret=Buffer.alloc(32,7);
function fixture(){let clock=1000,reads=0,provider=0,current={found:true,matches:true,enabled:false};const read=async(org,hash)=>{reads++;assert.equal(org,7);assert.equal(hash,crypto.createHash('sha256').update(key).digest('hex'));return current;};const r=recovery({secret,read,now:()=>clock});return{r,read,get clock(){return clock;},advance:()=>{clock+=86400001;},set:v=>current=v,counts:()=>({reads,provider}),service:gatheringService({identity:{principal:async(_token,org)=>{if(org!==7)throw Error('MEMBERSHIP_REQUIRED');return{role:'owner',subject};}},apifyRecovery:r,connectionSafety:async()=>true,transport:async()=>{provider++;throw Error('unknown result');}})};}
test('prepared reference binds the key without storing it or contacting a provider',()=>{
 const f=fixture(),p=f.r.prepare(7,subject,key),payload=JSON.parse(Buffer.from(p.recovery_token.split('.')[0],'base64url'));
 assert(!JSON.stringify(payload).includes(key));assert.equal(payload.org_id,7);assert.equal(p.provider_requests,0);assert.deepEqual(f.counts(),{reads:0,provider:0});
});
test('tampering, changed key, wrong organization/subject and expired references fail before lookup',async()=>{
 const f=fixture(),token=f.r.prepare(7,subject,key).recovery_token;
 assert.throws(()=>f.r.verifyKey(token,7,subject,key+'x'),/INVALID/);
 for(const args of [[token+'x',7,subject],[token,8,subject],[token,7,'b'.repeat(64)]])await assert.rejects(f.r.reconcile(...args),/INVALID/);
 f.advance();await assert.rejects(f.r.reconcile(token,7,subject),/EXPIRED/);assert.equal(f.counts().reads,0);
});
test('same signer after restart can confirm saved configuration without claiming a fresh provider check or enabling it',async()=>{
 const f=fixture(),token=f.r.prepare(7,subject,key).recovery_token;
 const restarted=recovery({secret,read:f.read,now:()=>f.clock}),r=await restarted.reconcile(token,7,subject);
 assert.equal(r.state,'configuration_saved');assert.equal(r.enabled,false);assert.equal(r.provider_verification_confirmed,false);assert.equal(r.execution_authorized,false);assert.equal(r.automatic_retry_allowed,false);assert(!JSON.stringify(r).includes(key));assert.equal(f.counts().provider,0);
});
test('missing/replaced credentials and unavailable lookup do not resolve uncertainty',async()=>{
 const f=fixture(),token=f.r.prepare(7,subject,key).recovery_token;
 for(const v of [{found:false,matches:false},{found:true,matches:false}]){f.set(v);assert.equal((await f.r.reconcile(token,7,subject)).state,'unconfirmed');}
 const r=recovery({secret,now:()=>1000,read:async()=>{throw Error('database unavailable');}});await assert.rejects(r.reconcile(token,7,subject));
});
test('unknown connection response is reconciled only by a read; membership and signed key binding prevent foreign writes',async()=>{
 const f=fixture(),p=await f.service.prepareApify('t',{org_id:7,apify_api_key:key});
 await assert.rejects(f.service.connectApify('t',{org_id:7,apify_api_key:key+'x',recovery_token:p.recovery_token}),/INVALID/);assert.equal(f.counts().provider,0);
 await assert.rejects(f.service.connectApify('t',{org_id:7,apify_api_key:key,recovery_token:p.recovery_token}),/UNCONFIRMED/);
 assert.equal((await f.service.reconcileApify('t',{org_id:7,recovery_token:p.recovery_token})).configuration_matches,true);assert.equal(f.counts().provider,1);
 await assert.rejects(f.service.reconcileApify('t',{org_id:8,recovery_token:p.recovery_token}),/MEMBERSHIP/);assert.equal(f.counts().reads,1);
});
test('recovery query is read-only, parameterized and scoped to the exact organization account',async()=>{
 let sql,args;const read=loader({query:async(q,p)=>{sql=q;args=p;return{rows:[{matches:true,enabled:false}]};}});
 assert.deepEqual(await read(7,'a'.repeat(64)),{found:true,matches:true,enabled:false});assert.deepEqual(args,[7,'a'.repeat(64)]);assert(sql.includes("mode='byok' AND org_id=$1"));assert(!/UPDATE|INSERT|DELETE/.test(sql));
});
