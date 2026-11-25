'use strict';
// Loaded inside n8n. Uses its installed dependencies, not exported credential files.
const {createRequire}=require('node:module'),dns=require('node:dns').promises,assert=require('node:assert/strict');
const {endpoint}=require('./smtp-check.cjs');
function libraries(){const r=createRequire('/usr/local/lib/node_modules/n8n/node_modules/n8n-nodes-base/package.json');return {nodemailer:r('nodemailer'),Imap:createRequire(r.resolve('@n8n/imap'))('imap'),simpleParser:r('mailparser').simpleParser,Client:r('pg').Client};}
function bounded(p,ms,abort=()=>{}){let timer;return Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>{abort();reject(Object.assign(Error('OPERATION_TIMEOUT'),{code:'ETIMEDOUT'}));},ms);})]).finally(()=>clearTimeout(timer));}
function safeConnectionError(error){
 const allowed=['ETIMEDOUT','ECONNRESET','ECONNREFUSED','ENOTFOUND','EAI_AGAIN','EAUTH','ESOCKET'];
 const code=error?.source==='timeout-auth'?'IMAP_AUTH_TIMEOUT':error?.source==='timeout'?'IMAP_CONNECT_TIMEOUT':allowed.includes(error?.code)?error.code:error?.source==='authentication'?'EAUTH':String(error?.source||'').startsWith('timeout')?'ETIMEDOUT':'IMAP_CONNECTION_FAILED';
 return Object.assign(Error('SENDER_CONNECTION_FAILED'),{code});
}
function imapAdapter(raw){
 const client={mailbox:null,
 async getMailboxLock(){const box=await bounded(new Promise((resolve,reject)=>raw.openBox('INBOX',true,(e,b)=>e?reject(e):resolve(b))),10000,()=>raw.destroy());client.mailbox={uidValidity:box.uidvalidity,uidNext:box.uidnext};return {release(){}};},
 async *fetch(range){
  const items=await bounded(new Promise((resolve,reject)=>{
   let bytes=0;const rows=[],fetch=raw.fetch(range,{bodies:'',markSeen:false});
   fetch.on('message',msg=>{let attributes,chunks=[],size=0;
    msg.on('attributes',a=>{attributes=a;});
    msg.on('body',stream=>{stream.on('data',chunk=>{size+=chunk.length;bytes+=chunk.length;if(size>1048576||bytes>5242880){raw.destroy();reject(Error('MIME_LIMIT'));}else chunks.push(chunk);});stream.on('error',reject);});
    msg.on('end',()=>{rows.push({uid:attributes?.uid,received_at:attributes?.date?.toISOString(),source:Buffer.concat(chunks)});if(rows.length>100){raw.destroy();reject(Error('MESSAGE_LIMIT'));}});
   });fetch.once('error',reject);fetch.once('end',()=>resolve(rows));
  }),20000,()=>raw.destroy());
  for(const row of items)yield row;
 },async logout(){raw.end();}};
 return client;
}
async function connect(credentials,binding,lib=libraries()){
 const smtp=credentials.smtp,imap=credentials.imap;
 // First release supports canonical username mailboxes only, not aliases/service accounts.
 assert(String(smtp.user).toLowerCase()===binding.email&&String(imap.user).toLowerCase()===binding.email,'CANONICAL_MAILBOX_REQUIRED');
 assert(!smtp.disableStartTls&&!imap.allowUnauthorizedCerts&&imap.secure===true,'STRICT_TLS_REQUIRED');
 const resolve=(host,options)=>bounded(dns.lookup(host,{...options,family:4}),10000);
 const so=await endpoint({host:smtp.host,port:Number(smtp.port)},'smtp',resolve),io=await endpoint({host:imap.host,port:Number(imap.port)},'imap',resolve);
 const transport=lib.nodemailer.createTransport({...so,auth:{user:smtp.user,pass:smtp.password},pool:false,disableFileAccess:true,disableUrlAccess:true});
 let raw;
 try{
  raw=new lib.Imap({host:io.host,port:io.port,tls:true,tlsOptions:io.tls,user:imap.user,password:imap.password,connTimeout:10000,authTimeout:20000,socketTimeout:30000,keepalive:false});
  raw.on('error',()=>{}); // Errors are surfaced as generic operation failures, never credential-bearing logs.
  await bounded(new Promise((resolve,reject)=>{raw.once('ready',resolve);raw.once('error',reject);raw.once('end',()=>reject(Error('IMAP_ENDED')));raw.connect();}),35000,()=>raw.destroy());
  const client=imapAdapter(raw);
  return {transport,client,async close(){transport.close();raw.destroy();}};
 }catch(error){transport.close();raw?.destroy();throw safeConnectionError(error);}
}
module.exports={libraries,bounded,imapAdapter,connect,safeConnectionError};
