'use strict';
// Pure function embedded in Code nodes. Never exposes provider text or credentials.
function normalize(response,binding,poll=false){
 const base={org_id:binding.org_id,activity_id:String(binding.activity_id),lease:binding.lease,
  connection_ref:binding.connection_ref,content_hash:binding.content_hash};
 const d=response?.body,q=binding.request;
 const valid=response?.statusCode===(poll?200:201)&&d&&q&&q.metadata&&typeof q.metadata==='object'&&typeof d.call_id==='string'&&
  /^[A-Za-z0-9_-]{1,128}$/.test(d.call_id)&&d.call_type==='phone_call'&&
  d.agent_id===q.override_agent_id&&d.agent_version===q.override_agent_version&&
  d.from_number===q.from_number&&d.to_number===q.to_number&&
  ['registered','ongoing','ended','error','not_connected'].includes(d.call_status)&&
  Object.entries(q.metadata).every(([k,v])=>d.metadata?.[k]===v)&&
  (!poll||binding.provider_call_id===d.call_id);
 if(!valid)return {operation:poll?'none':'outreach_call_uncertain',payload:base,
  state:'reconciliation_required',retry_allowed:false};
 const payload={...base,provider_call_id:d.call_id,status:d.call_status,
  duration_ms:Number.isSafeInteger(d.duration_ms)&&d.duration_ms>=0&&d.duration_ms<=86400000?d.duration_ms:null};
 if(['user_requested_dnc','dial_no_answer','dial_busy','user_requested_callback','user_hangup','agent_hangup','voicemail_reached','ivr_reached','inactivity','max_duration_reached'].includes(d.disconnection_reason))payload.disconnection_reason=d.disconnection_reason;
 if(typeof d.call_analysis?.call_summary==='string')payload.analysis={
  summary:d.call_analysis.call_summary.replace(/[\x00-\x1f\x7f]/g,' ').slice(0,1000),
  sentiment:['Positive','Negative','Neutral'].includes(d.call_analysis.user_sentiment)?d.call_analysis.user_sentiment:'Unknown'};
 return {operation:'outreach_call_observe',payload};
}
module.exports={normalize};
