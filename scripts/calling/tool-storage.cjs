'use strict';
const {query}=require('./storage.cjs');
// Invoke only behind an authenticated provider/tool gateway. No public endpoint.
function adapter(binding,executeQuery,executeOperation){
 if(!Number.isSafeInteger(binding?.org_id)||binding.org_id<=0||!binding.activity_id||!binding.provider_call_id||!binding.connection_ref||!binding.calendar_id)throw Error('CALL_TOOL_BINDING_REQUIRED');
 const base={org_id:binding.org_id,activity_id:String(binding.activity_id),provider_call_id:binding.provider_call_id,connection_ref:binding.connection_ref};
 const execute=(operation,payload)=>executeOperation?executeOperation(operation,payload):executeQuery(query(operation,payload));
 return {
  async claimBooking(r){
   if(r.org_id!==base.org_id||r.calendar_id!==binding.calendar_id||r.call_id!==base.provider_call_id)throw Error('CALL_TOOL_TENANT_MISMATCH');
   return execute('outreach_call_booking',{...r,...base,operation:'claim'});
  },
  async finishBooking(r){return execute('outreach_call_booking',{...r,...base,calendar_id:binding.calendar_id,operation:'finish',receipt_verified:r.state==='booked'});},
  async stop(kind,event_id){return execute('outreach_call_stop',{...base,kind,event_id});}
 };
}
module.exports={adapter};
