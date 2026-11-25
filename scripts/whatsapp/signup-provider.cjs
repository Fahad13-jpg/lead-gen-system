'use strict';
// Fixed Meta signup endpoints only. No messaging, retries or provider error logs.
const assert=require('node:assert/strict');
const id=v=>typeof v==='string'&&/^\d{5,30}$/.test(v);
const secret=v=>typeof v==='string'&&v.length>0&&v.length<=8192&&!/[\s\p{Cc}\p{Cf}]/u.test(v);
function provider({config,fetch=require('./network.cjs').createSignupFetch()}){
 assert(id(config?.app_id)&&id(config.configuration_id)&&/^v\d{1,3}\.\d$/.test(config.api_version||'')&&secret(config.app_secret),'WHATSAPP_SIGNUP_CONFIG_REQUIRED');
 const base='https://graph.facebook.com/'+config.api_version;
 async function read(path,params,token){
  const target=new URL(base+path);for(const [key,value]of Object.entries(params))target.searchParams.set(key,value);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
   const r=await fetch(target.toString(),{method:'GET',headers:token?{Authorization:'Bearer '+token}:{},redirect:'error',signal:controller.signal});
   if(r?.status!==200){try{await r?.body?.cancel();}catch{}throw Error();}
   if(typeof r.body?.getReader!=='function')throw Error();
   const reader=r.body.getReader(),chunks=[];let size=0;
   try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>65536)throw Error();chunks.push(Buffer.from(part.value));}}
   finally{try{await reader.cancel();}catch{}reader.releaseLock();}
   const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(!data||typeof data!=='object'||Array.isArray(data)||data.error)throw Error();return data;
  }catch{throw Error('WHATSAPP_META_AUTHORIZATION_UNCONFIRMED');}finally{clearTimeout(timer);}
 }
 return {
  async exchangeCode(p){
   assert(p?.app_id===config.app_id&&p.configuration_id===config.configuration_id&&p.origin===config.https_origin&&secret(p.code)&&p.code.length<=4096,'WHATSAPP_SIGNUP_BINDING_REQUIRED');
   const data=await read('/oauth/access_token',{client_id:config.app_id,client_secret:config.app_secret,code:p.code});
   if(!secret(data.access_token))throw Error('WHATSAPP_META_AUTHORIZATION_UNCONFIRMED');return {access_token:data.access_token};
  },
  async inspectToken(p){
   assert(secret(p?.access_token),'WHATSAPP_TOKEN_REQUIRED');
   const {data}=await read('/debug_token',{input_token:p.access_token},config.app_id+'|'+config.app_secret);
   if(!data||data.is_valid!==true||data.app_id!==config.app_id||!Array.isArray(data.scopes))throw Error('WHATSAPP_META_AUTHORIZATION_UNCONFIRMED');
   return {is_valid:true,app_id:data.app_id,scopes:data.scopes,expires_at:data.expires_at,data_access_expires_at:data.data_access_expires_at};
  },
  async accountPhones(p){
   assert(id(p?.waba_id)&&secret(p.access_token),'WHATSAPP_ACCOUNT_REQUIRED');
   const result=await read('/'+p.waba_id+'/phone_numbers',{},p.access_token);
   if(!Array.isArray(result.data)||result.data.length>100)throw Error('WHATSAPP_META_AUTHORIZATION_UNCONFIRMED');
   return {data:result.data.map(p=>({id:p.id}))};
  }
 };
}
module.exports={provider};
