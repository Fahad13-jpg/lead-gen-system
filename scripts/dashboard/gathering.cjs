'use strict';
const crypto=require('node:crypto');
const {validateRequest}=require('../lead-gathering/runtime.cjs');
const strategyRuntime=require('../lead-strategy/runtime.cjs').strategyRuntime;
const fields=['org_id','job_name','source','search_query','location','country_code','max_results','max_cost_usd','max_customer_cost_usd','billing_mode','request_id','website_filter','require_contact','include_categories','exclude_categories','exclude_unrelated_page_types'];
const publicCodes=new Set(['ORG_NOT_READY','REQUEST_ID_CONFLICT','PLATFORM_NOT_CONFIGURED','BYOK_NOT_CONNECTED','ORG_QUEUE_FULL','PROVIDER_BUDGET_EXHAUSTED','PRICE_CONFIRMATION_REQUIRED','INSUFFICIENT_PLATFORM_CREDITS','INVALID_REQUEST']);
function normalize(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!fields.includes(k)))throw Error('INVALID_FILTER');
 if(!Number.isSafeInteger(body.org_id)||body.org_id<1||!/^dash_[a-f0-9]{32}$/.test(body.request_id||''))throw Error('INVALID_FILTER');
 // Reuse the exact n8n validator without executing any workflow or provider call.
 const input={...body,result_mode:'new',scrape_contacts:true,exclude_closed:true};
 const validate=new Function('$input','$execution',`return (${validateRequest.toString()})();`);
 const p=validate({first:()=>({json:{body:input}})},{id:'dashboard'});
 if(p.error)throw Error('INVALID_FILTER');
 return Object.fromEntries([...fields,'result_mode','scrape_contacts','exclude_closed'].filter(k=>p[k]!==undefined&&p[k]!==null).map(k=>[k,p[k]]));
}
function gatheringService({identity,transport,apifyRecovery,connectionSafety=async()=>false,strategyReadiness=async()=>null,campaignLoader=async()=>null,campaignSave=async()=>{throw Error('UNAVAILABLE');},secret=crypto.randomBytes(32),now=Date.now}){
 function sign(payload){return crypto.createHmac('sha256',secret).update(payload).digest('base64url');}
 async function principal(token,org){const p=await identity.principal(token,org);if(!['owner','admin'].includes(p.role))throw Error('ROLE_REQUIRED');return p;}
 async function call(route,payload){
  let response;try{response=await transport(route,payload);}catch{throw Error(route==='start-scraping'?'SUBMISSION_UNCONFIRMED':'PREVIEW_UNAVAILABLE');}
  if(!response||!Number.isInteger(response.status)||!response.body||typeof response.body!=='object')throw Error(route==='start-scraping'?'SUBMISSION_UNCONFIRMED':'PREVIEW_UNAVAILABLE');
  if(response.status>=400||response.body.error===true||response.body.success===false){
   const code=response.body.code||response.body.error;throw Error(publicCodes.has(code)?code:route==='start-scraping'?'SUBMISSION_UNCONFIRMED':'PREVIEW_UNAVAILABLE');
  }
  return response.body;
 }
 return{
  async prepareApify(token,body){
   if(!body||Object.keys(body).some(k=>!['org_id','apify_api_key'].includes(k))||!Number.isSafeInteger(body.org_id)||body.org_id<1)throw Error('INVALID_FILTER');
   const p=await principal(token,body.org_id);if(!apifyRecovery)throw Error('APIFY_RECOVERY_UNAVAILABLE');
   return apifyRecovery.prepare(body.org_id,p.subject,body.apify_api_key);
  },
  async reconcileApify(token,body){
   if(!body||Object.keys(body).some(k=>!['org_id','recovery_token'].includes(k))||!Number.isSafeInteger(body.org_id)||body.org_id<1)throw Error('INVALID_FILTER');
   const p=await principal(token,body.org_id);if(!apifyRecovery)throw Error('APIFY_RECOVERY_UNAVAILABLE');
   return apifyRecovery.reconcile(body.recovery_token,body.org_id,p.subject);
  },
  async connectApify(token,body){
   if(!body||Object.keys(body).some(k=>!['org_id','apify_api_key','recovery_token'].includes(k))||!Number.isSafeInteger(body.org_id)||body.org_id<1||typeof body.apify_api_key!=='string'||body.apify_api_key.length>300||!/^apify_api_[A-Za-z0-9]+$/.test(body.apify_api_key.trim()))throw Error('INVALID_FILTER');
   const p=await principal(token,body.org_id);
   if(body.recovery_token!==undefined){if(!apifyRecovery)throw Error('APIFY_RECOVERY_UNAVAILABLE');apifyRecovery.verifyKey(body.recovery_token,body.org_id,p.subject,body.apify_api_key);}
   let safe=false;try{safe=await connectionSafety();}catch{}if(!safe)throw Error('APIFY_CONNECTION_UNAVAILABLE');
   let r;try{r=await transport('connect-apify',{org_id:body.org_id,apify_api_key:body.apify_api_key.trim()});}catch{throw Error('APIFY_CONNECTION_UNCONFIRMED');}
   if(r?.status===200&&r.body?.success===true&&r.body.org_id===body.org_id&&r.body.billing_mode==='byok')return{connected:true,billing_mode:'byok'};
   if(r?.status===400)throw Error('APIFY_KEY_NOT_VERIFIED');
   if(r?.status===409&&['PROVIDER_ACCOUNT_ALREADY_LINKED','ACCOUNT_HAS_UNSETTLED_JOBS','ORG_NOT_READY'].includes(r.body?.code))throw Error(r.body.code);
   throw Error('APIFY_CONNECTION_UNCONFIRMED');
  },
  async requestStrategy(token,body){
   if(!body||Object.keys(body).some(k=>!['org_id','campaign_id','lead_id','request_id'].includes(k))||![body.org_id,body.campaign_id,body.lead_id].every(v=>Number.isSafeInteger(v)&&v>0)||!/^dash_[a-f0-9]{32}$/.test(body.request_id||''))throw Error('INVALID_FILTER');
   await principal(token,body.org_id);
   let ready;try{ready=await strategyReadiness(body.org_id,body.campaign_id);}catch{throw Error('STRATEGY_READINESS_UNCONFIRMED');}
   if(ready?.generation_allowed!==true)throw Error(ready?.reasons?.[0]||'STRATEGY_READINESS_UNCONFIRMED');
   let r;try{r=await transport('strategy-request',body);}catch{throw Error('STRATEGY_REQUEST_UNCONFIRMED');}
   if(r?.status>=200&&r.status<300&&Number.isSafeInteger(r.body?.job_id)&&r.body.job_id>0&&r.body.org_id===body.org_id)return{accepted:true,job_id:r.body.job_id,status:r.body.status,replayed:r.body.replayed===true,request_id:body.request_id};
   if(['NOT_FOUND','QUEUE_FULL','REQUEST_ID_CONFLICT','INVALID_REQUEST'].includes(r?.body?.error))throw Error('STRATEGY_REQUEST_REJECTED');
   throw Error('STRATEGY_REQUEST_UNCONFIRMED');
  },
  async saveCampaign(token,body){
   if(!body||Object.keys(body).some(k=>!['org_id','config','campaign_id','expected_version','preferences','acknowledge_benefit_rules_reset'].includes(k)))throw Error('INVALID_FILTER');
   await principal(token,body.org_id);
   const editing=Object.hasOwn(body,'preferences');let current,payload;
   if(editing){
    if(Object.hasOwn(body,'config')||!Number.isSafeInteger(body.campaign_id)||body.campaign_id<1||!Number.isSafeInteger(body.expected_version)||body.expected_version<1)throw Error('INVALID_FILTER');
    current=await campaignLoader(body.org_id,body.campaign_id);if(!current)throw Error('CAMPAIGN_NOT_FOUND');
    if(current.version!==body.expected_version)throw Error('CAMPAIGN_VERSION_CONFLICT');
   }else if(body.campaign_id!==undefined||body.expected_version!==undefined||body.acknowledge_benefit_rules_reset!==undefined)throw Error('INVALID_FILTER');
   if(!editing&&body.config?.linkedin_manual!==undefined)require('./campaign-preferences.cjs').manualSettings(body.config.linkedin_manual,body.config);
   if(body.acknowledge_benefit_rules_reset!==undefined&&typeof body.acknowledge_benefit_rules_reset!=='boolean')throw Error('INVALID_FILTER');
   try{payload=strategyRuntime().campaign(editing?{...body,config:require('./campaign-preferences.cjs').merge(current.config,body.preferences,{resetBenefitRules:body.acknowledge_benefit_rules_reset===true})}:body);}catch(e){if(e.message==='CAMPAIGN_BENEFIT_RULE_REVIEW_REQUIRED')throw e;throw Error('INVALID_FILTER');}
   // Keep trusted saved extension data, including sender binding; the browser
   // cannot supply these keys through the preferences action.
   if(editing){
    payload.config={...current.config,...payload.config,templates:{...current.config.templates,...payload.config.templates}};
    if(body.preferences.pause_email===true)payload.config.email_dispatch={...current.config.email_dispatch,enabled:false};
    // Keep dormant, trusted copy when its channel/mode changes. A timing edit
    // must not trim previously supplied text or silently erase another template.
    if(body.preferences.email_template==null&&current.config.templates?.email)payload.config.templates.email=current.config.templates.email;
    if(Object.hasOwn(body.preferences,'email_daily_limit')){const preferences=require('./campaign-preferences.cjs');payload.config=preferences.withDailyLimit(payload.config,body.preferences.email_daily_limit,preferences.dailyLimit(current));}
   }
   let ready;try{ready=await strategyReadiness(body.org_id);}catch{throw Error('STRATEGY_READINESS_UNCONFIRMED');}
   if(ready?.management_available!==true)throw Error('STRATEGY_SERVICE_UNAVAILABLE');
   let result;try{result=editing?await campaignSave(payload):await transport('strategy-campaign',payload);}catch{throw Error('CAMPAIGN_SAVE_UNCONFIRMED');}
   if(result?.body?.error==='VERSION_CONFLICT')throw Error('CAMPAIGN_VERSION_CONFLICT');
   if(result?.body?.error==='NOT_FOUND')throw Error('CAMPAIGN_NOT_FOUND');
   if(!result||result.status<200||result.status>=300||!Number.isSafeInteger(result.body?.campaign_id)||result.body.campaign_id<1)throw Error('CAMPAIGN_SAVE_UNCONFIRMED');
   if(editing&&(result.body.campaign_id!==body.campaign_id||result.body.version!==body.expected_version+1))throw Error('CAMPAIGN_SAVE_UNCONFIRMED');
   return{saved:true,campaign_id:result.body.campaign_id,version:result.body.version};
  },
  async preview(token,body){
   const request=normalize(body),p=await principal(token,request.org_id);
   const result=await call('gathering-preview',request),b=result.billing;
   if(result.preview!==true||result.org_id!==request.org_id||!b||typeof b.ready!=='boolean')throw Error('PREVIEW_UNAVAILABLE');
   const charge=b.maximum_customer_charge_usd===undefined?null:Number(b.maximum_customer_charge_usd);
   if(b.ready&&(!Number.isFinite(charge)||charge<0))throw Error('PREVIEW_UNAVAILABLE');
   const canSubmit=b.ready===true&&b.can_submit===true&&charge<=request.max_customer_cost_usd;
   const reason=publicCodes.has(b.reason)?b.reason:b.ready&&b.provider_budget_available===false?'PROVIDER_BUDGET_EXHAUSTED':b.ready&&request.billing_mode==='platform'&&Number.isFinite(Number(b.wallet_available_usd))&&Number(b.wallet_available_usd)<charge?'INSUFFICIENT_PLATFORM_CREDITS':charge>request.max_customer_cost_usd?'PRICE_CONFIRMATION_REQUIRED':!canSubmit?'BUDGET_OR_CREDITS_UNAVAILABLE':null;
   const receipt=Buffer.from(JSON.stringify({subject:p.subject,request,expires:now()+600000,can_submit:canSubmit})).toString('base64url');
   return{preview:true,request,billing:{ready:b.ready,can_submit:canSubmit,reason,maximum_customer_charge_usd:charge,customer_pays_provider_directly:b.customer_pays_provider_directly===true,wallet_available_usd:Number.isFinite(Number(b.wallet_available_usd))?Number(b.wallet_available_usd):null,provider_budget_available:b.provider_budget_available===true},candidate_limit:Math.min(1500,request.max_results*3),preview_token:receipt+'.'+sign(receipt),expires_at:new Date(now()+600000).toISOString()};
  },
  async submit(token,body){
   if(!body||Object.keys(body).some(k=>!['org_id','preview_token'].includes(k))||!Number.isSafeInteger(body.org_id)||typeof body.preview_token!=='string'||body.preview_token.length>12000)throw Error('INVALID_FILTER');
   const p=await principal(token,body.org_id),parts=body.preview_token.split('.');
   if(parts.length!==2)throw Error('PREVIEW_EXPIRED');
   const signature=Buffer.from(sign(parts[0])),provided=Buffer.from(parts[1]);
   if(signature.length!==provided.length||!crypto.timingSafeEqual(signature,provided))throw Error('PREVIEW_EXPIRED');
   let receipt;try{receipt=JSON.parse(Buffer.from(parts[0],'base64url').toString());}catch{throw Error('PREVIEW_EXPIRED');}
   if(receipt.subject!==p.subject||receipt.request?.org_id!==body.org_id||receipt.expires<now()||receipt.can_submit!==true)throw Error('PREVIEW_EXPIRED');
   // Admission rechecks balances under existing database locks. Never auto-retry this POST.
   const result=await call('start-scraping',receipt.request);
   if(!Number.isSafeInteger(result.job_id)||result.job_id<1||result.org_id!==body.org_id)throw Error('SUBMISSION_UNCONFIRMED');
   return{accepted:true,job_id:result.job_id,status:typeof result.status==='string'?result.status:'queued',replayed:result.replayed===true,request_id:receipt.request.request_id};
  }
 };
}
function localGatheringTransport({key,baseURL=require('./runtime-config.cjs').internalOrigin(),fetchImpl=fetch}){
 if(typeof key!=='string'||!key.trim()||/[\r\n]/.test(key))throw Error('GATHERING_CONNECTION_REQUIRED');
 const base=new URL(baseURL);if(base.origin!==baseURL||!['http://127.0.0.1:5678','http://localhost:5678','http://n8n:5678'].includes(base.origin))throw Error('GATHERING_CONNECTION_REQUIRED');
 return async(route,body)=>{
  if(!['gathering-preview','start-scraping','strategy-campaign','strategy-request','strategy-approval','connect-apify'].includes(route))throw Error('INVALID_ROUTE');
  const res=await fetchImpl(`${baseURL}/webhook/${route}`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),headers:{'Content-Type':'application/json','X-Lead-Gathering-Key':key},body:JSON.stringify(body)});
  const text=await res.text();if(text.length>64000)throw Error('INVALID_RESPONSE');
  return{status:res.status,body:JSON.parse(text)};
 };
}
module.exports={gatheringService,normalize,localGatheringTransport};
