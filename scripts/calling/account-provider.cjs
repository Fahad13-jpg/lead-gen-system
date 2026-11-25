'use strict';
// Read-only onboarding. No call, number purchase, agent mutation or balance claim.
const crypto=require('node:crypto'),fs=require('node:fs');
function vault(file){
 const key=fs.readFileSync(file);if(key.length!==32)throw Error('CALLING_ACCOUNT_SETUP_REQUIRED');
 const aad=org=>Buffer.from(`calling-account-v1:${org}`);
 return{
  seal(org,value){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv);c.setAAD(aad(org));const data=Buffer.concat([c.update(JSON.stringify(value),'utf8'),c.final()]);return{v:1,iv:iv.toString('base64'),data:data.toString('base64'),tag:c.getAuthTag().toString('base64')};},
  open(org,value){if(value?.v!==1)throw Error('CALLING_ACCOUNT_SETUP_REQUIRED');const c=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(value.iv,'base64'));c.setAAD(aad(org));c.setAuthTag(Buffer.from(value.tag,'base64'));return JSON.parse(Buffer.concat([c.update(Buffer.from(value.data,'base64')),c.final()]).toString('utf8'));}
 };
}
function provider({fetcher=fetch,onDiagnostic=()=>{}}={}){
 function failure(stage,reason,status=null){try{onDiagnostic({stage,reason,status});}catch{}const e=Error('CALLING_ACCOUNT_NOT_VERIFIED');e.publicReason=reason;return e;}
 async function get(key,path,stage){try{
  const r=await fetcher('https://api.retellai.com'+path,{method:'GET',redirect:'error',headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(6500)});
  if(r.status!==200)throw failure(stage,[401,403].includes(r.status)?'CALLING_API_KEY_REJECTED':r.status===404?(stage==='number'?'CALLING_NUMBER_NOT_FOUND':'CALLING_AGENT_NOT_FOUND'):[400,422].includes(r.status)?'CALLING_VERSION_NOT_AVAILABLE':'CALLING_LOOKUP_UNAVAILABLE',r.status);
  const body=await r.text();if(body.length>1000000)throw Error('FAILED');return JSON.parse(body);
 }catch(e){if(e.publicReason)throw e;throw failure(stage,'CALLING_LOOKUP_UNAVAILABLE');}}
 return{async inspect({api_key,agent_id,agent_version,from_number}){
  const [agent,number]=await Promise.all([get(api_key,'/get-agent/'+encodeURIComponent(agent_id)+'?version='+agent_version,'agent'),from_number?get(api_key,'/get-phone-number/'+encodeURIComponent(from_number),'number'):null]);
  const e=agent?.response_engine;
  const llm=e?.type==='retell-llm'&&/^[A-Za-z0-9_-]{1,100}$/.test(e.llm_id||'')&&Number.isInteger(e.version)&&e.version>=0?await get(api_key,'/get-retell-llm/'+encodeURIComponent(e.llm_id)+'?version='+e.version,'engine'):null;
  return{agent,llm,number};
 },async verify({api_key,agent_id,agent_version,from_number}){
  const a=await get(api_key,'/get-agent/'+encodeURIComponent(agent_id)+'?version='+agent_version,'agent');
  if(a?.agent_id!==agent_id)throw failure('agent','CALLING_AGENT_NOT_FOUND');
  if(a.version!==agent_version||a.is_published!==true)throw failure('agent','CALLING_VERSION_NOT_PUBLISHED');
  if(from_number){const n=await get(api_key,'/get-phone-number/'+encodeURIComponent(from_number),'number');if(n?.phone_number!==from_number)throw failure('number','CALLING_NUMBER_NOT_FOUND');}
  // Account access is not proof of approved prompt/tools, caller authorization or route health.
  return{agent_id,agent_version,from_number:from_number||null};
 }};
}
module.exports={vault,provider};
