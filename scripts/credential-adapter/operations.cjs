'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),profiles=require('./runtime-files.cjs');
function operations({cipher,runtimeRoot='/home/node/.n8n/custom'}){
 function encrypt(data){if(!data||typeof data!=='object'||Array.isArray(data))throw Error('CREDENTIAL_INPUT_INVALID');const encrypted=cipher.encrypt(data);if(cipher.decrypt(encrypted)!==JSON.stringify(data))throw Error('CREDENTIAL_ENCRYPTION_UNCONFIRMED');return encrypted;}
 function gmail(p){
  const data=JSON.parse(cipher.decrypt(p.cipher));if(data.clientId!==p.client_id)throw Error('GMAIL_RECONNECT_IDENTITY_REVIEW_REQUIRED');
  let sub=data.leadGenGoogleSubject,email=data.leadGenGoogleEmail;
  if(typeof sub!=='string'||typeof email!=='string'){try{const old=JSON.parse(Buffer.from(data.oauthTokenData.id_token.split('.')[1],'base64url').toString());if(old.aud!==p.client_id||!['accounts.google.com','https://accounts.google.com'].includes(old.iss)||old.email_verified!==true)throw Error();sub=old.sub;email=old.email;}catch{throw Error('GMAIL_RECONNECT_IDENTITY_REVIEW_REQUIRED');}}
  if(typeof sub!=='string'||!sub||typeof email!=='string')throw Error('GMAIL_RECONNECT_IDENTITY_REVIEW_REQUIRED');
  if(sub!==p.google_subject||email.toLowerCase()!==p.email)throw Error('GMAIL_RECONNECT_ACCOUNT_MISMATCH');
  if(typeof p.tokens?.refresh_token!=='string'||!p.tokens.refresh_token||typeof p.tokens?.access_token!=='string'||!p.tokens.access_token)throw Error('CREDENTIAL_INPUT_INVALID');
  return encrypt({...data,clientSecret:p.client_secret,oauthTokenData:p.tokens,leadGenGoogleSubject:sub,leadGenGoogleEmail:p.email});
 }
 function smtp(p){
  const result={};if(typeof p.email!=='string'||p.email.startsWith('='))throw Error('CREDENTIAL_INPUT_INVALID');
  for(const kind of ['smtp','imap']){const password=p[kind+'_password'];if(typeof password!=='string'||!password||password.length>4096||password.startsWith('=')||/[\r\n\x00]/.test(password))throw Error('CREDENTIAL_INPUT_INVALID');
   const data=JSON.parse(cipher.decrypt(p[kind+'_cipher']));if(typeof data.user!=='string'||data.user.toLowerCase()!==p.email||typeof data.host!=='string'||!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(data.host))throw Error('CREDENTIAL_INPUT_INVALID');
   if(kind==='smtp'&&(![465,587].includes(Number(data.port))||data.disableStartTls))throw Error('CREDENTIAL_INPUT_INVALID');
   if(kind==='imap'&&(Number(data.port)!==993||data.secure!==true||data.allowUnauthorizedCerts))throw Error('CREDENTIAL_INPUT_INVALID');
   result[kind]=encrypt({...data,password});
  }return result;
 }
 function hashes(p){if(!p||Object.keys(p).some(k=>k!=='profile')||!Object.hasOwn(profiles,p.profile))throw Error('CREDENTIAL_INPUT_INVALID');return Object.fromEntries(Object.keys(profiles[p.profile]).map(file=>{const target=path.join(runtimeRoot,file);return[file,fs.existsSync(target)?crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'):null];}));}
 return{encrypt,gmail,smtp,hashes};
}
module.exports={operations};
