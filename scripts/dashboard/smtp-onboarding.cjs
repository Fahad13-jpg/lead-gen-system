'use strict';
// Authenticated credential enrollment only. No SMTP/IMAP connection or sending.
const crypto=require('node:crypto');
const q=v=>"'"+String(v).replace(/'/g,"''")+"'";
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).every(k=>keys.includes(k))&&keys.every(k=>Object.hasOwn(v,k));
function normalize(p){
 if(!exact(p,['org_id','request_id','email','sharing','smtp','imap'])||!Number.isSafeInteger(p.org_id)||p.org_id<1||!/^smtp_[a-f0-9]{32}$/.test(p.request_id||'')||!['private','team'].includes(p.sharing))throw Error('INVALID_FILTER');
 const email=typeof p.email==='string'?p.email.trim().toLowerCase():'';
 if(email.startsWith('=')||email.length>254||!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(email))throw Error('INVALID_FILTER');
 const result={...p,email};
 for(const kind of ['smtp','imap']){
  const v=p[kind];if(!exact(v,['host','port','password'])||typeof v.host!=='string'||v.host.length>253||typeof v.password!=='string'||!v.password.length||v.password.startsWith('=')||v.password.length>4096||/[\r\n\x00]/.test(v.password))throw Error('INVALID_FILTER');
  const host=v.host.trim().toLowerCase();
  if(!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)||!(kind==='smtp'?[465,587]:[993]).includes(v.port))throw Error('INVALID_FILTER');
  result[kind]={host,port:v.port,password:v.password};
 }
 return result;
}
function smtpOnboarding({identity,transaction,encrypt,provision}){
 return{async connectSmtp(token,body){
  const p=normalize(body),principal=await identity.principal(token,p.org_id);
  if(principal.org_id!==p.org_id||!/^[a-f0-9]{64}$/.test(principal.subject||''))throw Error('AUTHENTICATION_FAILED');
  if(p.sharing==='team'&&!['owner','admin'].includes(principal.role))throw Error('ROLE_REQUIRED');
  const connection_id=p.request_id; // org-scoped; replay also checks the verified owner
  const result=s=>({connection_id:s.connection_id,state:s.state,version:s.version,execution_authorized:false,connection_check_required:true});
  try{const saved=await transaction(async db=>{
   const org=(await db.query(`SELECT id FROM organizations WHERE id=${p.org_id} AND status='active' FOR UPDATE`)).rows[0];if(!org)throw Error('SMTP_ORG_UNAVAILABLE');
   const member=(await db.query(`SELECT role FROM org_sender_memberships WHERE org_id=${p.org_id} AND subject=${q(principal.subject)} AND active FOR SHARE`)).rows[0];
   if(!member||p.sharing==='team'&&!['owner','admin'].includes(member.role))throw Error('MEMBERSHIP_REQUIRED');
   const existing=(await db.query(`SELECT connection_id,owner_subject,email,sharing,state,version,provider FROM sender_connections WHERE org_id=${p.org_id} AND connection_id=${q(connection_id)}`)).rows[0];
   if(existing){if(existing.owner_subject!==principal.subject||existing.email!==p.email||existing.provider!=='smtp'||existing.sharing!==p.sharing)throw Error('SMTP_REQUEST_CONFLICT');return result(existing);}
   const project=(await db.query(`SELECT "projectId" FROM shared_workflow WHERE "workflowId"='managedSmtpcheck' LIMIT 1`)).rows[0]?.projectId;
   if(typeof project!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(project))throw Error('SMTP_SETUP_REQUIRED');
   // Use the same canonical mailbox as username for both protocols. Aliases and
   // service-account usernames remain unsupported by the existing adapter.
   const [smtp,imap]=await Promise.all([
    encrypt({host:p.smtp.host,port:p.smtp.port,user:p.email,password:p.smtp.password,secure:p.smtp.port===465,disableStartTls:false}),
    encrypt({host:p.imap.host,port:993,user:p.email,password:p.imap.password,secure:true,allowUnauthorizedCerts:false})
   ]);
   if([smtp,imap].some(v=>typeof v!=='string'||!v||!(/^[A-Za-z0-9+/=]+$/).test(v)))throw Error('SMTP_ENCRYPTION_UNCONFIRMED');
   const credential_ref=crypto.randomUUID(),inbox_credential_ref=crypto.randomUUID();
   for(const [ref,type,data]of [[credential_ref,'smtp',smtp],[inbox_credential_ref,'imap',imap]]){
    await db.query(`INSERT INTO credentials_entity(id,name,type,data) VALUES(${q(ref)},${q('Managed SMTP '+connection_id+' '+type)},${q(type)},${q(data)})`);
    await db.query(`INSERT INTO shared_credentials("credentialsId","projectId",role) VALUES(${q(ref)},${q(project)},'credential:owner')`);
   }
   const payload={action:'create',connection_id,provider:'smtp',credential_ref,inbox_credential_ref,email:p.email,sharing:p.sharing,limits:{daily_limit:10,mailbox_rolling_limit:10,min_interval_seconds:300}};
   const s=(await db.query(`SELECT sender_connection_manage(${p.org_id},${q(principal.subject)},${q(JSON.stringify(payload))}::jsonb) AS result`)).rows[0]?.result;
   if(s?.connection_id!==connection_id||s.org_id!==p.org_id||s.state!=='pending_check'||s.version!==1||s.execution_authorized!==false)throw Error('SMTP_REGISTRATION_UNCONFIRMED');
   return result(s);
  });
   if(!provision)return saved;
   // Storage is already confirmed. A later API/setup failure must not be
   // reported as an uncertain credential write or prompt another enrollment.
   try{const setup=await provision({org_id:p.org_id,connection_id,subject:principal.subject});return{...saved,workflow_setup:setup?.workflow_setup==='configured'?'configured':'pending_operator_review',connection_check_scheduled:setup?.connection_check_scheduled===true,sending_activated:false};}
   catch{return{...saved,workflow_setup:'pending_operator_review'};}
  }catch(e){if(['SMTP_SETUP_REQUIRED','SMTP_REQUEST_CONFLICT','SMTP_ORG_UNAVAILABLE','MEMBERSHIP_REQUIRED'].includes(e.message))throw e;throw Error('SMTP_CONNECTION_UNCONFIRMED');}
 }};
}
module.exports={normalize,smtpOnboarding};
