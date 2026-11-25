'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{approvalService}=require('../../scripts/dashboard/approval.cjs');
const hash='a'.repeat(32),body={org_id:7,plan_id:1,action:'approve',content_hash:hash};
function setup(overrides={}){const calls=[];const service=approvalService({identity:{principal:async()=>({role:'owner',subject:'verified-subject'})},load:async()=>({content_hash:hash,intact:true,current:true,clear:true,version:'strategy_v2',state:'ai_completed',...overrides}),transport:async(route,p)=>{calls.push(p);return{status:200,body:{approved_content:p.action==='approve',execution_authorized:false}};}});return{service,calls};}
test('approval binds exact hash and authenticated actor without granting execution',async()=>{
 const f=setup();const r=await f.service('fixture',body);assert.equal(r.recorded,true);assert.equal(r.execution_authorized,false);assert.equal(f.calls[0].actor,'dashboard:verified-subject');
 await assert.rejects(f.service('fixture',{...body,actor:'forged'}),/INVALID_FILTER/);
});
test('stale, changed, blocked and invalid customer plans never reach approval endpoint',async()=>{
 for(const override of [{current:false},{intact:false},{clear:false},{state:'ai_failed'},{content_hash:'b'.repeat(32)},{customer_content:true,customer_valid:false}]){const f=setup(override);await assert.rejects(f.service('fixture',body),/APPROVAL_/);assert.equal(f.calls.length,0);}
});
test('fallback and customer acknowledgements are true booleans bound server-side to the hash',async()=>{
 const f=setup({fallback:true,customer_content:true,customer_valid:true});await assert.rejects(f.service('fixture',body),/ACK_REQUIRED/);
 await f.service('fixture',{...body,acknowledge_fallback:true,acknowledge_customer_content:true});assert.equal(f.calls[0].acknowledge_fallback_hash,hash);assert.equal(f.calls[0].acknowledge_customer_content_hash,hash);
});
test('revocation remains possible for stale content; uncertain writes are never retried',async()=>{
 const f=setup({current:false,clear:false});await f.service('fixture',{...body,action:'revoke'});assert.equal(f.calls.length,1);
 let calls=0;const service=approvalService({identity:{principal:async()=>({role:'owner',subject:'fixture'})},load:async()=>({content_hash:hash,current:true,intact:true,clear:true,version:'strategy_v2',state:'ai_completed'}),transport:async()=>{calls++;throw Error('timeout');}});
 await assert.rejects(service('fixture',body),/APPROVAL_UNCONFIRMED/);assert.equal(calls,1);
});
test('membership checks precede plan reads',async()=>{
 const service=approvalService({identity:{principal:async()=>({role:'member'})},load:async()=>assert.fail(),transport:async()=>assert.fail()});await assert.rejects(service('fixture',body),/ROLE_REQUIRED/);
});
