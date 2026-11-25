'use strict';
// Read-only product summaries. Never used as execution or retry authority.
const actions={
 connect_sender:'Connect an email account',check_sender:'Check the saved email connection',review_sender:'Review the email connection',
 connect_apify:'Connect an Apify account',review_searches:'Review unsettled searches',view_searches:'View search progress',view_settings:'Review connection settings',
 create_plan:'Prepare a strategy',review_content:'Review saved content',prepare_plan:'Prepare a current strategy',
 reconcile:'Review the uncertain result',review_cost:'Reconcile final call costs',view_progress:'View outreach progress',
 review_campaign:'Review campaign automation',review_setup:'Review channel setup',contact_admin:'Ask the workspace administrator to check automation',
 refresh_connection:'Refresh the saved connection',authorize_gmail:'Start a fresh Gmail authorization',review_connection:'Ask the administrator to reconcile the connection',
 review_run:'Ask the administrator to check the existing provider run',wait_search:'Refresh search progress',review_search_budget:'Review search costs before another search'
};
const explanations={
 outreach_result_uncertain:'A provider result is not confirmed. Review the existing activity before sending a replacement.',
 call_cost_unsettled:'A call has not finished cost reconciliation. Review its recorded outcome before starting another.',
 outreach_in_progress:'Outreach is in progress. Open activity to follow recorded results and replies.',
 outreach_queued:'Outreach is queued. Sending still depends on the current schedule, recipient and channel checks.',
 strategy_not_prepared:'This campaign has no saved strategy yet. Prepare one before reviewing messages.',
 current_usable_plan_required:'The saved strategies are no longer usable for the current campaign. Prepare a current draft.',
 content_approval_required:'Review and approve the saved message content before continuing with channel setup.',
 campaign_approval_expired_or_changed:'The campaign scope has changed or its approval has expired. Review the current scope again.',
 automation_service_unavailable:'Campaign automation is unavailable. Ask your workspace administrator to check the service.',
 email_policy_paused:'The email sending policy is paused. Review the campaign controls and sender limits.',
 waiting_for_eligible_step:'Waiting for the next eligible email. Timing, replies, limits and recipient checks can affect when it runs.',
 campaign_approval_revoked:'Campaign approval was revoked. Review the current content and scope before approving again.',
 campaign_automation_paused:'Campaign automation is paused. Open the campaign to review its controls.',
 channel_release_required:'Messages still need the selected channel setup and release checks before sending.',
 provider_reference_incomplete:'The saved provider run details are incomplete. Ask an administrator to check the existing run before starting a replacement.',
 provider_cost_unsettled:'Gathering has ended, but its final provider cost is not confirmed. Reconcile the existing run first.',
 existing_run_requires_review:'A provider run already exists and needs review. Do not start a duplicate search to recover it.',
 paid_start_outcome_unconfirmed:'The provider may have started this search. Confirm its outcome before starting a replacement that could incur another charge.',
 worker_heartbeat_unconfirmed:'We could not confirm recent progress. Check this search before starting another.',
 cancellation_requested:'A stop was requested. Work already accepted by the provider may still finish and incur charges.',
 gathering_in_progress:'Businesses are being collected. Their details may be checked while the search continues.',
 worker_admission_pending:'Your search is waiting to start.',
 search_waiting_in_queue:'Your search is waiting to start. Refresh this page to see its progress.',
 gathering_finished:'The search has finished finding businesses. Their details may still be checked.',
 cleaning_in_progress:'The search has finished finding businesses. Their details are being organized.',
 cleaning_needs_review:'The search has finished finding businesses. Some records need a closer look.',
 assessment_in_progress:'The search has finished finding businesses. Website details are now being checked.',
 assessment_queued:'The search has finished finding businesses. Their details are waiting to be checked.',
 assessments_recorded:'Recent checks are saved for each business. Some details may still be missing. Review contact details and permission before sending a message.',
 assessment_needs_review:'Some details could not be checked or need another check. Use View leads from this search below to review the saved details before sending a message.',
 unstarted_queue_expired:'The search expired while waiting for a worker. Review its budget before deciding whether to create another.',
 search_cancelled:'The search was cancelled. Review saved results and any outstanding provider costs.',
 search_failed:'This search needs review. Check its existing run and costs before deciding whether to create another.',
 search_state_unconfirmed:'The current search state could not be confirmed. Ask an administrator to review the saved job.'
};
function result(status,label,reason,action){return{status,label,reason,description:explanations[reason]||null,next_action:{code:action,label:actions[action]},evidence:'saved_records',execution_authorized:false,automatic_retry_allowed:false};}
function sender(s,now=Date.now()){
 if(s.state==='disconnected')return result('disconnected','Disconnected','sender_disconnected','connect_sender');
 if(s.state==='disabled')return result('paused','Paused','sender_paused','review_sender');
 if(s.state==='pending_check')return result('needs_attention','Check pending','sender_check_pending','check_sender');
 if(s.state!=='ready'||s.send_capable!==true||s.reply_capable!==true)return result('needs_attention','Needs attention','sender_capabilities_unconfirmed','check_sender');
 const at=Date.parse(s.checked_at);
 if(!Number.isFinite(at)||at>now||now-at>86400000)return result('needs_attention','Check needed','sender_check_expired','check_sender');
 return{...result('checked','Recently checked','sender_checks_recorded','view_settings'),checked_at:s.checked_at,live_provider_check:false};
}
function apify(a){
 if(!a?.key_configured)return result('not_connected','Not connected','apify_not_connected','connect_apify');
 if(Number(a.unsettled_searches)>0)return result('needs_attention','Search reconciliation needed','apify_unsettled_searches','review_searches');
 if(a.enabled!==true)return result('paused','Paused','apify_connection_paused','view_settings');
 if(Number(a.active_searches)>0)return result('in_use','Searches in progress','apify_searches_in_progress','view_searches');
 return{...result('configured','Account saved','apify_saved_configuration','view_settings'),live_provider_check:false,balance_verified:false};
}
function campaign(c,{now=Date.now(),automationAvailable=false}={}){
 const x=c.lifecycle_inputs||{};
 const count=k=>Number.isSafeInteger(c[k])&&c[k]>=0?c[k]:0;
 const finish=(...args)=>({...result(...args),eligibility_checked:false});
 if(count('uncertain_activities'))return finish('needs_attention','Needs attention','outreach_result_uncertain','reconcile');
 if(count('unsettled_calls'))return finish('needs_attention','Needs attention','call_cost_unsettled','review_cost');
 if(count('active_activities'))return finish('running','Running','outreach_in_progress','view_progress');
 if(count('queued_activities'))return finish('scheduled','Scheduled','outreach_queued','view_progress');
 if(!count('plans'))return finish('draft','Draft','strategy_not_prepared','create_plan');
 if(!count('reviewable_plans'))return finish('needs_attention','Needs attention','current_usable_plan_required','prepare_plan');
 if(!count('current_approvals'))return finish('awaiting_approval','Awaiting approval','content_approval_required','review_content');
 if(x.authority_present===true){
  if(x.authority_status==='approved'){
   const end=Date.parse(x.authority_end);
   if(x.scope_matches!==true||!Number.isFinite(end)||end<=now)return finish('needs_attention','Needs attention','campaign_approval_expired_or_changed','review_campaign');
   if(x.automatic_enabled===true){
    if(!automationAvailable)return finish('needs_attention','Needs attention','automation_service_unavailable','contact_admin');
    if(x.email_policy_enabled!==true)return finish('paused','Paused','email_policy_paused','review_campaign');
    return finish('scheduled','Scheduled','waiting_for_eligible_step','view_progress');
   }
  }
  return finish('paused','Paused',x.authority_status==='revoked'?'campaign_approval_revoked':'campaign_automation_paused','review_campaign');
 }
 return finish('paused','Paused','channel_release_required','review_setup');
}
function projectCampaign(c,options){
 const lifecycle=campaign(c,options);
 const {lifecycle_inputs,reviewable_plans,current_approvals,uncertain_activities,unsettled_calls,active_activities,queued_activities,...publicFields}=c;
 return{...publicFields,lifecycle};
}
function gmailRecovery(phase){
 const states={
  confirmed:['confirmed','Connection saved','gmail_connection_confirmed','view_settings'],
  restart_available:['restart_available','Fresh authorization available','gmail_fresh_authorization_available','authorize_gmail'],
  in_progress:['pending','Connection update in progress','gmail_operation_in_progress','refresh_connection'],
  needs_review:['needs_attention','Connection needs reconciliation','gmail_link_outcome_unconfirmed','review_connection'],
  unavailable:['needs_attention','Reconciliation unavailable','gmail_reconciliation_unavailable','review_connection']
 };
 return result(...(states[phase]||states.needs_review));
}
function projectJob(j,{now=Date.now()}={}){
 const {provider_run_recorded,provider_dataset_recorded,provider_references_valid,started_recorded,provider_cost_recorded,recovery_code,
  provider_ceiling,provider_actual,platform_ceiling,platform_actual,billing_mode,cost_status,...fields}=j;
 const run=provider_run_recorded===true,dataset=provider_dataset_recorded===true,started=started_recorded===true;
 let state;
 if(run!==dataset||(run||dataset)&&provider_references_valid!==true||j.status==='queued'&&(run||dataset||started))state=result('needs_attention','Needs attention','provider_reference_incomplete','review_run');
 else if(['completed','cancelled','failed'].includes(j.status)&&(run||started)&&provider_cost_recorded!==true)state=result('needs_attention','Final cost needs checking','provider_cost_unsettled','review_run');
 else if(j.status==='needs_review')state=result('needs_attention','Needs attention',run&&dataset?'existing_run_requires_review':'paid_start_outcome_unconfirmed','review_run');
 else if(['running','pending'].includes(j.status)){
  const at=Date.parse(j.heartbeat_at||j.started_at||j.created_at);
  if(!Number.isFinite(at)||at>now||started&&now-at>1200000)state=result('needs_attention','Progress needs checking','worker_heartbeat_unconfirmed','review_run');
  else state=result(j.cancel_requested?'stopping':j.status==='running'?'running':'scheduled',j.cancel_requested?'Stopping':j.status==='running'?'Finding businesses':'Waiting to start',j.cancel_requested?'cancellation_requested':j.status==='running'?'gathering_in_progress':'worker_admission_pending','wait_search');
 }else if(j.status==='queued')state=result('scheduled','Waiting to start','search_waiting_in_queue','wait_search');
 else if(j.status==='completed'){
  if(j.cleaning_active_count>0)state=result('running','Organizing businesses','cleaning_in_progress','wait_search');
  else if(j.cleaning_review_count>0)state=result('needs_attention','Some records need checking','cleaning_needs_review','view_searches');
  else if(j.basic_failed_count>0)state=result('needs_attention','Some details need checking','assessment_needs_review','view_searches');
  else if(j.basic_processing_count>0)state=result('running','Checking business details','assessment_in_progress','wait_search');
  else if(j.basic_pending_count>0)state=result('scheduled','Waiting to check details','assessment_queued','wait_search');
  else if(Number.isInteger(j.cleaned_count)&&j.cleaned_count>0&&j.basic_current_count===j.cleaned_count&&j.cleaning_active_count===0&&j.cleaning_review_count===0&&j.basic_failed_count===0&&j.basic_pending_count===0&&j.basic_processing_count===0)state=result('completed','Business checks saved','assessments_recorded','view_searches');
  else if(Number.isInteger(j.cleaned_count)&&j.cleaned_count>0&&Number.isInteger(j.basic_current_count)&&j.basic_current_count<j.cleaned_count)state=result('needs_attention','Some details need checking','assessment_needs_review','view_searches');
  else state=result('completed','Search finished','gathering_finished','view_searches');
 }
 else if(j.status==='cancelled')state=result('cancelled','Cancelled',j.completion_reason==='queue_expired'?'unstarted_queue_expired':'search_cancelled','view_searches');
 else state=result('needs_attention','Needs attention',j.status==='failed'?'search_failed':'search_state_unconfirmed',run||started?'review_run':'review_search_budget');
 const amount=v=>v!==null&&v!==undefined&&typeof v!=='boolean'&&String(v).trim()!==''&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
 return{...fields,lifecycle:{...state,provider_reference_status:run&&dataset?'recorded':run||dataset?'incomplete':'not_recorded'},billing:{mode:['byok','platform'].includes(billing_mode)?billing_mode:null,provider_ceiling_usd:amount(provider_ceiling),recorded_provider_cost_usd:amount(provider_actual),recorded_platform_ceiling_usd:amount(platform_ceiling),recorded_platform_charge_usd:amount(platform_actual),live_balance_verified:false}};
}
module.exports={sender,apify,campaign,projectCampaign,gmailRecovery,projectJob};
