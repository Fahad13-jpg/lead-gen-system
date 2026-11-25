'use strict';
const retell=require('./retell.cjs'),storage=require('./storage.cjs');
const {normalize}=require('./n8n-receipt.cjs');
// Mock-only GET reconciliation. No create-call operation, retries or credentials.
async function reconcile(row,deps){
 if(deps?.mode!=='mock')throw Error('LIVE_RECONCILIATION_NOT_IMPLEMENTED');
 if(!row||!Number.isSafeInteger(row.org_id)||row.org_id<=0||!row.activity_id||!row.lease||
 !row.connection_ref||!row.content_hash||!row.expected_request||
 row.expected_request.metadata?.org_id!==String(row.org_id)||
 row.expected_request.metadata?.activity_id!==String(row.activity_id)||
 row.expected_request.metadata?.plan_hash!==row.content_hash)
  return {state:'blocked',reason:'reconciliation_binding_invalid'};
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(row.provider_call_id||''))
  return {state:'reconciliation_required',reason:'provider_call_id_unknown',retry_allowed:false};
 let result,observation;
 try{
  const response=await deps.getCall({connection_ref:row.connection_ref,org_id:row.org_id,
   method:'GET',url:'https://api.retellai.com/v2/get-call/'+row.provider_call_id});
  if(response?.status!==200)throw Error('LOOKUP_UNAVAILABLE');
  result=retell.snapshot(response.data,row.expected_request,row.provider_call_id);
  const normalized=normalize({statusCode:200,body:response.data},{...row,activity_id:String(row.activity_id),request:row.expected_request},true);
  if(normalized.operation!=='outreach_call_observe')throw Error('UNVERIFIED_OBSERVATION');
  observation=normalized.payload;
 }catch{return {state:'reconciliation_required',reason:'provider_lookup_unverified',retry_allowed:false};}
 try{
  const saved=await deps.executeQuery(storage.query('outreach_call_ingest',observation));
  if(saved?.saved!==true)return {state:'reconciliation_required',reason:'observation_not_saved',retry_allowed:false};
  return {state:result.ended?'awaiting_final_cost':'provider_accepted',saved:true,replayed:saved.replayed===true,retry_allowed:false};
 }catch{return {state:'reconciliation_required',reason:'observation_commit_unknown',retry_allowed:false};}
}
module.exports={reconcile};
