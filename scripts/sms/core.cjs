'use strict';
// Shared by the strategy, release and execution paths. No provider access.
const phone=v=>typeof v==='string'&&/^\+[1-9][0-9]{7,14}$/.test(v);
const gsm=new Set(Array.from('@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'));
const extended=new Set(Array.from('^{}\\[~]|€\f'));
function segments(text){
 if(typeof text!=='string'||!text.length)return{encoding:'unknown',units:0,segments:0};
 let units=0;for(const ch of text){if(gsm.has(ch))units++;else if(extended.has(ch))units+=2;else return{encoding:'UCS-2',units:text.length,segments:text.length<=70?1:Math.ceil(text.length/67)};}
 return{encoding:'GSM-7',units,segments:units<=160?1:Math.ceil(units/153)};
}
function readiness(input){
 const c=input?.campaign?.config,reasons=[];
 if(c?.mode!=='ai'||c.language!=='en'||c.channels?.length!==1||c.channels[0]!=='sms'||c.sequence?.length!==1||c.sequence[0].channel!=='sms')reasons.push('sms_requires_single_step_ai_campaign');
 if(!/^\+923[0-9]{9}$/.test(input?.lead?.phone||''))reasons.push('pakistan_mobile_number_required');
 if(input?.suppressed!==false||input?.replied!==false)reasons.push('suppressed_or_replied');
 return{status:reasons.length?'blocked':'ready',reasons,execution_mode:'approved_device_sms'};
}
function handoff(plan,{input}={}){
 if(readiness(input).status!=='ready'||plan?.state!=='ai_completed'||plan.version!=='strategy_v2'||plan.execution_authorized!==false||plan.approval_required!==true||plan.validation_errors?.length!==0||!Array.isArray(plan.blocking_reasons)||plan.strategy?.step1?.channel!=='sms'||plan.strategy.followups?.length)return plan;
 const parts=plan.strategy.step1.parts;if(!Array.isArray(parts)||!parts.length)return plan;
 const message=parts.map(p=>p.text).join(' '),count=segments(message);
 if(!message.trim()||message.length>306||count.segments>2||/[\r\n]/.test(message))return plan;
 const out=JSON.parse(JSON.stringify(plan));out.artifacts.sms_draft={version:'sms_draft_v1',recipient:input.lead.phone,message,...count,approval_required:true};
 if(out.blocking_reasons.length&&out.blocking_reasons.every(r=>r==='v2_offline_only'))out.blocking_reasons=[];return out;
}
function slot(settings,now=Date.now()){
 const s=settings;if(!s||typeof s.timezone!=='string'||!s.timezone.trim()||s.timezone.length>80||!Number.isInteger(s.start_hour)||!Number.isInteger(s.end_hour)||s.start_hour<0||s.end_hour>24||s.end_hour<=s.start_hour||!Array.isArray(s.weekdays)||!s.weekdays.length||s.weekdays.length>7||new Set(s.weekdays).size!==s.weekdays.length||s.weekdays.some(d=>!Number.isInteger(d)||d<1||d>7))throw Error('INVALID_SMS_SLOT');
 let values;try{values=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:s.timezone,weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now)).map(p=>[p.type,p.value]));}catch{throw Error('INVALID_SMS_SLOT');}
 const weekday=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(values.weekday)+1,hour=Number(values.hour);
 const active=s.weekdays.includes(weekday)&&hour>=s.start_hour&&hour<s.end_hour;
 // Bound provider queue validity to the current local-hour boundary, and at
 // most 60 seconds. Re-evaluate on every worker tick (including DST changes).
 const until=now+Math.min(60000,(60-Number(values.minute))*60000-Number(values.second)*1000);
 return{active,day:`${values.year}-${values.month}-${values.day}`,valid_until:new Date(until).toISOString()};
}
module.exports={phone,segments,readiness,handoff,slot};
