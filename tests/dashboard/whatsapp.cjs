'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {service}=require('../../scripts/dashboard/whatsapp.cjs');
function fixture(){
 const actor={org_id:7,subject:'a'.repeat(64),active:true,role:'owner'},reads=[],writes=[];
 const f={actor,reads,writes,result:{saved:true,revision:3,sending_resumed:false,execution_authorized:false}};
 f.identity={principal:async(token,org)=>{assert.equal(token,'verified-token');if(org!==actor.org_id)throw Error('MEMBERSHIP_REQUIRED');return actor;}};
 f.api=service({identity:f.identity,pool:{query:async sql=>{reads.push(sql);return {rows:sql.includes('to_regprocedure')?[{ready:true}]:sql.includes('inbox_read')?[{result:{state:'read_only',items:[{activity_id:8,message:{recipient:'+12345678901',text:'Hello',credential_ref:'DO_NOT_EXPOSE',event_hash:'PRIVATE',stop_reason:'opt_out'}}]}}]:[{connection_id:'one',state:'identity_checked'}]};}},execute:async sql=>{writes.push(sql);return {rows:[{result:f.result}]};}});return f;
}
test('verified Firebase principal scopes reads and projects inbox metadata',async()=>{
 const f=fixture();assert.equal((await f.api.status('verified-token',{org_id:'7'})).customer_signup_available,false);
 const r=await f.api.inbox('verified-token',{org_id:'7',limit:'25'});assert.equal(r.items[0].opted_out,true);assert.equal(r.items[0].text,'Hello');assert(!JSON.stringify(r).includes('DO_NOT_EXPOSE'));assert(!JSON.stringify(r).includes('PRIVATE'));assert(f.reads.at(-1).includes('outreach_whatsapp_inbox_read(7,'));assert.equal(f.writes.length,0);
 assert.equal((await f.api.senders('verified-token',{org_id:'7'})).senders[0].sending_verified,false);
 await assert.rejects(f.api.inbox('verified-token',{org_id:'8'}),/MEMBERSHIP_REQUIRED/);
});
test('forged identity, unexpected fields and malformed paging never reach storage',async()=>{
 const f=fixture();for(const p of [{org_id:7,subject:'forged'},{org_id:7,limit:101},{org_id:'7 OR 1=1'},{org_id:7,before_id:'0'}])await assert.rejects(f.api.inbox('verified-token',p),/INVALID_FILTER/);
 assert.equal(f.reads.length,0);assert.equal(f.writes.length,0);
 f.actor.active=false;await assert.rejects(f.api.status('verified-token',{org_id:7}),/MEMBERSHIP_REQUIRED/);
});
test('inbox administration requires admin membership, versioned receipt and no resumed sending',async()=>{
 const f=fixture(),p={org_id:7,activity_id:8,expected_revision:2,action:'archive',request_id:'request_123'};
 f.actor.role='member';await assert.rejects(f.api.review('verified-token',p),/ROLE_REQUIRED/);assert.equal(f.writes.length,0);
 f.actor.role='admin';assert.equal((await f.api.review('verified-token',p)).sending_resumed,false);
 f.result={saved:true,revision:4,execution_authorized:false,sending_resumed:false};await assert.rejects(f.api.review('verified-token',p),/UNCONFIRMED/);
 f.result={saved:false,reason:'inbox_revision_changed'};await assert.rejects(f.api.review('verified-token',p),/ACTION_REJECTED/);
 f.result={saved:true,idempotent:true,execution_authorized:false};assert.equal((await f.api.review('verified-token',p)).idempotent,true);
});
test('sender lifecycle cannot enable sending or fake a provider check; receipts must match',async()=>{
 const f=fixture(),p={org_id:7,connection_id:'one',expected_version:2,action:'recheck'};
 f.result={org_id:7,connection_id:'one',version:3,state:'pending_check',execution_authorized:false};const r=await f.api.manage('verified-token',p);assert.equal(r.provider_check_performed,false);assert.equal(r.execution_authorized,false);
 for(const changes of [{org_id:8},{connection_id:'other'},{version:4},{state:'ready'},{execution_authorized:true}]){const original=f.result;f.result={...original,...changes};await assert.rejects(f.api.manage('verified-token',p),/UNCONFIRMED/);f.result=original;}
 await assert.rejects(f.api.manage('verified-token',{...p,action:'start'}),/INVALID_FILTER/);
});
