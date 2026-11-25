'use strict';
const core=require('./core.cjs');

// Preparation only. The installed SQL executor continues to reject later steps.
// A sequence becomes part of the plan before hashing and human approval.
function prepareSequence(input,now=new Date().toISOString()){
 const config=input?.campaign?.config,dispatch=config?.whatsapp_dispatch,sequence=config?.sequence;
 const fail=(reason,step)=>({allowed:false,reason,...(step?{step}:{}),execution_authorized:false});
 if(!Array.isArray(sequence)||!sequence.length||sequence.length>10)return fail('invalid_whatsapp_sequence');
 if(sequence.some(s=>s?.channel!=='whatsapp'))return fail('mixed_sequence_requires_cross_channel_gate');
 const templates=dispatch?.templates_by_step;
 if(templates!==undefined&&(templates===null||typeof templates!=='object'||Array.isArray(templates)))return fail('invalid_step_templates');
 if(templates&&Object.keys(templates).some(k=>!sequence.some((_,i)=>k===String(i+1))))return fail('unknown_template_step');
 const steps=[],rendered=new Set();
 for(let i=0;i<sequence.length;i++){
  const s=sequence[i],step=i+1;
  if(s.step!==step||!Number.isInteger(s.delay_days)||s.delay_days<0||s.delay_days>60||(step===1&&s.delay_days!==0))return fail('invalid_whatsapp_sequence',step);
  // Never copy the first template to a later step implicitly.
  const template=templates?.[String(step)]??(step===1?dispatch?.template:undefined);
  if(!template)return fail('approved_step_template_required',step);
  const candidate={...input,campaign:{...input.campaign,config:{...config,whatsapp_dispatch:{...dispatch,template}}}};
  const result=core.prepare(candidate,now);
  if(!result.allowed)return fail(result.reason,step);
  if(rendered.has(result.artifact.rendered))return fail('repeated_step_message_requires_revision',step);
  rendered.add(result.artifact.rendered);
  steps.push({step,channel:'whatsapp',delay_days:s.delay_days,previous_step:i||null,delay_basis:step===1?'initial':'previous_confirmed_send',stop_on:['reply','opt_out','bounce','wrong_person','meeting_booked'],artifact:result.artifact});
 }
 return {allowed:true,sequence:{version:'whatsapp_sequence_v1',org_id:input.lead.org_id,lead_id:input.lead.id,steps,execution_authorized:false},execution_authorized:false};
}
module.exports={prepareSequence};
