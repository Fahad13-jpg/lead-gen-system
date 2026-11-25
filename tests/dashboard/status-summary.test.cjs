'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const summary=require('../../scripts/dashboard/status-summary.cjs');
const now=Date.parse('2026-11-17T10:00:00+05:00');
const ready={state:'ready',send_capable:true,reply_capable:true,checked_at:new Date(now-60000).toISOString()};
const campaign={plans:1,reviewable_plans:1,current_approvals:1};
test('sender readiness requires recent checks and both capabilities; saved state is never live execution authority',()=>{
 assert.equal(summary.sender(ready,now).status,'checked');
 for(const patch of [{checked_at:null},{checked_at:new Date(now-86400001).toISOString()},{checked_at:new Date(now+1).toISOString()},{reply_capable:false},{send_capable:false},{state:'unexpected-private-error'}])assert.equal(summary.sender({...ready,...patch},now).status,'needs_attention');
 for(const [state,status]of [['disconnected','disconnected'],['disabled','paused'],['pending_check','needs_attention']])assert.equal(summary.sender({...ready,state},now).status,status);
 assert.equal(summary.sender(ready,now).execution_authorized,false);
});
test('Apify distinguishes ongoing searches from unsettled results without inventing balance verification',()=>{
 assert.equal(summary.apify(null).status,'not_connected');
 const a={key_configured:true,enabled:true};assert.equal(summary.apify(a).status,'configured');assert.equal(summary.apify(a).balance_verified,false);
 assert.equal(summary.apify({...a,active_searches:2}).status,'in_use');assert.equal(summary.apify({...a,unsettled_searches:1}).next_action.code,'review_searches');assert.equal(summary.apify({...a,enabled:false}).status,'paused');
});
test('campaign presentation separates draft, failed/expired plans, approval and channel release',()=>{
 assert.equal(summary.campaign({plans:0}).status,'draft');
 assert.equal(summary.campaign({plans:2,reviewable_plans:0,current_approvals:0}).status,'needs_attention');
 assert.equal(summary.campaign({...campaign,current_approvals:0}).status,'awaiting_approval');
 assert.equal(summary.campaign(campaign).status,'paused');assert.equal(summary.campaign(campaign).reason,'channel_release_required');
});
test('uncertainty and unsettled billing remain visible even with other active work and never recommend a retry',()=>{
 assert.equal(summary.campaign({...campaign,uncertain_activities:1,active_activities:1}).next_action.code,'reconcile');
 assert.equal(summary.campaign({...campaign,unsettled_calls:1,active_activities:1}).next_action.code,'review_cost');
 assert.equal(summary.campaign({...campaign,active_activities:1}).status,'running');
 assert.equal(summary.campaign({...campaign,queued_activities:1}).status,'scheduled');
 for(const c of [campaign,{...campaign,active_activities:1},{...campaign,uncertain_activities:1}]){const s=summary.campaign(c);assert.equal(s.execution_authorized,false);assert.equal(s.automatic_retry_allowed,false);assert.equal(s.eligibility_checked,false);}
});
test('an automation flag alone cannot show Running and expired/mismatched approval cannot be Scheduled',()=>{
 const lifecycle_inputs={authority_present:true,authority_status:'approved',scope_matches:true,authority_end:new Date(now+60000).toISOString(),automatic_enabled:true,email_policy_enabled:true};
 const c={...campaign,lifecycle_inputs};
 assert.equal(summary.campaign(c,{now,automationAvailable:false}).reason,'automation_service_unavailable');
 assert.equal(summary.campaign(c,{now,automationAvailable:true}).status,'scheduled');
 for(const patch of [{scope_matches:false},{authority_end:'bad'},{authority_end:new Date(now-1).toISOString()}])assert.equal(summary.campaign({...c,lifecycle_inputs:{...lifecycle_inputs,...patch}},{now,automationAvailable:true}).status,'needs_attention');
 assert.equal(summary.campaign({...c,lifecycle_inputs:{...lifecycle_inputs,automatic_enabled:false}},{now}).status,'paused');
});
test('campaign projection removes internal assessment inputs and cannot emit private raw reasons',()=>{
 const r=summary.projectCampaign({...campaign,id:'1',lifecycle_inputs:{authority_status:'private-provider-message',credential_ref:'secret'}},{now});assert.equal(r.id,'1');assert.equal(r.lifecycle.status,'paused');
 assert(!JSON.stringify(r).includes('secret'));assert(!JSON.stringify(r).includes('private-provider-message'));assert(!Object.hasOwn(r,'lifecycle_inputs'));assert(!Object.hasOwn(r,'current_approvals'));
});


test('uncertain paid work has a useful explanation without granting retry or execution',()=>{
 const job=summary.projectJob({status:'needs_review',provider_run_recorded:false,provider_dataset_recorded:false});
 assert.match(job.lifecycle.description,/may have started/);assert.equal(job.lifecycle.automatic_retry_allowed,false);assert.equal(job.lifecycle.execution_authorized,false);
 const c=summary.campaign({...campaign,uncertain_activities:1});assert.match(c.description,/before sending a replacement/);assert.equal(c.next_action.code,'reconcile');
});
test('completed gathering progresses through cleaning and current assessments without inventing verification',()=>{
 const job={status:'completed',staged_count:2,cleaned_count:2,assessed_count:2,cleaning_active_count:0,cleaning_review_count:0,basic_failed_count:0,basic_pending_count:0,basic_processing_count:0,basic_current_count:2};
 for(const [patch,label] of [[{},'Business checks saved'],[{cleaning_active_count:1},'Organizing businesses'],[{cleaning_review_count:1},'Some records need checking'],[{basic_processing_count:1},'Checking business details'],[{basic_pending_count:1},'Waiting to check details'],[{basic_failed_count:1},'Some details need checking'],[{basic_current_count:1},'Some details need checking']]){
  const result=summary.projectJob({...job,...patch}).lifecycle;assert.equal(result.label,label);assert.equal(result.execution_authorized,false);assert.equal(result.automatic_retry_allowed,false);
 }
 assert.match(summary.projectJob(job).lifecycle.description,/Some details may still be missing/);
 assert.equal(summary.projectJob({status:'completed',cleaned_count:0,assessed_count:0}).lifecycle.label,'Search finished');
 assert.notEqual(summary.projectJob({...job,basic_current_count:undefined}).lifecycle.label,'Business checks saved');
 assert.equal(summary.projectJob({...job,provider_run_recorded:true,provider_dataset_recorded:true,provider_references_valid:true,provider_cost_recorded:false}).lifecycle.label,'Final cost needs checking');
});
