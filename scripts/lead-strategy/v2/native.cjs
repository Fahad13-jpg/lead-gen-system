'use strict';
const c=require('./contract.cjs');
const {responseFormat}=require('./response-format.cjs');
const customer=require('../../organization-policy/customer-plan.cjs');
const {render}=require('../../organization-policy/customer-email-template.cjs');
const {handoff:callHandoff,readiness:callReadiness}=require('../../calling/strategy-handoff.cjs');
const linkedin=require('../../linkedin-manual/core.cjs');
const whatsapp=require('../../whatsapp/core.cjs');
const messenger=require('./messenger.cjs');
const sms=require('./sms.cjs');
const legacyRuntime=require('../runtime.cjs');
const {readiness:emailReadiness}=require('./email-readiness.cjs');
const {normalize:legacyEvidence}=require('./legacy-evidence.cjs');
const {release:releaseDraft}=require('./draft-release.cjs');
const customerMode=config=>config?.mode==='template'&&Object.hasOwn(config?.templates||{},'email');
function arrangeSmsParts(candidate){
 const step=candidate?.step1;
 if(step?.channel!=='sms'||!Array.isArray(step.parts))return {candidate,removed:0,changed:false};
 const seen=new Set(),parts=[];
 for(const part of step.parts){
  if(!part||typeof part!=='object')return {candidate,removed:0,changed:false};
  const key=JSON.stringify([part.type,part.ref,part.text]);
  if(!seen.has(key)){seen.add(key);parts.push(part);}
 }
 const refs=['greeting','sender','cta','opt_out'];
 if(parts.length!==5||refs.some(ref=>parts.filter(part=>part.type==='copy'&&part.ref===ref).length!==1)||parts.filter(part=>part.type==='offer').length!==1)return {candidate,removed:0,changed:false};
 const ordered=[...refs.slice(0,2).map(ref=>parts.find(part=>part.type==='copy'&&part.ref===ref)),parts.find(part=>part.type==='offer'),...refs.slice(2).map(ref=>parts.find(part=>part.type==='copy'&&part.ref===ref))];
 const changed=step.parts.length!==ordered.length||ordered.some((part,i)=>part!==step.parts[i]);
 return {candidate:changed?{...candidate,step1:{...step,parts:ordered}}:candidate,removed:step.parts.length-parts.length,changed};
}
function prepare(claim,{hasKey=false,briefOptions,customerTemplatesEnabled=false,callingIntegrationEnabled=false,linkedinManualEnabled=false,whatsappIntegrationEnabled=false,draftReviewEnabled=false}={}){
 const mode=claim.input.campaign.config.mode;
 if(!['template','ai'].includes(mode))throw Error('V2_REQUIRES_EXPLICIT_AI_OR_TEMPLATE_MODE');
 if(customerMode(claim.input.campaign.config))return {...claim,contract_version:'strategy_v2',mode,
  customer_integration_enabled:customerTemplatesEnabled===true,
  customer_payload:customer.build(claim,{integrationEnabled:customerTemplatesEnabled===true}),wants_ai:false,request:null};
 claim={...claim,input:legacyEvidence(claim.input,briefOptions?.now)};
 const options={...briefOptions};
 if(claim.email_sender_snapshot){const base=options.readinessSnapshot||legacyRuntime.prepare(claim.input).context.readiness;options.readinessSnapshot={...base,email:emailReadiness(claim.input,claim.email_sender_snapshot,base.email,options.now)};}
 if(callingIntegrationEnabled===true&&!options.readinessSnapshot){
  options.readinessSnapshot={...legacyRuntime.prepare(claim.input).context.readiness,call:callReadiness(claim.input,options.now)};
 }
 if(linkedinManualEnabled===true&&claim.input.campaign.config.channels.includes('linkedin')){options.readinessSnapshot={...(options.readinessSnapshot||legacyRuntime.prepare(claim.input).context.readiness),linkedin:linkedin.readiness(claim.input,options.now)};}
 if(whatsappIntegrationEnabled===true&&claim.input.campaign.config.channels.includes('whatsapp'))options.readinessSnapshot={...(options.readinessSnapshot||legacyRuntime.prepare(claim.input).context.readiness),whatsapp:whatsapp.readiness(claim.input,options.now)};
 if(claim.input.campaign.config.channels.includes('messenger'))options.readinessSnapshot={...(options.readinessSnapshot||legacyRuntime.prepare(claim.input).context.readiness),messenger:messenger.readiness(claim.input,options.now)};
 if(claim.input.campaign.config.channels.includes('sms'))options.readinessSnapshot={...(options.readinessSnapshot||legacyRuntime.prepare(claim.input).context.readiness),sms:sms.readiness(claim.input)};
 const prepared=c.build(claim.input,options);
 prepared.calling_sequence_enabled=callingIntegrationEnabled===true;
 prepared.linkedin_manual_enabled=linkedinManualEnabled===true;
 prepared.whatsapp_integration_enabled=whatsappIntegrationEnabled===true;
 return {...claim,contract_version:'strategy_v2',prepared,mode,draft_review_enabled:draftReviewEnabled===true,draft_review_context_hash:draftReviewEnabled===true?c.hash({id:claim.id,org_id:claim.org_id,lease:claim.lease,input:claim.input}):null,calling_integration_enabled:callingIntegrationEnabled===true,wants_ai:mode==='ai'&&hasKey,
  request:{model:'openai/gpt-oss-120b',reasoning_effort:'low',max_completion_tokens:6000,response_format:responseFormat(prepared),messages:[{role:'system',content:prepared.prompt+'\nOUTPUT_SCHEMA\n'+JSON.stringify(prepared.schema)},{role:'user',content:JSON.stringify(prepared.brief)}]}};
}
function assemble(p,response){
 if(customerMode(p.input?.campaign?.config)||p.customer_payload){
  const options={integrationEnabled:p.customer_integration_enabled===true};
  if(!customer.verify(p,p.customer_payload,options).ok)throw Error('CUSTOMER_PLAN_OR_CONTEXT_CHANGED');
  return customer.build(p,options);
 }
 if(c.hash(p.prepared.brief)!==p.prepared.input_hash)throw Error('BRIEF_CHANGED');
 const usage=response?.body?.usage;
 const tokens={prompt:usage?.prompt_tokens??0,completion:usage?.completion_tokens??0,total:usage?.total_tokens??0};
 const known=Object.values(tokens).every(v=>Number.isSafeInteger(v)&&v>=0);
 const metadata={model:p.request.model,attempts:response?.gate?0:1,tokens:known?tokens:{prompt:0,completion:0,total:0},usage_complete:!!usage&&known};
 let output=null,state='ai_failed',reason=response?.gate?.reason||'PROVIDER_ERROR';
 if(p.mode==='template'){output=c.template(p.prepared);state='template_completed';}
 else if(response?.statusCode===429)reason='PROVIDER_RATE_LIMITED';
 else if(response?.statusCode===200){
  const choice=response.body?.choices?.[0];
  if(choice?.finish_reason==='length')reason='TRUNCATED_OUTPUT';
  else if(choice?.finish_reason!=='stop')reason='INCOMPLETE_OUTPUT';
  else{try{
   let candidate=JSON.parse(choice.message.content);
   const smsLayout=arrangeSmsParts(candidate);
   candidate=smsLayout.candidate;
   if(smsLayout.changed)metadata.application_sms_layout={version:1,copy_text_changed:false,duplicate_parts_removed:smsLayout.removed};
   let result=c.validate(candidate,p.prepared);
   // Warnings are computed by the trusted validator, not factual message edits.
   // Only a response whose sole defects are these missing warnings is eligible.
   const allowed=new Set(['weak_offer_fit','fit_not_established','offer_relevance_unproven']);
   if(!result.ok&&result.kind!=='schema'&&result.errors.length&&result.errors.every(e=>e.startsWith('MISSING_QUALITY_FLAG:')&&allowed.has(e.slice('MISSING_QUALITY_FLAG:'.length)))){
    const added=[...new Set(result.errors.map(e=>e.slice('MISSING_QUALITY_FLAG:'.length)))];
    const annotated={...candidate,review_flags:[...new Set([...candidate.review_flags,...added])]};
    const checked=c.validate(annotated,p.prepared);
    if(checked.ok){candidate=annotated;result=checked;metadata.application_review_flags={version:1,source:'deterministic_validator',added};}
   }
   if(result.ok){output=candidate;state='ai_completed';}else reason=result.kind==='schema'?'SCHEMA_REPAIR_NOT_RESERVED':result.errors.join(',');
  }catch{reason='SCHEMA_REPAIR_NOT_RESERVED';}}
 }
 let plan=c.plan(p.prepared,output,state,p.mode==='template'?{}:{...metadata,...(state==='ai_failed'?{failure_reason:reason}:{})});
 const candidate=callHandoff(plan,{integrationEnabled:p.calling_integration_enabled===true,config:p.input.campaign.config});
 if(candidate!==plan){plan=candidate;delete plan.content_hash;plan.content_hash=c.hash(plan);}
 const linked=linkedin.handoff(plan,{integrationEnabled:p.prepared.linkedin_manual_enabled===true,input:p.input});
 if(linked!==plan){plan=linked;delete plan.content_hash;plan.content_hash=c.hash(plan);}
 if(p.prepared.linkedin_manual_enabled===true&&p.input.campaign.config.sequence.some(s=>s.channel==='linkedin')&&plan.state!=='ai_failed'&&!plan.artifacts.linkedin_manual){plan={...plan,blocking_reasons:[...new Set([...plan.blocking_reasons,'linkedin_manual_artifacts_require_review'])]};delete plan.content_hash;plan.content_hash=c.hash(plan);}
 const wa=whatsapp.handoff(plan,{integrationEnabled:p.prepared.whatsapp_integration_enabled===true,input:p.input});
 if(wa!==plan){plan=wa;delete plan.content_hash;plan.content_hash=c.hash(plan);}
 if(p.input.campaign.config.channels.includes('messenger')){const manual=messenger.handoff(plan,{input:p.input});if(manual!==plan){plan=manual;delete plan.content_hash;plan.content_hash=c.hash(plan);}}
 if(p.input.campaign.config.channels.includes('sms')){const draft=sms.handoff(plan,{input:p.input});if(draft!==plan){plan=draft;delete plan.content_hash;plan.content_hash=c.hash(plan);}}
 plan=releaseDraft(plan,p,{enabled:p.draft_review_enabled===true});
 return {id:p.id,org_id:p.org_id,lease:p.lease,plan,ai_status:state,usage:{prompt_tokens:plan.generation.tokens.prompt,completion_tokens:plan.generation.tokens.completion,total_tokens:plan.generation.tokens.total,usage_complete:plan.generation.usage_complete??true}};
}
function preview(input,options={}){
 if(input?.error)return {result:input};
 if(!input?.campaign?.config)return {result:{error:'INVALID_PREVIEW_INPUT',http_status:400}};
 const mode=input.campaign.config.mode;
 if(!['ai','template'].includes(mode))return {result:{error:'V2_REQUIRES_EXPLICIT_AI_OR_TEMPLATE_MODE',http_status:400}};
 try{
  if(customerMode(input.campaign.config)){
   const rendered=render({org_id:input.org_id,lead:input.lead,campaign:{...input.campaign,org_id:input.campaign.org_id??input.org_id}});
   return {result:{...rendered,version:'strategy_v2',validation_profile:'customer_email_v1',requested_mode:mode,
    ai_generated:false,provider_requests:0,approval_required:true,http_status:rendered.state==='requires_review'?200:400}};
  }
  input=legacyEvidence(input,options.now);
  const previewOptions={...options};
  if(options.emailSenderSnapshot){const base=options.readinessSnapshot||legacyRuntime.prepare(input).context.readiness;previewOptions.readinessSnapshot={...base,email:emailReadiness(input,options.emailSenderSnapshot,base.email,options.now)};}
  if(options.linkedinManualEnabled===true&&input.campaign.config.channels.includes('linkedin'))previewOptions.readinessSnapshot={...(previewOptions.readinessSnapshot||legacyRuntime.prepare(input).context.readiness),linkedin:linkedin.readiness(input,options.now)};
  if(input.campaign.config.channels.includes('messenger'))previewOptions.readinessSnapshot={...(previewOptions.readinessSnapshot||legacyRuntime.prepare(input).context.readiness),messenger:messenger.readiness(input,options.now)};
  if(input.campaign.config.channels.includes('sms'))previewOptions.readinessSnapshot={...(previewOptions.readinessSnapshot||legacyRuntime.prepare(input).context.readiness),sms:sms.readiness(input)};
  const prepared=c.build(input,previewOptions),example=c.template(prepared);
  let previewPlan=mode==='template'?c.plan(prepared,example,'template_completed'):null;
  if(previewPlan){const linked=linkedin.handoff(previewPlan,{integrationEnabled:options.linkedinManualEnabled===true,input,now:options.now});if(linked!==previewPlan){previewPlan=linked;delete previewPlan.content_hash;previewPlan.content_hash=c.hash(previewPlan);}}
  return {result:{preview:true,preview_only:true,version:'strategy_v2',requested_mode:mode,ai_generated:false,provider_requests:0,
   brief:prepared.brief,qualification:prepared.qualification,campaign_gaps:prepared.campaign_gaps,token_estimate:prepared.token_estimate,
   plan:previewPlan,
   template_example:mode==='ai'?{label:'Deterministic example only; not an AI result or fallback plan',strategy:example}:null,
   approval_required:true,execution_authorized:false,http_status:200}};
 }catch(e){return {result:{error:e.message,http_status:400}};}
}
module.exports={prepare,assemble,preview};
