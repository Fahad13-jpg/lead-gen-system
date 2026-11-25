'use strict';
const fs=require('node:fs');
function loadClient(file,{redirect_uri='http://localhost:3002/oauth/gmail/callback'}={}){
 try{const url=new URL(redirect_uri);if(url.href!==redirect_uri||url.pathname!=='/oauth/gmail/callback'||url.search||url.hash||url.username||url.password||url.protocol!=='https:'&&!['http://localhost:3002','http://127.0.0.1:3002'].includes(url.origin))throw Error();}catch{throw Error('GMAIL_CLIENT_CONFIG_INVALID');}
 let c;try{c=JSON.parse(fs.readFileSync(file,'utf8')).web;}catch{throw Error('GMAIL_CLIENT_CONFIG_INVALID');}
 if(!c||typeof c.client_id!=='string'||!c.client_id.endsWith('.apps.googleusercontent.com')||typeof c.client_secret!=='string'||!c.client_secret||!Array.isArray(c.redirect_uris)||!c.redirect_uris.includes(redirect_uri))throw Error('GMAIL_CLIENT_CONFIG_INVALID');
 return c;
}
function provider({client,fetchImpl=fetch,verifier,onDiagnostic}){
 async function json(url,options){let r;try{r=await fetchImpl(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error();return await r.json();}catch(error){
  const codes=['ETIMEDOUT','ENETUNREACH','EAI_AGAIN','ENOTFOUND','ECONNRESET','ECONNREFUSED','UND_ERR_CONNECT_TIMEOUT'];
  const code=[error?.code,error?.cause?.code,...(Array.isArray(error?.cause?.errors)?error.cause.errors.map(e=>e?.code):[])].find(c=>codes.includes(c));
  try{onDiagnostic?.({endpoint:options.method==='POST'?'token_exchange':'mailbox_profile',http_status:Number.isInteger(r?.status)?r.status:null,failure_class:code||(['TimeoutError','AbortError'].includes(error?.name)?'TIMEOUT':r?'HTTP_OR_RESPONSE':'TRANSPORT_UNCONFIRMED')});}catch{}
  throw Error('GMAIL_PROVIDER_UNCONFIRMED');}}
 return{
  async exchangeCode(input){
   if(input.client_id!==client.client_id||!client.redirect_uris.includes(input.redirect_uri))throw Error('GMAIL_CLIENT_CONFIG_INVALID');
   // One POST only: an uncertain code exchange is never blindly replayed.
   return json('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:client.client_id,client_secret:client.client_secret,code:input.code,code_verifier:input.code_verifier,redirect_uri:input.redirect_uri,grant_type:'authorization_code'}).toString()});
  },
  async verifyIdentity(input){
   if(input.audience!==client.client_id)throw Error('GMAIL_IDENTITY_UNCONFIRMED');
   try{const ticket=await verifier.verifyIdToken({idToken:input.id_token,audience:client.client_id});const claims=ticket.getPayload();if(claims?.nonce!==input.nonce)throw Error();return claims;}catch{throw Error('GMAIL_IDENTITY_UNCONFIRMED');}
  },
  async getProfile({access_token}){return json('https://gmail.googleapis.com/gmail/v1/users/me/profile',{method:'GET',headers:{Authorization:'Bearer '+access_token}});}
 };
}
module.exports={loadClient,provider};
