'use strict';
const {hash}=require('./core.cjs');
// Converts a documented Meta message_templates result into the existing approved
// artifact shape. No inference of variable meaning or template category.
function select(response,selection,now=new Date().toISOString()){
 const fail=reason=>({allowed:false,reason,execution_authorized:false});
 if(!Number.isFinite(Date.parse(now))||!Array.isArray(response?.data)||response.data.length>100||!selection||!Array.isArray(selection.variable_refs))return fail('template_response_invalid');
 const matches=response.data.filter(t=>t?.id===selection.id&&t?.name===selection.name&&t?.language===selection.language);
 if(matches.length!==1)return fail(response?.paging?.next?'template_not_found_in_checked_page':'template_not_found_or_ambiguous');
 const t=matches[0];
 if(t.status!=='APPROVED'||t.category!=='MARKETING')return fail('approved_marketing_template_required');
 if(!Array.isArray(t.components)||t.components.length!==1||t.components[0]?.type!=='BODY'||typeof t.components[0]?.text!=='string')return fail('unsupported_template_components');
 if(t.parameter_format!==undefined&&t.parameter_format!=='POSITIONAL')return fail('unsupported_parameter_format');
 const body=t.components[0].text,refs=selection.variable_refs;
 if(!/^\d{5,30}$/.test(t.id)||!/^\w{1,100}$/.test(t.name)||!/^\w{2,15}$/.test(t.language)||body.length>1500||refs.length>8||refs.some(r=>!['company_name','city','offer_name','offer_description','cta','sender_name','sender_company','benefit_1'].includes(r)))return fail('template_mapping_invalid');
 const seen=new Set([...body.matchAll(/\{\{([1-9][0-9]*)\}\}/g)].map(m=>Number(m[1])));
 if(seen.size!==refs.length||refs.some((_,i)=>!seen.has(i+1))||/\{\{|\}\}/.test(body.replace(/\{\{([1-9][0-9]*)\}\}/g,'')))return fail('template_mapping_invalid');
 // Revision excludes checked_at so unchanged provider content has stable identity.
 const content={id:t.id,name:t.name,language:t.language,status:t.status,category:t.category,body,variable_refs:[...refs]};
 return {allowed:true,template:{...content,revision:hash(content),checked_at:now},execution_authorized:false};
}
module.exports={select};
