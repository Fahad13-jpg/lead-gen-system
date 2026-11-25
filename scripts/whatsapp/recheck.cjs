'use strict';
const {select}=require('./templates.cjs'),{hash}=require('./core.cjs');
const content=t=>Object.fromEntries(['id','name','language','status','category','body','variable_refs','revision'].map(k=>[k,t?.[k]]));
// Trusted connector port only. No default credentials, HTTP client or SQL connection.
// Recheck output belongs in mutable dispatch metadata, never an approved plan.
async function recheck(task,ports){
 const a=task?.artifact,t=a?.template_snapshot,now=(ports?.now||(()=>new Date().toISOString()))();
 if(!Number.isSafeInteger(task?.org_id)||task.org_id<1||!/^\d{1,18}$/.test(String(task.plan_id||''))||typeof task.content_hash!=='string'||!task.content_hash||!Number.isInteger(task.step)||task.step<2||task.step>10||!Number.isSafeInteger(task.previous_activity_id)||task.previous_activity_id<1||a?.org_id!==task.org_id||!/^v\d{1,3}\.\d$/.test(a.api_version||'')||!/^\d{5,30}$/.test(a.waba_id||'')||!/^\d{5,30}$/.test(a.phone_number_id||'')||!t||!Number.isFinite(Date.parse(now)))throw Error('INVALID_RECHECK_BINDING');
 if(typeof ports?.authorizeBinding!=='function'||typeof ports?.authenticatedGet!=='function')throw Error('TRUSTED_RECHECK_PORT_REQUIRED');
 const base={version:'whatsapp_recheck_v1',org_id:task.org_id,plan_id:String(task.plan_id),content_hash:task.content_hash,step:task.step,previous_activity_id:task.previous_activity_id,connection_id:a.connection_id,credential_ref:a.credential_ref,phone_number_id:a.phone_number_id,waba_id:a.waba_id,api_version:a.api_version,checked_at:now,execution_authorized:false};
 const fail=reason=>({...base,state:'failed',reason});
 if(await ports.authorizeBinding(base)!==true)return fail('credential_ownership_unverified');
 async function get(suffix){const r=await ports.authenticatedGet({...base,method:'GET',url:'https://graph.facebook.com/'+a.api_version+'/'+a.waba_id+suffix,redirect:'error',timeout:10000,maxResponseBytes:262144});if(r?.status!==200||Buffer.byteLength(JSON.stringify(r.data??null),'utf8')>262144)throw Error('RECHECK_UNCONFIRMED');return r.data;}
 try{
  const senders=await get('/phone_numbers');
  if(!Array.isArray(senders?.data)||senders.data.length>100||senders.data.filter(s=>s?.id===a.phone_number_id).length!==1)return fail('sender_account_match_unconfirmed');
  const response=await get('/message_templates?fields=id,name,language,status,category,components,parameter_format&limit=100');
  const selected=select(response,{id:t.id,name:t.name,language:t.language,variable_refs:t.variable_refs},now);
  if(!selected.allowed)return fail(selected.reason);
  // Legacy/operator revisions are opaque approved identifiers. Compare provider
  // fields independently; do not require their label to equal our hash algorithm.
  const observed=content({...selected.template,revision:t.revision});
  if(hash(observed)!==hash(content(t)))return fail('template_content_changed');
  return {...base,state:'verified',sender_account_match:true,template:observed,provider_content_hash:selected.template.revision};
 }catch{return fail('provider_recheck_unconfirmed');}
}
module.exports={content,recheck};
