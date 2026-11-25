'use strict';
const {query}=require('./storage.cjs'),{book}=require('./calendar.cjs'),{adapter:store}=require('./tool-storage.cjs'),{instant}=require('./google-calendar.cjs');
// Trusted backend port. The connected gateway authenticates and binds the call.
function create(deps){
 async function invoke(name,args,request){
  if(deps.mode!=='mock'&&!(deps.mode==='connected'&&deps.transport_verified===true))throw Error('LIVE_CALL_TOOLS_NOT_CONNECTED');
  // The gateway resolves a binding from the authenticated call. Agent arguments
  // never select org, activity, connection, calendar or provider call identity.
  const binding=await deps.authenticate(request);
  if(!Number.isSafeInteger(binding?.org_id)||binding.org_id<=0||!binding.activity_id||!binding.provider_call_id||!binding.connection_ref)return {ok:false,reason:'unauthenticated_call'};
  const allowed={get_available_slots:[],book_meeting:['slot_id','confirmed_by_recipient'],record_outcome:['outcome','event_id','note'],request_callback:['requested_at','timezone','confirmed_by_recipient','event_id'],opt_out:['event_id']};
  if(!Object.hasOwn(allowed,name)||!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!allowed[name].includes(k)))return {ok:false,reason:'invalid_tool_arguments'};
  const base={org_id:binding.org_id,activity_id:String(binding.activity_id),provider_call_id:binding.provider_call_id,connection_ref:binding.connection_ref};
  const execute=async(operation,payload)=>deps.executeOperation
   ?deps.executeOperation(operation,{...payload,...base})
   :deps.executeQuery(query(operation,{...payload,...base}));
  if(name==='opt_out')return execute('outreach_call_result',{outcome:'opt_out',event_id:args.event_id});
  const context=await execute('outreach_call_tool_context',{});
  if(context?.allowed!==true)return {ok:false,reason:context?.reason||'call_context_unavailable'};
  if(context.org_id!==base.org_id||String(context.activity_id)!==base.activity_id||context.provider_call_id!==base.provider_call_id||context.connection_ref!==base.connection_ref)return {ok:false,reason:'context_binding_mismatch'};
  if(name==='record_outcome'){
   if(!['interested','busy','not_interested','wrong_person','human_requested','unknown'].includes(args.outcome))return {ok:false,reason:'invalid_outcome'};
   return execute('outreach_call_result',args);
  }
  if(name==='request_callback'){
   if(args.confirmed_by_recipient!==true||!instant(args.requested_at))return {ok:false,reason:'confirmed_explicit_callback_required'};
   return execute('outreach_call_result',{...args,outcome:'callback_requested'});
  }
  const c=context.calendar;
  if(c?.ready!==true||typeof c.id!=='string'||!c.id||c.id==='primary'||!Array.isArray(c.slots))return {ok:false,reason:'calendar_not_connected'};
  const now=Date.parse(deps.now());if(!Number.isFinite(now))return {ok:false,reason:'invalid_clock'};
  const valid=s=>s&&typeof s.id==='string'&&s.id.length>0&&s.id.length<=128&&instant(s.start)&&instant(s.end)&&Date.parse(s.start)>now&&Date.parse(s.end)>Date.parse(s.start)&&Date.parse(s.end)-Date.parse(s.start)<=86400000;
  const candidates=c.slots.slice(0,100).filter(valid);
  const slots=candidates.filter(s=>candidates.filter(other=>other.id===s.id).length===1).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
  const calendar=deps.calendar({org_id:base.org_id,calendar_id:c.id});
  if(name==='get_available_slots'){
   const result=[];let unknown=0;
   // At most five provider checks per tool call, three offered slots, no guesses.
   for(const slot of slots.slice(0,5)){
    try{if(await calendar.isFree({org_id:base.org_id,calendar_id:c.id,start:slot.start,end:slot.end})===true)result.push({slot_id:slot.id,start:slot.start,end:slot.end});}catch{unknown++;}
    if(result.length===3)break;
   }
   return {ok:true,slots:result,timezone:context.recipient_timezone,availability_unknown:unknown>0,booking_confirmed:false};
  }
  const matches=slots.filter(s=>s.id===args.slot_id);
  if(matches.length!==1||args.confirmed_by_recipient!==true)return {ok:false,reason:'unique_owner_slot_and_confirmation_required'};
  const slot=matches[0],storage=store({...base,calendar_id:c.id},deps.executeQuery,deps.executeOperation);
  const result=await book({org_id:base.org_id,calendar_id:c.id,call_id:base.provider_call_id,slot_id:slot.id,start:slot.start,end:slot.end,confirmed_by_recipient:true},
   {mode:deps.mode,transport_verified:deps.transport_verified,now:deps.now,authorizedCalendar:async()=>true,...storage,...calendar});
  if(result.state==='booked'){
   const stopped=await execute('outreach_call_result',{outcome:'meeting_booked',event_id:'booking:'+result.event_id});
   return {...result,followups_stopped:stopped?.saved===true,review_required:stopped?.saved!==true};
  }
  return result;
 }
 return {invoke};
}
module.exports={create};
