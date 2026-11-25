'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{adapter}=require('../../scripts/calling/tool-storage.cjs');
const binding={org_id:1,activity_id:2,provider_call_id:'call_1',connection_ref:'trusted',calendar_id:'fixture@example.invalid'};
test('booking storage keeps provider/tenant binding out of agent control',async()=>{
 const seen=[];const a=adapter(binding,async sql=>{seen.push(sql);return {acquired:true};});
 await a.claimBooking({org_id:1,calendar_id:binding.calendar_id,call_id:'call_1',provider_call_id:'attacker',connection_ref:'attacker',event_id:'a'.repeat(64)});
 assert.match(seen[0],/"provider_call_id":"call_1"/);assert.doesNotMatch(seen[0],/attacker/);
 await assert.rejects(a.claimBooking({org_id:2,calendar_id:binding.calendar_id,call_id:'call_1'}),/TENANT_MISMATCH/);
});
test('finish keeps the trusted calendar and marks only a confirmed adapter receipt',async()=>{
 let sql;const a=adapter(binding,async q=>{sql=q;return {saved:true};});
 await a.finishBooking({event_id:'a'.repeat(64),calendar_id:'attacker',state:'booked'});assert.match(sql,/"receipt_verified":true/);assert.doesNotMatch(sql,/attacker/);
 await a.finishBooking({event_id:'a'.repeat(64),state:'reconciliation_required'});assert.match(sql,/"receipt_verified":false/);
});
test('opt-out uses the existing durable stop audit',async()=>{
 let sql;const a=adapter(binding,async q=>{sql=q;return {saved:true};});assert.equal((await a.stop('opt_out',"event'1")).saved,true);
 assert.match(sql,/outreach_call_stop/);assert.match(sql,/event''1/);
});
