'use strict';
const c=require('./core.cjs');
// Mockable transport port. No token loading, network client or live default.
async function execute(candidate,deps){
 if(deps?.mode!=='mock'&&!(deps?.mode==='live'&&deps.liveEnabled===true))throw Error('LIVE_WHATSAPP_NOT_CONNECTED');
 const start=await deps.executeQuery(c.query('outreach_whatsapp_begin',candidate));
 if(start?.authorized!==true)return start;
 const binding={org_id:candidate.org_id,activity_id:start.activity_id,lease:start.lease,content_hash:candidate.content_hash};
 let result,diagnostic;
 try{const response=await deps.request(c.request(start.artifact),start.artifact);if(response.status!==200){diagnostic={phase:'http_response'};for(const k of ['http_status','provider_error_code','provider_error_subcode'])if(Number.isSafeInteger(response.diagnostic?.[k]))diagnostic[k]=response.diagnostic[k];throw Error('RESPONSE_UNCERTAIN');}result=c.receipt(response.data,start.artifact);}
 catch{try{const saved=await deps.executeQuery(c.query('outreach_whatsapp_finish',{...binding,state:'uncertain'}));return {...saved,...(diagnostic?{diagnostic}:{})};}catch{return {state:'uncertain',reason:'attempt_commit_unknown',retry_allowed:false,...(diagnostic?{diagnostic}:{})};}}
 // Persistence failure never causes a second provider submission.
 try{const saved=await deps.executeQuery(c.query('outreach_whatsapp_finish',{...binding,...result}));return saved?.saved===true?saved:{state:'uncertain',reason:'acceptance_not_recorded',retry_allowed:false};}
 catch{return {state:'uncertain',reason:'acceptance_commit_unknown',retry_allowed:false};}
}
module.exports={execute};
