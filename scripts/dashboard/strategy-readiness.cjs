'use strict';
// Readiness is advisory until admission/claim. Existing SQL reservations and
// execution gates remain authoritative; never infer provider availability.
function assess(s){
 const reasons=[];if(s?.package_allowed===false)reasons.push('PLUS_REQUIRED');const management=s?.instances===1&&s?.active===true;
 if(!management)reasons.push('STRATEGY_SERVICE_UNAVAILABLE');
 if(s?.campaign_found!==true)reasons.push('STRATEGY_CAMPAIGN_NOT_FOUND');
 if(s?.worker_enabled!==true)reasons.push('STRATEGY_PROCESSING_PAUSED');
 if(!['ai','template'].includes(s?.mode))reasons.push('STRATEGY_MODE_UNSUPPORTED');
 const limit=Number.isSafeInteger(s?.monthly_limit)&&s.monthly_limit>=0?s.monthly_limit:null;
 const used=Number.isSafeInteger(s?.requests_used)&&s.requests_used>=0?s.requests_used:null;
 if(s?.mode==='ai'){
  if(s.ai_enabled!==true||limit===null||limit===0)reasons.push('STRATEGY_AI_ALLOWANCE_REQUIRED');
  else if(used===null)reasons.push('STRATEGY_READINESS_UNCONFIRMED');
  else if(used>=limit)reasons.push('STRATEGY_AI_LIMIT_REACHED');
 }
 return{management_available:management,generation_allowed:reasons.length===0,mode:['ai','template','hybrid'].includes(s?.mode)?s.mode:null,
  processing_enabled:s?.worker_enabled===true,ai_enabled:s?.ai_enabled===true,monthly_limit:limit,requests_used:used,requests_remaining:limit!==null&&used!==null?Math.max(0,limit-used):null,
  reasons,provider_status:'not_checked',sending_authorized:false,observed_at:new Date().toISOString()};
}
function readinessLoader(pool){return async(org,campaign=null)=>{
 if(!Number.isSafeInteger(org)||org<1||campaign!==null&&(!/^[1-9][0-9]{0,18}$/.test(String(campaign))||BigInt(campaign)>9223372036854775807n))throw Error('INVALID_FILTER');
 const row=(await pool.query(`WITH planners AS (SELECT w.active FROM workflow_entity w WHERE
  EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(w.nodes::jsonb)='array' THEN w.nodes::jsonb ELSE '[]'::jsonb END) n WHERE n->>'type'='n8n-nodes-base.webhook' AND n#>>'{parameters,path}'='strategy-request')
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(w.nodes::jsonb)='array' THEN w.nodes::jsonb ELSE '[]'::jsonb END) n WHERE n->>'name'='Prepare Strategy'))
 SELECT jsonb_build_object('instances',(SELECT count(*)::integer FROM planners),'active',(SELECT bool_and(active) FROM planners),
 'worker_enabled',coalesce((SELECT enabled FROM strategy_controls WHERE id),false),
 'ai_enabled',coalesce((SELECT enabled FROM strategy_ai_controls WHERE org_id=${org}),false),
 'monthly_limit',coalesce((SELECT monthly_limit FROM strategy_ai_controls WHERE org_id=${org}),0),
 'requests_used',(SELECT count(*)::integer FROM strategy_ai_requests WHERE org_id=${org} AND reserved_at>=date_trunc('month',now())),
 'campaign_found',${campaign===null?'false':`EXISTS(SELECT 1 FROM strategy_campaigns WHERE org_id=${org} AND id=${campaign})`},
 'package_allowed',${campaign===null?'true':`organization_channels_allowed(${org},(SELECT v.config FROM strategy_campaigns c JOIN strategy_campaign_versions v ON v.org_id=c.org_id AND v.campaign_id=c.id AND v.version=c.version WHERE c.org_id=${org} AND c.id=${campaign}))`},
 'mode',${campaign===null?'NULL':`(SELECT v.config->>'mode' FROM strategy_campaigns c JOIN strategy_campaign_versions v ON v.org_id=c.org_id AND v.campaign_id=c.id AND v.version=c.version WHERE c.org_id=${org} AND c.id=${campaign})`}) AS snapshot`)).rows[0];
 return assess(row?.snapshot);
};}
module.exports={assess,readinessLoader};
