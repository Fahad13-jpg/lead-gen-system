'use strict';
// Pure scheduling decision over a fresh, trusted DB snapshot; never send authority.
function check({plan,step,previous,checks,now=Date.now()}){
 const deny=reason=>({ready:false,execution_authorized:false,reason});
 if(!Number.isSafeInteger(step)||step<2||step>10)return deny('invalid_step');
 if(!plan||plan.version!=='strategy_v2'||!Number.isFinite(now))return deny('invalid_plan');
 if(plan.qualification?.fit==='weak')return deny('weak_fit_human_review');
 if(!checks||checks.approved_hash_current!==true||checks.context_current!==true)return deny('approval_or_context_stale');
 for(const key of ['not_suppressed','no_reply','no_bounce','no_wrong_person','no_meeting_booked','channel_ready'])if(checks[key]!==true)return deny(key+'_required');
 const draft=plan.artifacts?.followup_drafts?.find(d=>d.step===step);
 if(!draft||draft.channel!=='email'||draft.status!=='requires_plan_approval_and_execution_checks'||typeof draft.body!=='string'||!draft.body.trim())return deny('approved_followup_message_required');
 if(!Number.isInteger(draft.delay_days)||draft.delay_days<0||draft.delay_days>60)return deny('invalid_delay');
 // The caller must prove org/plan/step identity and match the approved message hash.
 if(!previous||previous.identity_matches!==true||previous.step!==step-1||previous.state!=='provider_accepted')return deny('previous_confirmed_send_required');
 const sent=Date.parse(previous.sent_at);
 if(!Number.isFinite(sent)||sent>now)return deny('invalid_previous_send_time');
 const due=sent+draft.delay_days*86400000;
 if(now<due)return {...deny('delay_not_elapsed'),due_at:new Date(due).toISOString()};
 if(checks.within_sending_window!==true)return {...deny('outside_sending_window'),due_at:new Date(due).toISOString()};
 return {ready:true,execution_authorized:false,reason:'due_for_dispatch_recheck',due_at:new Date(due).toISOString(),step};
}
module.exports={check};
