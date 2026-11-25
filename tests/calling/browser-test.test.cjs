'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {handle,authorizedCall,valid}=require('../../scripts/calling/browser-test.cjs');
const now='2026-11-15T10:00:00.000Z',token='fixture-browser-session';
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'browser-acceptance-')),file=path.join(dir,'session.json');
 const s={version:'browser_acceptance_v1',enabled:true,id:'a'.repeat(32),org_id:1,agent_id:'agent_test',agent_version:1,token_hash:crypto.createHash('sha256').update(token).digest('hex'),created_at:now,expires_at:'2026-11-15T10:10:00.000Z',timezone:'Asia/Karachi',calendar:{ready:true,id:'fixture@example.invalid',slots:[{id:'slot',start:'2026-11-16T10:00:00.000Z',end:'2026-11-16T10:05:00.000Z'}]}};
 fs.writeFileSync(file,JSON.stringify(s));const call={call_id:'call_fixture',agent_id:s.agent_id,agent_version:1,call_type:'web_call',call_status:'ongoing',start_timestamp:Date.parse(now),retell_llm_dynamic_variables:{browser_test_token:token}};
 const deps={now:()=>now,calendar:()=>({isFree:async()=>true,insertEvent:async r=>({id:r.event_id})})};
 const invoke=(name,args={},actual=call)=>handle({body:{name,args}},actual,file,deps);
 return {file,s,call,deps,invoke,read:()=>JSON.parse(fs.readFileSync(file)),cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};}
test('only ongoing provider-verified session token and pinned version can bind',async()=>{const f=fixture();try{
 assert.equal(valid(f.s,Date.parse(now)),true);
 for(const change of [{agent_version:0},{call_type:'phone_call'},{call_status:'ended'},{retell_llm_dynamic_variables:{browser_test_token:'forged'}},{start_timestamp:Date.parse(now)-1}])assert.equal(authorizedCall(f.s,{...f.call,...change},Date.parse(now)),false);
 const nonce='b'.repeat(64),n={...f.s,token_hash:crypto.createHash('sha256').update(nonce).digest('hex')};
 assert.equal(authorizedCall(n,{...f.call,retell_llm_dynamic_variables:{approved_call_brief:'Browser test session: '+nonce+'\nFictional test facts'}},Date.parse(now)),true);
 assert.equal(authorizedCall(n,{...f.call,retell_llm_dynamic_variables:{approved_call_brief:'Browser test session: '+nonce+' Fictional test facts'}},Date.parse(now)),true);
 assert.equal(authorizedCall(n,{...f.call,retell_llm_dynamic_variables:{approved_call_brief:'Browser test session: '+nonce+'0 Fictional test facts'}},Date.parse(now)),false);
 assert.equal(authorizedCall(n,{...f.call,retell_llm_dynamic_variables:{approved_call_brief:'Browser test session: '+nonce+'\nBrowser test session: '+nonce}},Date.parse(now)),false);
 assert.equal(authorizedCall(n,{...f.call,retell_llm_dynamic_variables:{approved_call_brief:'Browser test session: '+nonce+' Browser test session: '+nonce}},Date.parse(now)),false);
 const r=await f.invoke('get_available_slots');assert.equal(r.slots.length,1);assert.equal(r.real_lead_updated,false);
 assert.equal((await f.invoke('get_available_slots',{}, {...f.call,call_id:'call_other'})).ok,false);
 assert.equal(f.read().call_id,'call_fixture');
 }finally{f.cleanup();}});
test('durable isolated opt-out survives reload and blocks later interest or booking',async()=>{const f=fixture();try{
 const r=await f.invoke('opt_out',{event_id:'recipient-opt-out'});assert.equal(r.saved,true);assert.equal(r.persistence_scope,'isolated_browser_test');
 assert.equal(f.read().stop_reason,'opt_out');assert.equal((await f.invoke('opt_out',{event_id:'recipient-opt-out'})).replayed,true);
 assert.equal((await f.invoke('record_outcome',{event_id:'later',outcome:'interested'})).ok,false);
 f.deps.calendar=()=>assert.fail('no Calendar after stop');assert.equal((await f.invoke('book_meeting',{slot_id:'slot',confirmed_by_recipient:true})).ok,false);
 }finally{f.cleanup();}});
test('confirmed booking has one durable claim and no repeated insertion',async()=>{const f=fixture();try{let insertions=0;
 f.deps.calendar=()=>({isFree:async()=>true,insertEvent:async r=>{insertions++;return{id:r.event_id};}});
 assert.equal((await f.invoke('book_meeting',{slot_id:'slot',confirmed_by_recipient:false})).reason,'unique_owner_slot_and_confirmation_required');
 const r=await f.invoke('book_meeting',{slot_id:'slot',confirmed_by_recipient:true});assert.equal(r.state,'booked');assert.equal(f.read().booking.state,'booked');
 await f.invoke('book_meeting',{slot_id:'slot',confirmed_by_recipient:true});assert.equal(insertions,1);
 }finally{f.cleanup();}});
test('uncertain insertion retains claim and cannot insert a second time',async()=>{const f=fixture();try{let n=0;
 f.deps.calendar=()=>({isFree:async()=>true,insertEvent:async()=>{n++;throw Error('timeout');}});
 assert.equal((await f.invoke('book_meeting',{slot_id:'slot',confirmed_by_recipient:true})).state,'reconciliation_required');
 assert.equal((await f.invoke('book_meeting',{slot_id:'slot',confirmed_by_recipient:true})).state,'reconciliation_required');assert.equal(n,1);
 }finally{f.cleanup();}});
test('expired, locked, forged tenant and exhausted sessions cannot mutate',async()=>{const f=fixture();try{
 assert.equal((await f.invoke('record_outcome',{org_id:2,event_id:'x',outcome:'interested'})).reason,'invalid_tool_arguments');
 fs.writeFileSync(f.file+'.lock','');assert.equal((await f.invoke('opt_out',{event_id:'stop'})).reason,'browser_test_result_uncertain');fs.unlinkSync(f.file+'.lock');
 const s=f.read();s.requests=20;fs.writeFileSync(f.file,JSON.stringify(s));assert.equal((await f.invoke('get_available_slots')).ok,false);
 assert.equal((await f.invoke('opt_out',{event_id:'stop'})).saved,true);
 f.deps.now=()=> '2026-11-15T10:11:00.000Z';assert.equal((await f.invoke('opt_out',{event_id:'other'})).ok,false);
 }finally{f.cleanup();}});
