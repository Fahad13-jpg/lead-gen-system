'use strict';
const fs=require('node:fs');
const safe=new Set(['GMAIL_RECONNECT_IDENTITY_REVIEW_REQUIRED','GMAIL_RECONNECT_ACCOUNT_MISMATCH']);
function create({url,token,fetcher=fetch}){
 let base;try{base=new URL(url);if(base.origin!==url||base.protocol!=='http:'||!['127.0.0.1','localhost','credential-adapter'].includes(base.hostname)||base.port!=='3013')throw Error();}catch{throw Error('CREDENTIAL_ADAPTER_SETUP_REQUIRED');}
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw Error('CREDENTIAL_ADAPTER_SETUP_REQUIRED');
 async function request(route,body){try{const r=await fetcher(url+route,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});const raw=await r.text();if(raw.length>524288)throw Error();const result=JSON.parse(raw);if(r.status!==200){if(safe.has(result.error))throw Error(result.error);throw Error();}return result.value;}catch(e){throw Error(safe.has(e.message)?e.message:'CREDENTIAL_ADAPTER_UNAVAILABLE');}}
 const ciphertext=value=>{if(typeof value!=='string'||!value||!/^[A-Za-z0-9+/=]+$/.test(value))throw Error('CREDENTIAL_ADAPTER_UNAVAILABLE');return value;};
 return{encrypt:async p=>ciphertext(await request('/v1/encrypt',p)),rotateGmail:async p=>ciphertext(await request('/v1/rotate-gmail',p)),rotateSmtp:async p=>{const r=await request('/v1/rotate-smtp',p);return{smtp:ciphertext(r?.smtp),imap:ciphertext(r?.imap)};},runtimeHashes:p=>request('/v1/runtime-check',{profile:p})};
}
function fromEnvironment(env=process.env){
 if(!env.CREDENTIAL_ADAPTER_URL&&!env.CREDENTIAL_ADAPTER_TOKEN_FILE){
  if(env!==process.env)return null;
  const file=require('node:path').resolve(__dirname,'../../.local/credential-adapter/gateway.json');if(!fs.existsSync(file))return null;
  const config=JSON.parse(fs.readFileSync(file,'utf8'));return create({url:config.url,token:fs.readFileSync(config.token_file,'utf8').trim()});
 }
 if(!env.CREDENTIAL_ADAPTER_URL||!env.CREDENTIAL_ADAPTER_TOKEN_FILE)throw Error('CREDENTIAL_ADAPTER_SETUP_REQUIRED');return create({url:env.CREDENTIAL_ADAPTER_URL,token:fs.readFileSync(env.CREDENTIAL_ADAPTER_TOKEN_FILE,'utf8').trim()});
}
module.exports={create,fromEnvironment};
