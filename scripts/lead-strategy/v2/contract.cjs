'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const legacy=require('../runtime.cjs');
const schema=require('./schema.cjs');
const quality=require('./quality.cjs');
const sms=require('./sms.cjs');
const prompt=fs.readFileSync(path.join(__dirname,'prompt.txt'),'utf8').trim();
const limits={email:1200,sms:306,whatsapp:1500,linkedin:500,call:1500,messenger:1500};
const clean=(v,n=500)=>Array.from(String(v??'').normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu,' ').replace(/\s+/g,' ').trim()).slice(0,n).join('');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const bytes=v=>Buffer.byteLength(typeof v==='string'?v:JSON.stringify(v));
const urls=s=>String(s).match(/https?:\/\/[^\s<>"“”]+/g)||[];
function schemaForChannels(permitted){
 // Clone: a lead must never change another lead's schema or the v1 contract.
 const scoped=JSON.parse(JSON.stringify(schema)),p=scoped.properties;
 const allowed=[...new Set(permitted.map(x=>x.channel))].filter(ch=>Object.hasOwn(limits,ch));
 if(!allowed.length){
  for(const key of ['channel_plan','followups'])p[key]={type:'array',items:{},maxItems:0};
  p.step1={type:'null'};p.call_guidance={type:'null'};
 }else{
  p.channel_plan.items.properties.channel={enum:allowed};
  p.followups.items.properties.channel={enum:allowed.slice()};
  p.step1.anyOf[0].properties.channel={enum:[allowed[0]]};
  if(!allowed.includes('call'))p.call_guidance={type:'null'};
 }
 return scoped;
}
function build(input,{now=new Date().toISOString(),readinessSnapshot,tokenCounter,hardCap=2500}={}){
 const x=legacy.prepare(input).context,c=x.c;
 // Only a trusted adapter may supply a readiness snapshot. Tests use explicit synthetic snapshots.
 const readiness=readinessSnapshot||x.readiness;
 const permitted=Object.entries(readiness).filter(([ch,r])=>c.channels.includes(ch)&&r.status==='ready'&&Array.isArray(r.reasons)&&r.reasons.length===0&&!input.suppressed&&!input.replied&&!x.reasons.length).map(([channel])=>({channel,reason_codes:['existing_readiness_ready']}));
 const benefits=c.offer.approved_points.map((text,i)=>({id:'b'+(i+1),text:clean(text,500)}));
 const q=x.qualification;
 const candidate_angles=q.candidate_angles.map((a,i)=>({id:'a'+(i+1),benefit_id:'b'+(a.approved_benefit_index+1),text:clean(a.text,500)}));
 const copy={greeting:'Hello '+clean(x.l.company_name,100)+',',cta:clean(c.cta.text,250)+(c.cta.url?' '+c.cta.url:''),sender:clean(c.sender.name,100)+' — '+clean(c.sender.company,100),opt_out:'Reply STOP to opt out.',opening:'Hello, this is '+clean(c.sender.name,100)+' from '+clean(c.sender.company,100)+'.',permission:'Is now a suitable time for a brief explanation?',busy:'Would you prefer that I leave it here?',not_interested:'Thank you for your time. I will leave it here.',unknown:'A team member can answer that; I do not want to guess.',stop:'I will stop and record your opt-out request.'};
 if(c.channels[0]==='sms'){copy.greeting='Hi,';copy.sender=clean(c.sender.name,100)+' at '+clean(c.sender.company,100)+'.';copy.opt_out='Reply STOP to opt out.';}
 if(q.absence_wording)copy.scoped_absence=q.absence_wording;
 const trust=input.report?.trust||{};
 if(c.channels[0]!=='sms'&&q.fit==='weak'&&c.offer_profile?.key==='website_presence'&&trust.website_presence==='present')copy.greeting+=' I’m '+clean(c.sender.name,100)+' from '+clean(c.sender.company,100)+'. If you are considering updating your existing website, here is what we can offer:';
 const facts=[];
 if(trust.freshness?.website_current&&trust.website_presence==='present'&&!(trust.conflicts||[]).length){
  for(const e of (input.report?.basic?.services||[]).slice(0,8)){
   if(!e.source_url||!e.text)continue;
   const text=clean(e.text,200),observed_at=e.observed_at||input.report.basic.observed_at;
   if(!Number.isFinite(Date.parse(observed_at))||Date.parse(observed_at)>Date.parse(now))continue;
   facts.push({id:'f'+(facts.length+1),source:clean(e.source_url,250),age_days:Math.floor((Date.parse(now)-Date.parse(observed_at))/86400000),polarity:'present',data:{label:'UNTRUSTED_WEBSITE_DATA',text},outgoing_text:'Your website lists: “'+text+'”.'});
  }
 }
 if(trust.freshness?.research_current&&!(trust.conflicts||[]).length){
  for(const e of (input.report?.outreach_context||[]).slice(0,3)){
   const observed_at=e.observed_at||e.published_at;
   if(!e.source_url||!e.excerpt||!Number.isFinite(Date.parse(observed_at))||Date.parse(observed_at)>Date.parse(now))continue;
   const text=clean(e.excerpt,200);
   facts.unshift({id:'r'+(facts.filter(f=>f.id.startsWith('r')).length+1),source:clean(e.source_url,250),age_days:Math.floor((Date.parse(now)-Date.parse(observed_at))/86400000),polarity:'present',data:{label:'UNTRUSTED_MATCHED_PROFILE_DATA',text},outgoing_text:'A matched profile posted: “'+text+'”.'});
  }
 }
 for(const [kind,p] of Object.entries(input.report?.basic?.signals?.inquiry_paths||{}))if(p?.state?.startsWith('not_observed')&&facts.length<10)facts.push({id:'f'+(facts.length+1),source:clean((p.pages||[]).join(', '),250),age_days:Number.isFinite(Date.parse(input.report.basic.observed_at))?Math.max(0,Math.floor((Date.parse(now)-Date.parse(input.report.basic.observed_at))/86400000)):null,polarity:'absent_on_checked_pages',data:{label:'UNTRUSTED_WEBSITE_DATA',text:clean(kind+' not observed on '+(p.pages||[]).length+' checked pages',180)},outgoing_text:null});
 const brief={contract:'strategy_v2',org_id:x.l.org_id,lead_id:x.l.id,qualifier:{fit:q.fit,reason_codes:q.reason_codes,candidate_angles},permitted_channels:permitted,blocked_channels:Object.entries(readiness).filter(([ch])=>!permitted.some(v=>v.channel===ch)).map(([channel,r])=>({channel,reason_codes:r.reasons})),campaign:{offer:clean(c.offer.name,150),description:clean(c.offer.description,400),approved_benefits:benefits,prohibited_claims:c.offer.prohibited_claims,cta:c.cta,tone:c.tone,language:c.language,sender:c.sender},facts,copy,url_allowlist:c.cta.url?[c.cta.url]:[],limits,limitations:['Source observations are not independently verified ownership or need.','Internal notes and follow-up intents are not outgoing text.'],conflicts:trust.conflicts||[]};
 brief.campaign.followup_steps=c.sequence.slice(1,5).map(s=>({step:s.step,channel:s.channel,delay_days:s.delay_days}));
 if(Array.isArray(input.report?.compatibility?.limitations))brief.limitations.push(...input.report.compatibility.limitations.slice(0,2).map(s=>clean(s,180)));
 brief.relevance={matches:quality.matches(facts,c.offer_fit_rules,benefits)};
 if(c.target_terms.length)brief.campaign.target_businesses=c.target_terms;
 // Existing configuration only; absent details are not invented or promoted to claims.
 const campaign_gaps=[];
 if(!c.target_terms.length)campaign_gaps.push('target_terms');
 if(benefits.length<2)campaign_gaps.push('additional_approved_benefits');
 if(!c.cta.url)campaign_gaps.push('optional_demo_url');
 if(!c.offer_fit_rules?.length)campaign_gaps.push('evidence_to_benefit_rules');
 const relevant=new Set(brief.relevance.matches.map(m=>m.fact_id));
 facts.sort((a,b)=>Number(relevant.has(b.id))-Number(relevant.has(a.id)));
 // Do not silently truncate prohibitions, approved claims, CTA or sender into different assertions.
 if(benefits.some((b,i)=>b.text!==clean(c.offer.approved_points[i],100000))||brief.campaign.description!==clean(c.offer.description,100000))throw Error('CAMPAIGN_TEXT_TOO_LONG');
 // A byte count is a conservative upper bound for byte-fallback tokenizers, not an exact model tokenizer.
 const count=tokenCounter||((s)=>bytes(s));
 while(count(JSON.stringify(brief))>hardCap&&brief.facts.length){brief.facts.pop();brief.relevance.matches=quality.matches(brief.facts,c.offer_fit_rules,benefits);}
 if(count(JSON.stringify(brief))>hardCap)throw Error('BRIEF_CAP_EXCEEDED: required campaign/gate data cannot be dropped');
 const serialized=JSON.stringify(brief);
 const scopedSchema=schemaForChannels(permitted);
 // Repeat deterministic requirements beside the schema. They are constraints,
 // never a model-generated fit verdict or a substitute for semantic validation.
 const angles=brief.qualifier.candidate_angles.map(a=>a.id);
 scopedSchema.properties.angle_id=angles.length?{enum:angles}:{type:'null'};
 const requiredFlags=[...(!permitted.length?['no_permitted_channel']:[]),
  ...(!brief.facts.some(f=>f.polarity==='present')?['thin_evidence']:[]),
  ...(brief.conflicts.length?['conflicting_evidence']:[]),
  ...(!/^en(?:glish)?$/i.test(brief.campaign.language)?['language_review_required']:[]),
  ...(q.fit==='weak'?['weak_offer_fit']:['unclear','not_assessed'].includes(q.fit)?['fit_not_established']:[])];
 const requestPrompt=prompt+'\nMANDATORY RESPONSE CHECKLIST (trusted application constraints):\n'+JSON.stringify({
  fit:q.fit,angle_id:angles.length?{choose_exactly_one_id:angles,null_allowed:false,required_even_without_permitted_channels:true}:null,
  review_flags_must_include:requiredFlags,
  ...(!permitted.length?{channel_plan:[],step1:null,followups:[],call_guidance:null,personalization_level:'category_level'}:{})
 });
 const scheduling={timezone:c.timezone,sending_window:c.sending_window,sequence:c.sequence};
 return {brief,scheduling,qualification:q,prompt:requestPrompt,schema:scopedSchema,campaign_gaps,prompt_version:'strategy_v2.9',input_hash:hash(brief),token_estimate:{brief:Math.ceil(bytes(serialized)/3),brief_upper_bound:count(serialized),hard_cap:hardCap,method:tokenCounter?'injected_tokenizer':'UTF-8 byte upper bound; /3 estimate UNVERIFIED',full_request_estimate:Math.ceil((bytes(serialized)+bytes(requestPrompt)+bytes(scopedSchema))/3)}};
}
function schemaErrors(v,s,p='$'){
 if(s.anyOf)return s.anyOf.some(a=>!schemaErrors(v,a,p).length)?[]:[p+':type'];
 if(s.enum&&!s.enum.includes(v))return[p+':enum'];
 if(!s.type)return[];
 if(s.type==='null')return v===null?[]:[p+':null'];
 if(s.type==='string')return typeof v==='string'&&v.length<=s.maxLength?[]:[p+':string'];
 if(s.type==='array')return Array.isArray(v)&&v.length<=s.maxItems?v.flatMap((x,i)=>schemaErrors(x,s.items,p+'['+i+']')):[p+':array'];
 if(s.type==='object'){
  if(!v||typeof v!=='object'||Array.isArray(v))return[p+':object'];
  return [...s.required.filter(k=>!(k in v)).map(k=>p+':missing:'+k),...Object.keys(v).filter(k=>!s.properties[k]).map(k=>p+':extra:'+k),...Object.entries(s.properties).filter(([k])=>k in v).flatMap(([k,t])=>schemaErrors(v[k],t,p+'.'+k))];
 }
 return[p+':unsupported_schema'];
}
function validate(output,prepared){
 const structural=schemaErrors(output,schema);if(structural.length)return{ok:false,kind:'schema',errors:structural};
 const b=prepared.brief,errors=[],allowed=b.permitted_channels.map(x=>x.channel);
 if(output.fit!==b.qualifier.fit)errors.push('FIT_OVERRIDE');
 if(b.qualifier.candidate_angles.length?!b.qualifier.candidate_angles.some(a=>a.id===output.angle_id):output.angle_id!==null)errors.push('UNKNOWN_ANGLE');
 const channels=output.channel_plan.map(v=>v.channel);
 if(new Set(channels).size!==channels.length||channels.some(c=>!allowed.includes(c))||allowed.length&&!channels.includes(allowed[0]))errors.push('CHANNEL_NOT_PERMITTED');
 if(allowed.length?output.step1?.channel!==allowed[0]:output.step1!==null||channels.length||output.followups.length||output.call_guidance!==null)errors.push('INVALID_STEP1');
 if(!allowed.length&&!output.review_flags.includes('no_permitted_channel'))errors.push('MISSING_REVIEW_FLAG');
 if(!b.facts.some(f=>f.polarity==='present')&&!output.review_flags.includes('thin_evidence'))errors.push('MISSING_THIN_EVIDENCE_FLAG');
 if(b.conflicts.length&&!output.review_flags.includes('conflicting_evidence'))errors.push('MISSING_CONFLICT_FLAG');
 if(!/^en(?:glish)?$/i.test(b.campaign.language)&&!output.review_flags.includes('language_review_required'))errors.push('MISSING_LANGUAGE_REVIEW_FLAG');
 if(output.followups.some(f=>!channels.includes(f.channel)||/[\r\n]/.test(f.intent)))errors.push('INVALID_FOLLOWUP');
 if(b.qualifier.fit==='weak'&&output.followups.length)errors.push('WEAK_FIT_FOLLOWUP_REQUIRES_REVIEW');
 errors.push(...quality.followupReview(b,output).errors);
 let observed=0;
 function checkPart(p){
  let expected;
  if(p.type==='observed'){const f=b.facts.find(f=>f.id===p.ref);if(!f||f.polarity!=='present')errors.push('INVALID_FACT_REF');else{expected=f.outgoing_text;observed++;}}
  else if(p.type==='offer')expected=b.campaign.approved_benefits.find(x=>x.id===p.ref)?.text;
  else expected=b.copy[p.ref];
  if(expected===undefined||expected!==p.text)errors.push('UNSUPPORTED_CLAIM_OR_COPY');
  if(!legacy.validateAbsence(p.text,prepared.qualification))errors.push('UNSCOPED_ABSENCE');
  if(urls(p.text).some(u=>!b.url_allowlist.includes(u)))errors.push('URL_NOT_ALLOWED');
  if(b.campaign.prohibited_claims.some(t=>p.text.toLowerCase().includes(t.toLowerCase())))errors.push('PROHIBITED_CLAIM');
 }
 if(output.step1){
  output.step1.parts.forEach(checkPart);
  for(const ref of ['greeting','cta','sender','opt_out'])if(!output.step1.parts.some(p=>p.type==='copy'&&p.ref===ref))errors.push('MISSING_'+ref.toUpperCase());
  if(output.step1.parts.filter(p=>p.type==='observed').length>1||output.step1.parts.filter(p=>p.type==='offer').length>2)errors.push('TOO_MANY_CLAIMS');
  if(output.step1.parts.map(p=>p.text).join(' ').length>limits[output.step1.channel])errors.push('CHANNEL_LENGTH');
  if(output.step1.channel==='sms'){const rendered=output.step1.parts.map(p=>p.text).join(' ');if(output.step1.parts.some(p=>p.type==='observed')||output.step1.parts.filter(p=>p.type==='offer').length!==1||output.step1.parts.findIndex(p=>p.ref==='sender')>1||(rendered.match(/\?/g)||[]).length>1||sms.segments(rendered).segments>2)errors.push('SMS_COPY_REQUIRES_REVIEW');}
  const angle=b.qualifier.candidate_angles.find(a=>a.id===output.angle_id);
  if(angle&&!output.step1.parts.some(p=>p.type==='offer'&&p.ref===angle.benefit_id))errors.push('ANGLE_BENEFIT_MISSING');
 }
 if(output.call_guidance){
  if(!allowed.includes('call'))errors.push('CALL_NOT_PERMITTED');
  const g=output.call_guidance;
  if(g.opening.type!=='copy'||g.opening.ref!=='opening'||g.permission_question.type!=='copy'||g.permission_question.ref!=='permission')errors.push('INVALID_CALL_COPY');
  [g.opening,g.permission_question,...g.objections.map(x=>x.response)].forEach(checkPart);
  for(const o of g.objections)if(o.response.type!=='copy'||o.response.ref!==({opt_out:'stop'}[o.kind]||o.kind))errors.push('INVALID_OBJECTION');
 }
 const initialObserved=observed;
 for(const f of output.followups){
  if(!f.parts)continue;
  f.parts.forEach(checkPart);
  for(const ref of ['greeting','cta','sender','opt_out'])if(!f.parts.some(p=>p.type==='copy'&&p.ref===ref))errors.push('FOLLOWUP_MISSING_'+ref.toUpperCase());
  if(!f.parts.some(p=>p.type==='offer'))errors.push('FOLLOWUP_BENEFIT_REQUIRED');
  if(f.parts.filter(p=>p.type==='observed').length>1||f.parts.filter(p=>p.type==='offer').length>2)errors.push('FOLLOWUP_TOO_MANY_CLAIMS');
  if(f.parts.map(p=>p.text).join('\n\n').length>limits[f.channel])errors.push('FOLLOWUP_CHANNEL_LENGTH');
 }
 observed=initialObserved;
 if(allowed.includes('call')&&!output.call_guidance)errors.push('MISSING_CALL_GUIDANCE');
 if(output.personalization_level!==(observed?'lead_specific':'category_level'))errors.push('PERSONALIZATION_MISMATCH');
 if(b.qualifier.fit==='weak'&&observed)errors.push('WEAK_FIT_PERSONALIZATION_REQUIRES_REVIEW');
 for(const flag of quality.review(b,output).flags)if(!output.review_flags.includes(flag))errors.push('MISSING_QUALITY_FLAG:'+flag);
 return {ok:!errors.length,kind:errors.length?'semantic':null,errors:[...new Set(errors)]};
}
const part=(type,ref,text)=>({type,ref,text});
function template(p){
 const b=p.brief,channel=b.permitted_channels[0]?.channel;
 const matchedAngle=b.qualifier.fit!=='weak'&&b.qualifier.candidate_angles.find(a=>b.relevance?.matches?.some(m=>m.benefit_id===a.benefit_id));
 const selectedAngle=matchedAngle||b.qualifier.candidate_angles[0];
 const selectedBenefit=b.campaign.approved_benefits.find(v=>v.id===selectedAngle?.benefit_id)||b.campaign.approved_benefits[0];
 const parts=['greeting',...(channel==='sms'?['sender']:b.copy.scoped_absence?['scoped_absence']:[])].map(k=>part('copy',k,b.copy[k]));
 if(selectedBenefit)parts.push(part('offer',selectedBenefit.id,selectedBenefit.text));
 parts.push(...(channel==='sms'?['cta','opt_out']:['cta','sender','opt_out']).map(k=>part('copy',k,b.copy[k])));
 const output={fit:b.qualifier.fit,fit_notes:['Need and buying intent remain unconfirmed.'],angle_id:b.qualifier.candidate_angles[0]?.id||null,channel_plan:channel?[{channel,reason:'First permitted channel.'}]:[],step1:channel?{channel,parts}:null,followups:channel?[{channel,intent:'Ask whether the approved offer is relevant; stop on reply or opt-out.'}]:[],call_guidance:b.permitted_channels.some(x=>x.channel==='call')?{opening:part('copy','opening',b.copy.opening),permission_question:part('copy','permission',b.copy.permission),objections:['busy','not_interested','unknown','opt_out'].map(kind=>({kind,response:part('copy',kind==='opt_out'?'stop':kind,b.copy[kind==='opt_out'?'stop':kind])}))}:null,review_flags:[...(!channel?['no_permitted_channel']:[]),...(!b.facts.some(f=>f.polarity==='present')?['thin_evidence']:[]),...(b.conflicts.length?['conflicting_evidence']:[]),...(!/^en(?:glish)?$/i.test(b.campaign.language)?['language_review_required']:[])],personalization_level:'category_level'};
 output.angle_id=selectedAngle?.id||null;
 const match=b.relevance?.matches?.find(m=>m.benefit_id===selectedBenefit?.id);
 if(channel&&channel!=='sms'&&match&&b.qualifier.fit!=='weak'){
  const f=b.facts.find(f=>f.id===match.fact_id);
  output.step1.parts.splice(1,0,part('observed',f.id,f.outgoing_text));output.personalization_level='lead_specific';
 }
 if(b.qualifier.fit==='weak'){output.fit_notes=['Current evidence indicates weak fit. Review whether this offer is relevant before pursuing it.'];output.followups=[];}
 else if(['unclear','not_assessed'].includes(b.qualifier.fit))output.fit_notes=['Offer relevance is unconfirmed. Do not infer a missing website or a business need.'];
 else output.fit_notes=['The qualifier suggests potential fit; the business has not confirmed a need or buying intent.'];
 // Template mode stays explicitly labelled. AI replies are never filled from here.
 const permitted=new Set(b.permitted_channels.map(x=>x.channel));
 if(p.calling_sequence_enabled&&channel)for(const s of (p.scheduling?.sequence||[]).slice(1,5)){
  if(permitted.has(s.channel)&&!output.channel_plan.some(x=>x.channel===s.channel))output.channel_plan.push({channel:s.channel,reason:'Permitted channel in the customer-approved sequence.'});
 }
 if(channel&&b.qualifier.fit!=='weak')output.followups=(p.scheduling?.sequence||[]).slice(1,5).filter(s=>p.calling_sequence_enabled?permitted.has(s.channel):s.channel===channel).map((s,i)=>{
  const benefit=b.campaign.approved_benefits[i%b.campaign.approved_benefits.length];
  return {channel:s.channel,intent:'Ask whether the approved offer is relevant; stop on reply or opt-out.',parts:[part('copy','greeting',b.copy.greeting),...(benefit?[part('offer',benefit.id,benefit.text)]:[]),...['cta','sender','opt_out'].map(k=>part('copy',k,b.copy[k]))]};
 });
 output.review_flags=[...new Set([...output.review_flags,...quality.review(b,output).flags])];
 return output;
}
function plan(p,output,state,metadata={}){
 if(!['ai_completed','ai_failed','template_completed','template_fallback'].includes(state)||(state==='ai_failed'?output!==null:!output))throw Error('INVALID_PLAN_STATE');
 const validation=output?validate(output,p):{ok:false,errors:['AI_FAILED']};
 if(output&&!validation.ok)throw Error('INVALID_PLAN:'+validation.errors.join(','));
 const body={version:'strategy_v2',state,qualification:p.qualification,generation:{method:state.startsWith('ai_')?'ai':'template',model:null,prompt_version:p.prompt_version,attempts:0,tokens:{prompt:0,completion:0,total:0},...metadata},strategy:output,input_hash:p.input_hash,approval_required:true,execution_authorized:false,fallback_acknowledgement_required:state==='template_fallback',validation_errors:validation.errors,blocking_reasons:['v2_offline_only'],artifacts:{call_brief:output?.call_guidance||null,whatsapp_draft:output?.step1?.channel==='whatsapp'?output.step1.parts.map(p=>p.text).join(' '):null}};
 if(body.artifacts.call_brief)body.artifacts.call_brief={...body.artifacts.call_brief,approved_benefits:p.brief.campaign.approved_benefits,objective:p.brief.campaign.cta,stop_on:['opt_out','wrong_person','human_requested'],integration:'draft_only'};
 // Store the exact rendered email inside the hash-bound plan. Never assemble a
 // different signature or subject after approval. Old plans stay readable.
 body.artifacts.email_draft=output?.step1?.channel==='email'?{
  subject:'About '+clean(p.brief.campaign.offer,150),
  body:output.step1.parts.map(part=>part.text).join('\n\n'),
  integration:'draft_only'
 }:null;
 body.artifacts.schedule=p.scheduling?{
  ...JSON.parse(JSON.stringify(p.scheduling)),delay_basis:'previous_confirmed_send',
  timing_enforced:false,execution_authorized:false,
  followup_intents:(output?.followups||[]).map((f,i)=>{
   const step=p.scheduling.sequence[i+1];const matches=step?.channel===f.channel;
   return {intent_index:i,channel:f.channel,campaign_step:matches?step.step:null,
    delay_days:matches?step.delay_days:null,status:matches?'awaiting_approved_message_and_execution_checks':'campaign_sequence_review_required'};
  })
 }:null;
 body.artifacts.followup_drafts=(output?.followups||[]).map((f,i)=>{
  const timing=body.artifacts.schedule?.followup_intents[i];
  return {intent_index:i,step:timing?.campaign_step??null,channel:f.channel,delay_days:timing?.delay_days??null,
   subject:f.channel==='email'?'About '+clean(p.brief.campaign.offer,150):null,
   body:f.parts?.map(part=>part.text).join('\n\n')||null,
   status:!f.parts?'message_missing':timing?.campaign_step?'requires_plan_approval_and_execution_checks':'campaign_sequence_review_required',
   method:body.generation.method,execution_authorized:false};
 });
 body.quality_review=quality.review(p.brief,output);
 body.quality_review.campaign_gaps=p.campaign_gaps||[];
 body.content_hash=hash(body);return body;
}
function approvalPreflight(p,{acknowledge_fallback_hash}={}){
 const {content_hash,...body}=p;
 if(content_hash!==hash(body))return{ok:false,reason:'CONTENT_CHANGED'};
 if(p.fallback_acknowledgement_required&&acknowledge_fallback_hash!==content_hash)return{ok:false,reason:'FALLBACK_ACK_REQUIRED'};
 return {ok:false,reason:'EXISTING_APPROVAL_GATES_REQUIRED_OFFLINE_ONLY'};
}
function readPlan(p){if(!['strategy_v1','strategy_v2'].includes(p?.version))throw Error('UNKNOWN_PLAN_VERSION');return p;}
module.exports={build,validate,template,plan,approvalPreflight,readPlan,schema,prompt,clean,hash};
