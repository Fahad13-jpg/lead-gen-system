'use strict';
// Explicit, short-lived browser acceptance fixture. Never writes production leads,
// approvals, attempts, quotas or campaign state. Calendar writes are real test events.
const fs=require('node:fs'),path=require('node:path'),{createHash,timingSafeEqual}=require('node:crypto');
const {instant}=require('./google-calendar.cjs');
const names=new Set(require('./tool-contract.json').tools.map(t=>t.name));
const deny=reason=>({ok:false,reason,action_completed:false,retry_allowed:false,test_only:true,real_lead_updated:false});
function valid(s,now){
 try{new Intl.DateTimeFormat('en',{timeZone:s.timezone});}catch{return false;}
 return s?.version==='browser_acceptance_v1'&&s.enabled===true&&/^[a-f0-9]{32}$/.test(s.id||'')&&
  Number.isSafeInteger(s.org_id)&&s.org_id>0&&typeof s.agent_id==='string'&&Number.isSafeInteger(s.agent_version)&&
  /^[a-f0-9]{64}$/.test(s.token_hash||'')&&instant(s.created_at)&&instant(s.expires_at)&&
  Date.parse(s.created_at)<=now&&now<Date.parse(s.expires_at)&&Date.parse(s.expires_at)-Date.parse(s.created_at)<=15*60000&&
  s.calendar?.ready===true&&typeof s.calendar.id==='string'&&!!s.calendar.id&&s.calendar.id!=='primary'&&
  Array.isArray(s.calendar.slots)&&s.calendar.slots.length>0&&s.calendar.slots.length<=3&&
  s.calendar.slots.every(x=>typeof x.id==='string'&&instant(x.start)&&instant(x.end)&&Date.parse(x.start)>now&&Date.parse(x.end)>Date.parse(x.start));
}
function authorizedCall(s,actual,now){
 if(!valid(s,now))return false;
 const variables=actual.retell_llm_dynamic_variables||{};
 // The editor already exposes approved_call_brief. A nonce in that provider-held
 // data also supports editors that cannot add a second dynamic variable.
 const markers=typeof variables.approved_call_brief==='string'&&variables.approved_call_brief.length<=12000
  ?[...variables.approved_call_brief.matchAll(/(?:^|\s)Browser test session:[ \t]+([a-f0-9]{64})(?=\s|$)/g)]:[];
 const token=variables.browser_test_token||(markers.length===1?markers[0][1]:undefined);
 if(typeof token!=='string'||token.length>256)return false;
 const hash=createHash('sha256').update(token).digest();
 return timingSafeEqual(hash,Buffer.from(s.token_hash,'hex'))&&actual.call_type==='web_call'&&
  actual.call_status==='ongoing'&&actual.agent_id===s.agent_id&&actual.agent_version===s.agent_version&&
  /^call_[A-Za-z0-9_-]{1,150}$/.test(actual.call_id||'')&&
  Number.isFinite(actual.start_timestamp)&&actual.start_timestamp>=Date.parse(s.created_at)&&actual.start_timestamp<=now;
}
// Lock failures and unknown commits never trigger an automatic replay.
function transaction(file,fn){
 const lock=file+'.lock';let fd;
 try{fd=fs.openSync(lock,'wx',0o600);}catch{throw Error('BROWSER_TEST_BUSY_OR_UNCERTAIN');}
 try{const s=JSON.parse(fs.readFileSync(file,'utf8')),result=fn(s);
  const tmp=file+'.next';const out=fs.openSync(tmp,'wx',0o600);
  try{fs.writeFileSync(out,JSON.stringify(s));fs.fsyncSync(out);}finally{fs.closeSync(out);}
  fs.renameSync(tmp,file);return result;
 }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
function execute(s,op,p,now){
 const binding={org_id:s.org_id,activity_id:s.id,provider_call_id:s.call_id,connection_ref:'browser-test:'+s.id};
 if(Object.entries(binding).some(([k,v])=>String(p[k])!==String(v)))return {saved:false,reason:'test_binding_mismatch'};
 if(op==='outreach_call_tool_context')return {...binding,allowed:!s.stop_reason,reason:s.stop_reason?'call_stopped':undefined,calendar:s.calendar,recipient_timezone:s.timezone};
 if(op==='outreach_call_result'){
  if(typeof p.event_id!=='string'||!p.event_id||p.event_id.length>200)return {saved:false,reason:'invalid_event_id'};
  if(!['interested','busy','not_interested','wrong_person','human_requested','unknown','callback_requested','opt_out','meeting_booked'].includes(p.outcome))return {saved:false,reason:'invalid_outcome'};
  const event={event_id:p.outcome==='opt_out'?'recipient-opt-out':p.event_id,outcome:p.outcome,note:typeof p.note==='string'?p.note.slice(0,1000):'',requested_at:p.requested_at,timezone:p.timezone,confirmed_by_recipient:p.confirmed_by_recipient};
  s.events=s.events||[];const old=s.events.find(x=>x.event_id===event.event_id);
  if(old)return {saved:JSON.stringify(old)===JSON.stringify(event),replayed:true};
  if(s.stop_reason&&p.outcome!=='opt_out')return {saved:false,reason:'call_stopped'};
  if(p.outcome==='meeting_booked'&&s.booking?.state!=='booked')return {saved:false,reason:'confirmed_booking_required'};
  if(p.outcome==='callback_requested'){
   let local;try{local=new Intl.DateTimeFormat('sv-SE',{timeZone:p.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(p.requested_at)).replace(' ','T');}catch{}
   if(p.confirmed_by_recipient!==true||!instant(p.requested_at)||Date.parse(p.requested_at)<=now||Date.parse(p.requested_at)>now+90*86400000||local!==p.requested_at.slice(0,19))return {saved:false,reason:'confirmed_callback_time_and_timezone_required'};
  }
  if(s.events.length>=20&&p.outcome!=='opt_out')return {saved:false,reason:'test_event_limit'};
  s.events.push(event);if(['opt_out','wrong_person','meeting_booked','human_requested','not_interested'].includes(p.outcome))s.stop_reason=p.outcome;
  return {saved:true,outcome:p.outcome,execution_authorized:false};
 }
 if(op==='outreach_call_booking'){
  if(p.calendar_id!==s.calendar.id||!/^[a-f0-9]{64}$/.test(p.event_id||''))return {saved:false,reason:'test_calendar_mismatch'};
  if(p.operation==='claim'){
   if(s.booking)return {acquired:false,existing:{state:s.booking.state==='claimed'?'reconciliation_required':s.booking.state,event_id:s.booking.event_id,retry_allowed:false}};
   if(s.stop_reason)return {acquired:false,reason:'call_stopped'};
   if(p.confirmed_by_recipient!==true||!s.calendar.slots.some(x=>x.id===p.slot_id&&x.start===p.start&&x.end===p.end))return {acquired:false,reason:'owner_offered_slot_required'};
   s.booking={state:'claimed',event_id:p.event_id,slot_id:p.slot_id,start:p.start,end:p.end};return {acquired:true};
  }
  if(p.operation==='finish'&&s.booking?.event_id===p.event_id&&['booked','unavailable'].includes(p.state)&&
   (p.state!=='booked'||p.receipt_verified===true)){
   if(s.booking.state!=='claimed')return {saved:s.booking.state===p.state};
   s.booking.state=p.state;return {saved:true};
  }
 }
 return {saved:false,reason:'test_operation_forbidden'};
}
async function handle(input,actual,file,deps){
 let snapshot;try{snapshot=JSON.parse(fs.readFileSync(file,'utf8'));}catch{return deny('browser_test_not_armed');}
 if(!names.has(input.body?.name)||!authorizedCall(snapshot,actual,Date.parse(deps.now())))return deny('browser_test_not_authorized');
 try{
  const admitted=transaction(file,s=>{
   if(!authorizedCall(s,actual,Date.parse(deps.now()))||s.call_id&&s.call_id!==actual.call_id)return false;
   if((s.requests||0)>=20&&input.body.name!=='opt_out')return false;
   s.call_id=actual.call_id;s.requests=Math.min(21,(s.requests||0)+1);return true;
  });if(!admitted)return deny('browser_test_bound_or_limit_reached');
  const binding={org_id:snapshot.org_id,activity_id:snapshot.id,provider_call_id:actual.call_id,connection_ref:'browser-test:'+snapshot.id};
  const executeOperation=async(op,p)=>transaction(file,s=>{
   if(!authorizedCall(s,actual,Date.parse(deps.now()))||s.call_id!==actual.call_id)return {saved:false,allowed:false,reason:'browser_test_expired'};
   return execute(s,op,p,Date.parse(deps.now()));
  });
  const result=await require('./tools.cjs').create({mode:'connected',transport_verified:true,authenticate:async()=>binding,now:deps.now,executeOperation,
   calendar:b=>deps.calendar({...b,test_session_id:snapshot.id})}).invoke(input.body.name,input.body.args,input);
  return {...result,test_only:true,persistence_scope:'isolated_browser_test',real_lead_updated:false};
 }catch{return deny('browser_test_result_uncertain');}
}
module.exports={valid,authorizedCall,transaction,execute,handle};
