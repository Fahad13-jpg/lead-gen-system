'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const file='workflows/07B_linkedIn_outreach_helper.json';
function build(){
 const w=JSON.parse(fs.readFileSync(file,'utf8')),before=structuredClone(w);const node=name=>{const n=w.nodes.find(n=>n.name===name);assert(n);return n;};
 w.active=false;
 w.settings={...w.settings,saveDataSuccessExecution:'none',saveDataErrorExecution:'none',saveManualExecutions:false};
 node('Schedule Trigger').parameters={rule:{interval:[{field:'minutes',minutesInterval:5}]}};
 const pg=node('Get LinkedIn-Ready Leads');pg.alwaysOutputData=true;pg.parameters={operation:'executeQuery',query:`-- Operator org binding: 0 intentionally disables this local workflow. Never accept org from unauthenticated input.
SELECT p.org_id,p.id AS plan_id,(d->>'step')::integer AS step
FROM strategy_plans p
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.body->'artifacts'->'linkedin_manual'->'steps')='array' THEN p.body->'artifacts'->'linkedin_manual'->'steps' ELSE '[]'::jsonb END) d
WHERE p.org_id=0 AND CASE WHEN coalesce(d->>'step','') ~ '^([1-9]|10)$' THEN outreach_linkedin_gate(p.org_id,p.id,(d->>'step')::integer)->>'allowed'='true' ELSE false END
AND NOT EXISTS(SELECT 1 FROM outreach_activities a WHERE a.org_id=p.org_id AND a.dispatch_metadata->>'plan_id'=p.id::text AND a.dispatch_metadata->>'step'=d->>'step')
ORDER BY p.created_at,p.id LIMIT 30`,options:{}};
 node('Format LinkedIn Actions').parameters={mode:'runOnceForAllItems',jsCode:"return $input.all().flatMap((item,index)=>{const x=item.json;if(!Number.isSafeInteger(x.org_id)||x.org_id<=0||!/^([1-9]|10)$/.test(String(x.step))||!/^\\d+$/.test(String(x.plan_id)))return [];return [{json:{org_id:x.org_id,plan_id:String(x.plan_id),step:x.step,connection_note_status:'ok'},pairedItem:{item:index}}];});"};
 node('Insert LinkedIn Task').parameters={operation:'executeQuery',query:"SELECT outreach_linkedin_prepare('{{ JSON.stringify({org_id:$json.org_id,plan_id:$json.plan_id,step:$json.step}).replace(/'/g, \"''\") }}'::jsonb) AS result",options:{}};node('Insert LinkedIn Task').alwaysOutputData=true;
 node('Mark LinkedIn Ready').parameters={operation:'executeQuery',query:"SELECT outreach_linkedin_queue('{{ JSON.stringify({org_id:$('Format LinkedIn Actions').item.json.org_id}).replace(/'/g, \"''\") }}'::jsonb) AS result",options:{}};node('Mark LinkedIn Ready').alwaysOutputData=true;
 node('Log Warning - Message Too Long').parameters={mode:'runOnceForEachItem',jsCode:"return {json:{reason:'approved_linkedin_content_required',manual_only:true,execution_authorized:false}};"};
 node('Mark Needs Review').parameters={operation:'executeQuery',query:"SELECT jsonb_build_object('manual_only',true,'reason','approved_linkedin_content_required','execution_authorized',false) AS result",options:{}};node('Mark Needs Review').alwaysOutputData=true;
 if(!w.nodes.some(n=>n.id==='linkedin-manual-v1-corrections'))w.nodes.push({id:'linkedin-manual-v1-corrections',name:'Manual LinkedIn corrections - current scope',type:'n8n-nodes-base.stickyNote',typeVersion:1,position:[420,-640],parameters:{width:740,height:460,content:'CURRENT LOCAL VERSION — requires unapplied migration 045. Disabled org binding=0; workflow inactive. The old sticky note is preserved as history. Its 300-character rule and 20–30 daily advice are superseded: notes default to 200 characters; no guaranteed safe invitation quota. Person profiles only; company pages are research context.\n\nApproved strategy_v2 artifacts are prepared before hashing/approval, with LINKEDIN_MANUAL_ENABLED operator opt-in. No API sending, LinkedIn login/cookies, clicking, inbox scraping or extra AI calls. Copying is not sending. Task events and replies are customer-reported, never provider-verified. Schedule prepares bounded tasks only; Flutter will read the queue and show reminders.\n\nExisting graph and notes retained. All storage is org-scoped outreach_activities JSON, unique per approved plan/step, ON CONFLICT DO NOTHING. Every task/action rechecks approval/hash/evidence and stops; durable stop events remain recordable for stale plans. Never silently edit approved content or restart an expired connection request.\n\nBackend adapter is local and requires trusted org/member authentication; no new public endpoint. Flutter login mapping remains pending. Changing target or outgoing content requires a new reviewed plan. Conversation/booking/calling stages unchanged.'}});
 assert.deepEqual(w.connections,before.connections);
 for(const n of before.nodes.filter(n=>n.type==='n8n-nodes-base.stickyNote'))assert.deepEqual(w.nodes.find(x=>x.id===n.id),n);
 fs.writeFileSync(file,JSON.stringify(w,null,2)+'\n');console.log('LinkedIn helper updated locally; graph and original notes preserved; inactive org=0.');
}
if(require.main===module)build();module.exports={build};
