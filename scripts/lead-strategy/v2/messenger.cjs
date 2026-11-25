'use strict';
const page=v=>typeof v==='string'&&v.length<=1000&&/^https:\/\/www\.facebook\.com\/(?!search\/|groups\/|posts\/|reels?\/|watch\/|login\/|messages\/|photo\/|events\/|marketplace\/|settings\/)[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+){0,2}\/$/i.test(v)?v:null;
function target(input,now=new Date().toISOString()){
 const rows=Array.isArray(input?.facebook_pages)?input.facebook_pages:[],time=Date.parse(now);
 const candidates=rows.filter(r=>page(r.page_url)&&Number.isFinite(Date.parse(r.observed_at))&&Date.parse(r.observed_at)<=time&&time-Date.parse(r.observed_at)<30*86400000);
 const unique=[...new Map(candidates.map(r=>[r.page_url,r])).values()];
 return unique.length===1?{page_url:unique[0].page_url,observed_at:unique[0].observed_at,identity_status:'source_observation_requires_human_review'}:null;
}
function readiness(input,now){
 const c=input?.campaign?.config,reasons=[];
 if(c?.mode!=='ai'||c?.language!=='en'||c.channels?.length!==1||c.channels[0]!=='messenger'||c.sequence?.length!==1||c.sequence[0].channel!=='messenger')reasons.push('messenger_requires_single_step_ai_campaign');
 if(input?.suppressed!==false||input?.replied!==false)reasons.push('suppressed_or_replied');
 if(!target(input,now))reasons.push('unique_current_facebook_page_required');
 return {status:reasons.length?'blocked':'ready',reasons,execution_mode:'manual_only'};
}
function handoff(plan,{input,now}={}){
 if(readiness(input,now).status!=='ready'||plan?.state!=='ai_completed'||plan.version!=='strategy_v2'||plan.execution_authorized!==false||plan.approval_required!==true||plan.validation_errors?.length!==0||!Array.isArray(plan.blocking_reasons)||plan.strategy?.step1?.channel!=='messenger')return plan;
 const parts=plan.strategy.step1.parts;
 if(!Array.isArray(parts)||!parts.length||parts.some(p=>typeof p.text!=='string')||plan.strategy.followups?.length)return plan;
 const message=parts.map(p=>p.text).join('\n\n');if(!message.trim()||message.length>1500)return plan;
 const out=JSON.parse(JSON.stringify(plan));out.artifacts.messenger_manual={version:'messenger_manual_v1',target:target(input,now),message,execution_mode:'manual_only',approval_required:true};
 if(out.blocking_reasons.length&&out.blocking_reasons.every(r=>r==='v2_offline_only'))out.blocking_reasons=[];
 return out;
}
module.exports={target,readiness,handoff};
