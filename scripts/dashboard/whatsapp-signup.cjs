'use strict';
// Composition for the existing one-use-session orchestrator. Disabled until an
// operator supplies private Meta setup; browser identity/scopes are never trusted.
function signup({identity,config,transaction,encrypt,fetch,now=Date.now,allowedOrigins=[]}){
 let core;
 if(config?.enabled===true){
  try{
   if(config.embedded_signup_version!==4||!transaction||!encrypt||!allowedOrigins.includes(config.https_origin)||new URL(config.https_origin).protocol!=='https:'||Date.parse(config.credential_rotation_deadline)<=now()||!Number.isFinite(Date.parse(config.credential_rotation_deadline)))throw Error();
   const provider=require('../whatsapp/signup-provider.cjs').provider({config,...(fetch?{fetch}:{})});
   const storage=require('./whatsapp-signup-storage.cjs').storage({identity,transaction,encrypt,now});
   const {onboarding,memorySessions}=require('../whatsapp/onboarding.cjs');
   core=onboarding({config,now,sessions:memorySessions({now,limit:100}),principal:(token,org)=>identity.principal(token,org),...provider,...storage});
  }catch{}
 }
 const ready=()=>core?.status().enabled===true&&Date.parse(config.credential_rotation_deadline)>now();
 return {
  ready,
  async begin(token,p,origin){
   if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>k!=='org_id')||!Number.isSafeInteger(p.org_id)||p.org_id<1)throw Error('INVALID_FILTER');
   await identity.principal(token,p.org_id);
   if(!ready())throw Error('WHATSAPP_SIGNUP_SETUP_REQUIRED');
   if(origin!==config.https_origin)throw Error('WHATSAPP_SIGNUP_ORIGIN_REQUIRED');
   return core.begin(token,{org_id:p.org_id,origin});
  },
  async complete(token,p,origin){
   if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['org_id','state','code','waba_id','phone_number_id','connection_id','sharing'].includes(k))||!Number.isSafeInteger(p.org_id)||p.org_id<1)throw Error('INVALID_FILTER');
   await identity.principal(token,p.org_id);
   if(!ready())throw Error('WHATSAPP_SIGNUP_SETUP_REQUIRED');
   if(origin!==config.https_origin)throw Error('WHATSAPP_SIGNUP_ORIGIN_REQUIRED');
   try{return await core.complete(token,{...p,origin,limits:{daily_messages:10,rolling_24h_messages:10,min_interval_seconds:300}});}
   catch(e){if(['MEMBERSHIP_REQUIRED','TEAM_SENDER_ADMIN_REQUIRED'].includes(e.message))throw Error('ROLE_REQUIRED');throw Error('WHATSAPP_SIGNUP_RESULT_REJECTED');}
  }
 };
}
module.exports={signup};
