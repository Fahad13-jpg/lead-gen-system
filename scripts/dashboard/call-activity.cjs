'use strict';
// Project only recorded calling outcomes, never provider payloads or credentials.
const {instant}=require('../calling/google-calendar.cjs');
const outcomes=new Set(['interested','busy','line_busy','no_answer','not_interested','callback_requested','wrong_person','human_requested','opt_out','unknown','meeting_booked']);
const stops=new Set(['opt_out','wrong_person','meeting_booked','not_interested','human_requested']);
function project(row){
 const {call_outcome,call_stop_reason,call_booking_state,call_booking_start,call_booking_end,call_callback_state,...rest}=row;
 if(row.channel!=='call')return rest;
 const booking=['claimed','booked','unavailable','reconciliation_required'].includes(call_booking_state)?call_booking_state:null;
 const times=booking&&instant(call_booking_start)&&instant(call_booking_end)&&Date.parse(call_booking_end)>Date.parse(call_booking_start);
 return {...rest,call_result:{outcome:outcomes.has(call_outcome)?call_outcome:null,followup_pause_reason:stops.has(call_stop_reason)?call_stop_reason:null,
  booking:booking?{state:booking,start:times?call_booking_start:null,end:times?call_booking_end:null}:null,
  callback_requested:call_callback_state==='requested_pending_approved_step'}};
}
module.exports={project};
