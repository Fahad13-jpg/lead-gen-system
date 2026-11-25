'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {checker}=require('../../scripts/dashboard/whatsapp-check.cjs');
function fixture(){
 const task={org_id:7,connection_id:'one',version:2,credential_ref:'secret-ref',waba_id:'123456789',phone_number_id:'987654321',api_version:'v25.0',credential_expires_at:new Date(Date.now()+3600000).toISOString()};
 const f={task,reads:[],writes:[],inspections:0,member:true,ready:true,observed:null,saved:{state:'identity_checked',version:3,sending_verified:false,execution_authorized:false}};
 const identity={principal:async()=>({org_id:7,subject:'a'.repeat(64),role:'owner',active:true})};
 f.api=checker({identity,pool:{query:async(sql,args)=>{f.reads.push({sql,args});return {rows:sql.includes('check_input')?[{result:{ready:f.ready,task}}]:[{data:'ENCRYPTED_ONLY'}]};}},inspect:async p=>{f.inspections++;assert.equal(p.encrypted,'ENCRYPTED_ONLY');return f.observed||{...task,state:'identity_checked',execution_authorized:false,capabilities:{account_sender_match:true},verified_at:new Date().toISOString()};},transaction:async fn=>fn({query:async(sql,args)=>{f.writes.push({sql,args});return {rows:sql.includes('FROM organizations')?[{id:7}]:sql.includes('FROM org_sender_memberships')?(f.member?[{subject:'a'.repeat(64)}]:[]):sql.includes('sender_whatsapp_checked')?[{result:f.saved}]:[]};}})});f.p={org_id:7,connection_id:'one',expected_version:2};return f;
}
test('registry authorization precedes ciphertext access; checked receipts grant no sending permission',async()=>{
 const f=fixture(),r=await f.api('verified',f.p);assert.equal(r.state,'identity_checked');assert.equal(r.sending_verified,false);assert(!JSON.stringify(r).includes('secret-ref'));assert.equal(f.reads.length,2);assert(f.reads[0].sql.includes('check_input'));assert(f.writes.some(c=>c.sql.includes('FOR SHARE OF m')));assert.equal(f.inspections,1);
 const g=fixture();g.ready=false;await assert.rejects(g.api('verified',g.p),/ACTION_REJECTED/);assert.equal(g.inspections,0);assert.equal(g.reads.length,1);
});
test('membership revoked during the provider check prevents readiness persistence',async()=>{
 const f=fixture();f.member=false;await assert.rejects(f.api('verified',f.p),/MEMBERSHIP_REQUIRED/);assert(!f.writes.some(c=>c.sql.includes('sender_whatsapp_checked')));
});
test('changed task scope, provider result, version or receipt cannot report a successful check',async()=>{
 const f=fixture();f.task.org_id=8;await assert.rejects(f.api('verified',f.p),/UNCONFIRMED/);assert.equal(f.inspections,0);
 for(const mutate of [g=>g.observed={...g.task,org_id:8,state:'identity_checked',execution_authorized:false},g=>g.saved={...g.saved,version:4},g=>g.saved={...g.saved,sending_verified:true}]){const g=fixture();mutate(g);await assert.rejects(g.api('verified',g.p),/UNCONFIRMED/);}
});
test('invalid browser inputs cannot supply credential references or provider observations',async()=>{
 const f=fixture();for(const extra of [{credential_ref:'forged'},{state:'identity_checked'},{expected_version:'2'},{org_id:0},{connection_id:'x;DROP TABLE'}])await assert.rejects(f.api('verified',{...f.p,...extra}),/INVALID_FILTER/);assert.equal(f.reads.length,0);
});
test('account-check HTTP transport enforces its smaller streaming bound',async()=>{
 const {createGet}=require('../../scripts/whatsapp/recheck-http.cjs');const p={method:'GET',url:'https://graph.facebook.com/v25.0/123456789/phone_numbers',redirect:'error',timeout:10000,maxResponseBytes:65536};
 const get=createGet(async()=>new Response('{"data":[]}'),'MOCK',{maxResponseBytes:65536});assert.deepEqual(await get(p),{status:200,data:{data:[]}});
 await assert.rejects(createGet(async()=>new Response('x'.repeat(65537)),'MOCK',{maxResponseBytes:65536})(p),/PROVIDER_RECHECK_UNCONFIRMED/);
});
