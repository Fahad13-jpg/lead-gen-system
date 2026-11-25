'use strict';
// Visibility only: use existing stable eligibility functions; never reserve/send.
const clean=v=>typeof v==='string'?v.replace(/[\p{Cc}\p{Cf}]/gu,' ').slice(0,255):null;
function project(row){
 const check=row.check||{},reason=typeof check.reason==='string'&&/^[a-z][a-z0-9_]{0,99}$/.test(check.reason)?check.reason:'eligibility_unconfirmed';let state='blocked';
 if(row.activity_state==='provider_accepted')state='provider_accepted';
 else if(row.activity_state&&!row.activity_can_resume)state=['provider_rejected','failed','cancelled','stopped'].includes(row.activity_state)?'blocked':'needs_reconciliation';
 else if(['suppressed_replied_or_bounced','stop_event_recorded'].includes(reason))state='stopped';
 else if(row.expired===true||row.campaign_current!==true||reason==='stale_plan')state='refresh_required';
 else if(check.ready===true)state=row.step>2?'release_scope_review_required':'ready_for_release_review';
 else if(reason==='delay_not_elapsed')state='waiting_delay';
 else if(reason==='previous_confirmed_send_required')state='waiting_previous';
 else if(reason==='outside_sending_window')state='waiting_window';
 return{plan_id:String(row.plan_id),lead_id:row.lead_id,company_name:clean(row.company_name),step:row.step,campaign_version:row.campaign_version,campaign_current:row.campaign_current===true,expires_at:row.expires_at,state,reason,
  due_at:typeof check.due_at==='string'&&Number.isFinite(Date.parse(check.due_at))?check.due_at:null,activity_state:clean(row.activity_state),execution_authorized:false};
}
function service({pool,identity}){return async(token,p)=>{
 if(!p||Object.keys(p).some(k=>!['org_id','campaign_id','page','limit'].includes(k)))throw Error('INVALID_FILTER');
 const parse=(v,fallback,max)=>{if(v===undefined)return fallback;if(!/^[1-9][0-9]*$/.test(String(v))||!Number.isSafeInteger(Number(v))||Number(v)>max)throw Error('INVALID_FILTER');return Number(v);};
 const org=parse(p.org_id,null,2147483647),campaign=parse(p.campaign_id,null,Number.MAX_SAFE_INTEGER),page=parse(p.page,1,10000),limit=parse(p.limit,10,25);if(!org||!campaign)throw Error('INVALID_FILTER');
 const actor=await identity.principal(token,org);if(actor.org_id!==org)throw Error('MEMBERSHIP_REQUIRED');
 const r=(await pool.query(`WITH campaign AS (SELECT id,version FROM strategy_campaigns WHERE org_id=${org} AND id=${campaign}),
 candidates AS (SELECT p.id AS plan_id,p.org_id,p.lead_id,p.campaign_version,p.content_hash,p.expires_at,p.expires_at<=now() AS expired,p.campaign_version=c.version AS campaign_current,l.company_name,steps.step
 FROM strategy_plans p JOIN campaign c ON c.id=p.campaign_id LEFT JOIN cleaned_leads l ON l.org_id=p.org_id AND l.id=p.lead_id
 CROSS JOIN LATERAL generate_series(2,least(10,CASE WHEN jsonb_typeof(p.body#>'{artifacts,schedule,sequence}')='array' THEN jsonb_array_length(p.body#>'{artifacts,schedule,sequence}') ELSE 0 END)) steps(step)
 WHERE p.org_id=${org} AND p.body->>'version'='strategy_v2' AND (p.body#>'{artifacts,schedule,sequence}')->(steps.step-1)->>'channel'='email'),
 selected AS (SELECT * FROM candidates ORDER BY plan_id DESC,step LIMIT ${limit} OFFSET ${(page-1)*limit}),
 assessed AS (SELECT s.*,a.dispatch_metadata->>'state' AS activity_state,CASE WHEN a.id IS NULL THEN false ELSE outreach_email_can_resume(a.dispatch_metadata) END AS activity_can_resume,
 outreach_followup_check(jsonb_build_object('org_id',s.org_id,'plan_id',s.plan_id,'content_hash',s.content_hash,'step',s.step)) AS "check"
 FROM selected s LEFT JOIN LATERAL(SELECT id,dispatch_metadata FROM outreach_activities WHERE org_id=s.org_id AND dispatch_metadata->>'plan_id'=s.plan_id::text AND dispatch_metadata->>'step'=s.step::text ORDER BY id DESC LIMIT 1)a ON true)
 SELECT EXISTS(SELECT 1 FROM campaign) AS found,(SELECT count(*)::integer FROM candidates) AS total,coalesce((SELECT jsonb_agg(to_jsonb(assessed) ORDER BY plan_id DESC,step) FROM assessed),'[]'::jsonb) AS items`)).rows[0];
 if(typeof r?.found!=='boolean'||!Number.isInteger(r.total)||!Array.isArray(r.items))throw Error('DATA_UNAVAILABLE');
 return{found:r.found,total:r.total,items:r.items.map(project),page,limit,execution_authorized:false,limitations:['read_only_eligibility_snapshot','fresh_operator_release_required','quota_and_sender_rechecked_at_execution','existing_two_step_rollout_limit'],observed_at:new Date().toISOString()};
};}
module.exports={project,service};
