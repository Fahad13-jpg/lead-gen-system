'use strict';
// Offline-testable adapter. Inject vetted SMTP/IMAP clients; never sends mail.
const assert=require('node:assert/strict'),net=require('node:net');
function publicV4(ip){
 if(net.isIP(ip)!==4)return false;const [a,b]=ip.split('.').map(Number);
 return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&[0,168].includes(b)||a===100&&b>=64&&b<=127||a===198&&[18,19,51].includes(b)||a===203&&b===0);
}
async function endpoint(value,kind,resolve){
 assert(value&&Object.keys(value).every(k=>['host','port'].includes(k)),'UNSUPPORTED_ENDPOINT_FIELD');
 assert(typeof value.host==='string'&&value.host.length<=253&&/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(value.host),'PUBLIC_HOST_REQUIRED');
 assert((kind==='smtp'?[465,587]:[993]).includes(value.port),'TLS_PORT_REQUIRED');
 const addresses=await resolve(value.host,{all:true});
 assert(Array.isArray(addresses)&&addresses.length>0&&addresses.every(a=>publicV4(a.address)),'PUBLIC_IPV4_REQUIRED');
 return {host:addresses[0].address,port:value.port,secure:value.port!==587,requireTLS:true,
  tls:{servername:value.host,rejectUnauthorized:true,minVersion:'TLSv1.2'},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000,logger:false,debug:false};
}
async function check(config,deps){
 let smtp,imap;
 try{
  const smtpOptions=await endpoint(config.smtp,'smtp',deps.resolve);
  const imapOptions=await endpoint(config.imap,'imap',deps.resolve);
  // Secret resolution must be org-scoped and implemented by the trusted credential bridge.
  const secret=await deps.loadCredentials(config.org_id,config.credential_ref,config.inbox_credential_ref);
  smtp=deps.createSmtp({...smtpOptions,auth:secret.smtp,disableFileAccess:true,disableUrlAccess:true});
  await smtp.verify();
  imap=deps.createImap({...imapOptions,auth:secret.imap});await imap.connect();
  const lock=await imap.getMailboxLock('INBOX',{readOnly:true,acquireTimeout:10000});try{assert(imap.mailbox,'INBOX_UNAVAILABLE');}finally{lock.release();}
  // Authentication proves access, not authority to use an arbitrary From address.
  return {smtp_authenticated:true,inbox_access:true,sender_identity_verified:false,send:false,read_replies:false,
   reason:'sender_identity_and_reply_matching_not_verified',messages_sent:0};
 }catch{return {smtp_authenticated:false,inbox_access:false,send:false,read_replies:false,reason:'connection_check_failed',messages_sent:0};}
 finally{try{smtp?.close();}catch{}try{await imap?.logout();}catch{}}
}
module.exports={publicV4,endpoint,check};
