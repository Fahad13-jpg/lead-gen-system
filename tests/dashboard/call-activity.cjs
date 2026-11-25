'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{project}=require('../../scripts/dashboard/call-activity.cjs');
test('only known call results and explicit valid appointment times are public',()=>{
 const r=project({id:1,channel:'call',call_outcome:'opt_out',call_stop_reason:'opt_out',call_booking_state:'booked',call_booking_start:'2026-11-16T19:31:00Z',call_booking_end:'2026-11-16T19:36:00Z',call_callback_state:'requested_pending_approved_step'});
 assert.equal(r.call_result.outcome,'opt_out');assert.equal(r.call_result.booking.state,'booked');assert.equal(r.call_result.callback_requested,true);assert.ok(!Object.hasOwn(r,'call_outcome'));
 const invalid=project({channel:'call',call_outcome:'SECRET_RAW_PROVIDER_ERROR',call_stop_reason:'SECRET',call_booking_state:'claimed',call_booking_start:'tomorrow',call_booking_end:'later'});
 assert.equal(JSON.stringify(invalid).includes('SECRET'),false);assert.equal(invalid.call_result.outcome,null);assert.equal(invalid.call_result.booking.start,null);
});
test('non-call activities cannot expose call result data',()=>{
 assert.deepEqual(project({id:1,channel:'email',call_outcome:'opt_out',call_stop_reason:'opt_out',call_booking_state:'booked'}),{id:1,channel:'email'});
});
