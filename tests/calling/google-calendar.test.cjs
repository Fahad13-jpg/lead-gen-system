'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const g=require('../../scripts/calling/google-calendar.cjs'),{book}=require('../../scripts/calling/calendar.cjs');
const c={org_id:1,calendar_id:'fixture@example.invalid',status:'ready'};
const r={org_id:1,calendar_id:c.calendar_id,call_id:'fixture-call',slot_id:'slot',confirmed_by_recipient:true,event_id:'a'.repeat(64),start:'2026-11-02T14:00:00Z',end:'2026-11-02T14:15:00Z'};
const free=(busy=[])=>({timeMin:r.start,timeMax:r.end,calendars:{[c.calendar_id]:{busy}}});
const event=()=>({...g.eventRequest(r,c).body,status:'confirmed'});
test('availability rejects missing, errored or incomplete calendars',()=>{for(const d of [{},free(null),{...free(),timeMax:'2026-11-02T14:10:00Z'},{...free(),calendars:{[c.calendar_id]:{busy:[],errors:[{reason:'forbidden'}]}}}])assert.throws(()=>g.availability(d,r,c));});
test('overlap blocks booking while touching boundaries are allowed',()=>{assert.equal(g.availability(free([{start:'2026-11-02T13:00:00Z',end:r.start}]),r,c),true);assert.equal(g.availability(free([{start:'2026-11-02T14:05:00Z',end:'2026-11-02T14:10:00Z'}]),r,c),false);});
test('calendar and tenant cannot be supplied by untrusted agent input',()=>{assert.throws(()=>g.freeRequest({...r,org_id:2},c));assert.throws(()=>g.freeRequest({...r,calendar_id:'other'},c));assert.throws(()=>g.freeRequest({...r,calendar_id:'primary'},{...c,calendar_id:'primary'}));});
test('ambiguous local timestamps rejected',()=>{assert.throws(()=>g.freeRequest({...r,start:'2026-11-02T09:00:00'},c));});

test('impossible calendar dates cannot silently roll into another day',()=>{
 for(const value of ['2026-02-29T10:00:00Z','2026-04-31T10:00:00Z','2026-11-02T24:00:00Z','2026-11-02T10:60:00Z'])assert.equal(g.instant(value),false,value);
 assert.equal(g.instant('2028-02-29T10:00:00-05:00'),true);
});

test('equivalent timezone offsets keep one booking identity',async()=>{
 const ids=[];
 const d={mode:'mock',now:()=> '2026-10-28T00:00:00Z',authorizedCalendar:async()=>true,
 claimBooking:async q=>{ids.push(q.event_id);return {acquired:false};}};
 await book(r,d);
 await book({...r,start:'2026-11-02T09:00:00-05:00',end:'2026-11-02T09:15:00-05:00'},d);
 assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);
});
test('event has no attendees, conference creation or invitations',()=>{const p=g.eventRequest(r,c);assert.match(p.url,/sendUpdates=none$/);assert.equal(p.body.attendees,undefined);assert.equal(p.body.conferenceData,undefined);});
test('receipt must match times and organization correlation',()=>{assert.deepEqual(g.receipt(event(),r,c),{id:r.event_id});for(const e of [{...event(),status:'cancelled'},{...event(),start:{dateTime:r.end}},{...event(),extendedProperties:{private:{org_id:'2',call_id:r.call_id}}}])assert.throws(()=>g.receipt(e,r,c));});
test('uncertain insertion is reconciled with GET, not another insert',async()=>{const seen=[];const a=g.adapter(c,{mode:'mock',request:async q=>{seen.push(q.method);if(q.method==='POST')throw Error('timeout');return {status:200,data:event()};}});await assert.rejects(a.insertEvent(r));assert.equal((await a.reconcile(r)).state,'booked');assert.deepEqual(seen,['POST','GET']);});
test('404 does not permit another insertion',async()=>{const a=g.adapter(c,{mode:'mock',request:async()=>({status:404})});assert.deepEqual(await a.reconcile(r),{state:'reconciliation_required',retry_allowed:false});});
test('live Calendar adapter remains closed',()=>assert.throws(()=>g.adapter(c,{mode:'live'}),/LIVE_CALENDAR/));
test('booking orchestrator works with real API mapping and mock responses',async()=>{let calls=0;const a=g.adapter(c,{mode:'mock',request:async q=>{calls++;return q.url.endsWith('freeBusy')?{status:200,data:free()}:{status:200,data:{...q.body,status:'confirmed'}};}});const result=await book(r,{mode:'mock',now:()=> '2026-10-28T00:00:00Z',authorizedCalendar:async()=>true,claimBooking:async()=>({acquired:true}),finishBooking:async()=>({saved:true}),...a});assert.equal(result.state,'booked');assert.equal(calls,2);});
