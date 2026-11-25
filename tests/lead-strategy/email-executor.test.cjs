'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const e=require('../../scripts/lead-strategy/v2/email-executor.cjs');
const row={org_id:1,plan_id:3,content_hash:'a'.repeat(32),email:'demo@example.org',body:{version:'strategy_v2',state:'template_completed',validation_errors:[],strategy:{step1:{channel:'email',parts:[{text:'Approved demo'}]}},artifacts:{email_draft:{subject:'Demo',body:'Approved demo'}}}};
const lease='b'.repeat(32);
function setup({deny=false,beginFail=false,transportFail=false,finishFail=false,rejectFinish=false,unknownReceipt=false}={}){
 const calls=[],deps={sender:{credential_ref:'MOCK',email:'sender@example.org'},
 executeQuery:async sql=>{const first=sql.includes('outreach_email_step_begin');calls.push(first?'begin':'finish');
 if(first){if(beginFail)throw Error('private failure');return {ready:!deny,execution_authorized:!deny,reason:'blocked'};}
 if(finishFail)throw Error('private failure');return {saved:!rejectFinish,state:transportFail||unknownReceipt?'ambiguous':'provider_accepted'};},
 transport:async payload=>{calls.push('transport');assert.equal(payload.body,'Approved demo');if(transportFail)throw Error('timeout');return unknownReceipt?{}:{id:'1234abcdef'};}};
 return {deps,calls};
}
test('default disabled and missing sender perform no I/O',async()=>{
 const {deps,calls}=setup();assert.equal((await e.execute(row,lease,deps)).reason,'transport_disabled');
 deps.sender=null;assert.equal((await e.execute(row,lease,deps,{enabled:true})).reason,'sender_mapping_missing');assert.deepEqual(calls,[]);
});
test('begin gate and uncertain commit never reach transport',async()=>{
 for(const opt of [{deny:true},{beginFail:true}]){const {deps,calls}=setup(opt);const r=await e.execute(row,lease,deps,{enabled:true});assert.notEqual(r.state,'provider_accepted');assert.deepEqual(calls,['begin']);}
});
test('approved message: commit attempt, transport once, persist acceptance',async()=>{
 const {deps,calls}=setup();assert.deepEqual(await e.execute(row,lease,deps,{enabled:true}),{state:'provider_accepted',provider_accepted:true,delivered:false,retry_allowed:false});assert.deepEqual(calls,['begin','transport','finish']);
});
test('timeout or missing receipt persists ambiguity without retries',async()=>{
 for(const opt of [{transportFail:true},{unknownReceipt:true}]){const {deps,calls}=setup(opt);const r=await e.execute(row,lease,deps,{enabled:true});assert.equal(r.state,'ambiguous');assert.equal(r.retry_allowed,false);assert.deepEqual(calls,['begin','transport','finish']);}
});
test('receipt storage failure does not resend accepted message',async()=>{
 for(const opt of [{finishFail:true},{rejectFinish:true}]){const {deps,calls}=setup(opt);const r=await e.execute(row,lease,deps,{enabled:true});assert.equal(r.state,'reconciliation_required');assert.equal(r.provider_accepted,true);assert.equal(r.retry_allowed,false);assert.deepEqual(calls,['begin','transport','finish']);}
});
test('SQL uses approved function names and manual quote escaping',()=>{
 assert(e.query('outreach_email_step_finish',{value:"O'Brien"}).includes("O''Brien"));assert.throws(()=>e.query('anything',{}));
});
test('quota deferral reports queued and never invokes transport or receipt write',async()=>{
 const {deps,calls}=setup();deps.executeQuery=async()=>{calls.push('begin');return {ready:false,queued:true,reason:'mailbox_rolling_limit_reached',next_check_at:'2026-10-19T10:00:00Z'};};
 assert.deepEqual(await e.execute(row,lease,deps,{enabled:true}),{state:'queued',reason:'mailbox_rolling_limit_reached',next_check_at:'2026-10-19T10:00:00Z',sent:false,retry_allowed:false});
 assert.deepEqual(calls,['begin']);
});
test('followup without verified parent context never begins an attempt',async()=>{
 const follow=structuredClone(row);follow.step=2;follow.body.strategy.followups=[{channel:'email',parts:[{text:'Approved demo'}]}];follow.body.artifacts.followup_drafts=[{step:2,intent_index:0,channel:'email',subject:'Demo',body:'Approved demo',status:'requires_plan_approval_and_execution_checks'}];
 const {deps,calls}=setup();assert.equal((await e.execute(follow,lease,deps,{enabled:true})).reason,'conversation_context_required');assert.deepEqual(calls,[]);
 deps.loadParent=async()=>({activity:{org_id:1,plan_id:3,step:1,content_hash:row.content_hash,state:'provider_accepted',credential_ref:'MOCK',sender_email:deps.sender.email,external_id:'11112222'},message:{id:'11112222',threadId:'33334444',payload:{headers:[{name:'From',value:deps.sender.email},{name:'To',value:row.email},{name:'Subject',value:'Demo'},{name:'Message-ID',value:'<original@example.org>'}]}}});
 const transport=deps.transport;deps.transport=async payload=>{assert.equal(payload.gmail_request.threadId,'33334444');return transport(payload);};
 assert.equal((await e.execute(follow,lease,deps,{enabled:true})).state,'provider_accepted');assert.deepEqual(calls,['begin','transport','finish']);
});
