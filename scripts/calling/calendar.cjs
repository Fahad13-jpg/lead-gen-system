'use strict';
const {createHash}=require('node:crypto');
const {instant}=require('./google-calendar.cjs');
// Availability must be rechecked at booking, including the connected adapter.
// Storage port serializes org/calendar/slot and reconciles uncertain inserts.
async function book(request,deps){
 if(deps.mode!=='mock'&&!(deps.mode==='connected'&&deps.transport_verified===true))throw Error('LIVE_BOOKING_NOT_IMPLEMENTED');
 const r=request||{},start=Date.parse(r.start),end=Date.parse(r.end),now=Date.parse(deps.now());
 if(!Number.isSafeInteger(r.org_id)||r.org_id<=0||!r.calendar_id||!r.call_id||!r.slot_id||
  r.confirmed_by_recipient!==true||!instant(r.start)||!instant(r.end)||!Number.isFinite(now)||start<=now||end<=start)
  return {state:'blocked',reason:'confirmed_future_slot_required'};
 if(await deps.authorizedCalendar(r.org_id,r.calendar_id)!==true)return {state:'blocked',reason:'calendar_org_mismatch'};
 // Equivalent offsets must not create a second event identity on replay.
 const event_id=createHash('sha256').update(JSON.stringify([r.org_id,r.calendar_id,r.call_id,r.slot_id,new Date(start).toISOString(),new Date(end).toISOString()])).digest('hex');
 let claimed;
 try{claimed=await deps.claimBooking({...r,event_id});}
 catch{return {state:'reconciliation_required',event_id,reason:'booking_claim_commit_unknown',retry_allowed:false};}
 if(claimed?.existing)return claimed.existing;
 if(claimed?.acquired!==true)return {state:'pending',reason:'slot_locked'};
 try{
  if(await deps.isFree(r)!==true){await deps.finishBooking({event_id,state:'unavailable'});return {state:'unavailable'};}
  const event=await deps.insertEvent({...r,event_id,send_updates:false});
  if(event?.id!==event_id)throw Error('RECEIPT_MISMATCH');
  const saved=await deps.finishBooking({event_id,state:'booked'});
  if(saved?.saved!==true)throw Error('SAVE_UNKNOWN');
  return {state:'booked',event_id};
 }catch{
  // Do not free the slot and insert again after an uncertain provider response.
  return {state:'reconciliation_required',event_id,retry_allowed:false};
 }
}
module.exports={book};
