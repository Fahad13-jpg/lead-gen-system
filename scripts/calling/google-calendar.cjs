'use strict';
// API mapping; connected transport is injected by the credential-bound n8n worker.
function instant(v){
 if(typeof v!=='string')return false;
 const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-](\d{2}):(\d{2}))$/.exec(v);
 if(!m||!Number.isFinite(Date.parse(v)))return false;
 const [,y,month,day,hour,minute,second]=m.map((s,i)=>i>0&&i<7?Number(s):s);
 const leap=y%4===0&&(y%100!==0||y%400===0);
 const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 return month>=1&&month<=12&&day>=1&&day<=days[month-1]&&hour<24&&minute<60&&second<60&&
  (m[7]==='Z'||(Number(m[8])<24&&Number(m[9])<60));
}
function validate(r,c){
 if(!Number.isSafeInteger(r?.org_id)||r.org_id<=0||c?.org_id!==r.org_id||c.status!=='ready'||
 typeof c.calendar_id!=='string'||!c.calendar_id||c.calendar_id==='primary'||r.calendar_id!==c.calendar_id||
 !instant(r.start)||!instant(r.end)||Date.parse(r.end)<=Date.parse(r.start)||Date.parse(r.end)-Date.parse(r.start)>86400000)
 throw Error('CALENDAR_BINDING_INVALID');
}
function freeRequest(r,c){validate(r,c);return {method:'POST',url:'https://www.googleapis.com/calendar/v3/freeBusy',
 body:{timeMin:r.start,timeMax:r.end,timeZone:'UTC',items:[{id:c.calendar_id}]}};}
function availability(data,r,c){
 validate(r,c);
 const entry=data?.calendars?.[c.calendar_id];
 if(!instant(data?.timeMin)||!instant(data?.timeMax)||Date.parse(data.timeMin)>Date.parse(r.start)||
 Date.parse(data.timeMax)<Date.parse(r.end)||!entry||!Array.isArray(entry.busy)||
 (entry.errors!==undefined&&(!Array.isArray(entry.errors)||entry.errors.length)))throw Error('CALENDAR_AVAILABILITY_UNKNOWN');
 for(const b of entry.busy){if(!instant(b?.start)||!instant(b?.end)||Date.parse(b.end)<=Date.parse(b.start))throw Error('CALENDAR_AVAILABILITY_UNKNOWN');}
 return !entry.busy.some(b=>Date.parse(b.start)<Date.parse(r.end)&&Date.parse(b.end)>Date.parse(r.start));
}
function eventRequest(r,c){
 validate(r,c);
 if(!/^[a-f0-9]{64}$/.test(r.event_id||'')||typeof r.call_id!=='string'||!r.call_id||r.call_id.length>128||
 r.confirmed_by_recipient!==true)throw Error('CONFIRMED_BOOKING_REQUIRED');
 return {method:'POST',url:'https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(c.calendar_id)+'/events?sendUpdates=none',
 body:{id:r.event_id,summary:'Requested business meeting',start:{dateTime:r.start},end:{dateTime:r.end},
 transparency:'opaque',visibility:'private',reminders:{useDefault:false},
 extendedProperties:{private:{org_id:String(r.org_id),call_id:r.call_id}}}};
}
function receipt(data,r,c){
 const expected=eventRequest(r,c).body;
 if(data?.id!==expected.id||data.status!=='confirmed'||!instant(data.start?.dateTime)||!instant(data.end?.dateTime)||
 Date.parse(data.start.dateTime)!==Date.parse(r.start)||Date.parse(data.end.dateTime)!==Date.parse(r.end)||
 data.extendedProperties?.private?.org_id!==String(r.org_id)||data.extendedProperties?.private?.call_id!==r.call_id)
 throw Error('CALENDAR_RECEIPT_MISMATCH');
 return {id:data.id};
}
function adapter(connection,deps){
 if(deps?.mode!=='mock'&&!(deps?.mode==='connected'&&deps.transport_verified===true))throw Error('LIVE_CALENDAR_NOT_IMPLEMENTED');
 return {
  async isFree(r){const response=await deps.request(freeRequest(r,connection));if(response?.status!==200)throw Error('CALENDAR_LOOKUP_FAILED');return availability(response.data,r,connection);},
  async insertEvent(r){const response=await deps.request(eventRequest(r,connection));if(response?.status!==200&&response?.status!==201)throw Error('CALENDAR_INSERT_UNCERTAIN');return receipt(response.data,r,connection);},
  async reconcile(r){
   const insert=eventRequest(r,connection);
   try{const response=await deps.request({method:'GET',url:insert.url.split('?')[0]+'/'+r.event_id});
    if(response?.status!==200)return {state:'reconciliation_required',retry_allowed:false};
    return {state:'booked',event_id:receipt(response.data,r,connection).id};
   }catch{return {state:'reconciliation_required',retry_allowed:false};}
  }
 };
}
module.exports={instant,freeRequest,availability,eventRequest,receipt,adapter};
