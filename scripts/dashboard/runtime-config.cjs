'use strict';
const fs=require('node:fs');
function publicOrigin(value){
 if(value===undefined||value==='')return null;
 try{const url=new URL(value);if(url.protocol!=='https:'||url.origin!==value||url.username||url.password||url.hostname==='localhost'||url.hostname==='127.0.0.1'||url.hostname.includes('*'))throw Error();return url.origin;}catch{throw Error('DASHBOARD_PUBLIC_ORIGIN_INVALID');}
}
function databaseOptions(env=process.env,read=file=>fs.readFileSync(file,'utf8')){
 const names=['DATABASE_HOST','DATABASE_PORT','DATABASE_NAME','DATABASE_USER','DATABASE_PASSWORD_FILE','DATABASE_PASSWORD','DATABASE_TLS','DATABASE_CA_FILE'];
 if(!names.some(k=>env[k]))return null;
 const port=env.DATABASE_PORT||'5432',localPassword=env.DASHBOARD_RUNTIME==='local-container'&&typeof env.DATABASE_PASSWORD==='string';
 if(!env.DATABASE_HOST||!env.DATABASE_NAME||!env.DATABASE_USER||(!env.DATABASE_PASSWORD_FILE&&!localPassword)||!/^\d{1,5}$/.test(port)||Number(port)<1||Number(port)>65535||!['off','verify-full'].includes(env.DATABASE_TLS)||env.DATABASE_TLS==='verify-full'&&!env.DATABASE_CA_FILE)throw Error('DATABASE_CONFIGURATION_REQUIRED');
 const password=(env.DATABASE_PASSWORD_FILE?read(env.DATABASE_PASSWORD_FILE):env.DATABASE_PASSWORD).replace(/\r?\n$/,'');if(!password||password.includes('\0'))throw Error('DATABASE_CONFIGURATION_REQUIRED');
 return{host:env.DATABASE_HOST,port:Number(port),database:env.DATABASE_NAME,user:env.DATABASE_USER,password,ssl:env.DATABASE_TLS==='off'?false:{rejectUnauthorized:true,ca:read(env.DATABASE_CA_FILE)}};
}
function internalOrigin(value=process.env.N8N_INTERNAL_ORIGIN||'http://127.0.0.1:5678'){
 try{const url=new URL(value);if(url.origin!==value||url.protocol!=='http:'||!['127.0.0.1','localhost','n8n'].includes(url.hostname)||url.port!=='5678')throw Error();return url.origin;}catch{throw Error('N8N_INTERNAL_ORIGIN_INVALID');}
}
function localOrigin(value){if(value===undefined||value==='')return null;if(value!=='http://localhost:3000')throw Error('DASHBOARD_LOCAL_ORIGIN_INVALID');return value;}
module.exports={publicOrigin,databaseOptions,internalOrigin,localOrigin};
