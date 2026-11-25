'use strict';
// Provider constraints supplement, never replace, the full semantic validator.
function responseFormat(prepared){
 const schema=JSON.parse(JSON.stringify(prepared.schema)),p=schema.properties;
 p.fit={type:'string',enum:[prepared.brief.qualifier.fit]};
 if(prepared.brief.permitted_channels.length){
  p.step1=p.step1.anyOf.find(s=>s.type==='object');
  p.channel_plan.minItems=1;
 }
 if(prepared.brief.qualifier.fit==='weak'){
  p.followups.maxItems=0;p.personalization_level={type:'string',enum:['category_level']};
  if(p.step1.type==='object')p.step1.properties.parts.items.properties.type={type:'string',enum:['offer','copy']};
 }
 function strict(s){
  if(s.enum&&!s.type)s.type=s.enum.every(v=>typeof v==='string')?'string':'null';
  if(s.type==='object'){
   s.additionalProperties=false;s.required=Object.keys(s.properties);
   for(const child of Object.values(s.properties))strict(child);
  }
  if(s.type==='array'){
   if(!Object.keys(s.items).length)s.items={type:'string'};
   strict(s.items);
  }
  if(s.anyOf)s.anyOf.forEach(strict);
 }
 strict(schema);
 return {type:'json_schema',json_schema:{name:'lead_strategy_v2',strict:true,schema}};
}
module.exports={responseFormat};
