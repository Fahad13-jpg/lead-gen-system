'use strict';
const str={type:'string',maxLength:500};
const nullable=s=>({anyOf:[s,{type:'null'}]});
const obj=properties=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
const array=(items,maxItems)=>({type:'array',items,maxItems});
const channel={enum:['email','sms','whatsapp','linkedin','call','messenger']};
const part=obj({type:{enum:['observed','offer','copy']},ref:{type:'string',maxLength:80},text:{type:'string',maxLength:1000}});
const followup=obj({channel,intent:{type:'string',maxLength:160},parts:array(part,10)});
// Older saved/mock responses containing intents only remain readable. Missing
// parts do not become a generated message or a silent template fallback.
followup.required=['channel','intent'];
module.exports=obj({
 fit:{enum:['strong','moderate','weak','unclear','not_assessed']},fit_notes:array(str,4),angle_id:nullable({type:'string',maxLength:80}),
 channel_plan:array(obj({channel,reason:str}),5),
 step1:nullable(obj({channel,parts:array(part,10)})),
 followups:array(followup,4),
 call_guidance:nullable(obj({opening:part,permission_question:part,objections:array(obj({kind:{enum:['busy','not_interested','unknown','opt_out']},response:part}),4)})),
 review_flags:array({type:'string',maxLength:80},12),personalization_level:{enum:['lead_specific','category_level']}
});
