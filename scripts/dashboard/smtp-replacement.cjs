'use strict';
const q=v=>"'"+String(v).replace(/'/g,"''")+"'";
function normalize(p){
 const fields=['org_id','connection_id','expected_version','acknowledge_recheck','smtp_password','imap_password'];
 if(!p||Array.isArray(p)||Object.keys(p).length!==fields.length||Object.keys(p).some(k=>!fields.includes(k))||!Number.isSafeInteger(p.org_id)||p.org_id<1||!/^smtp_[a-f0-9]{32}$/.test(p.connection_id||'')||!Number.isSafeInteger(p.expected_version)||p.expected_version<1||p.acknowledge_recheck!==true)throw Error('INVALID_FILTER');
 for(const k of ['smtp_password','imap_password'])if(typeof p[k]!=='string'||!p[k].length||p[k].length>4096||p[k].startsWith('=')||/[\r\n\x00]/.test(p[k]))throw Error('INVALID_FILTER');
 return p;
}
function smtpReplacement({identity,transaction,rotate,provision}){return{async replaceSmtp(token,body){
 const p=normalize(body),principal=await identity.principal(token,p.org_id);
 if(principal.org_id!==p.org_id||!/^[a-f0-9]{64}$/.test(principal.subject||''))throw Error('AUTHENTICATION_FAILED');
 try{
  const saved=await transaction(async db=>{
   if(!(await db.query(`SELECT id FROM organizations WHERE id=${p.org_id} AND status='active' FOR UPDATE`)).rows[0])throw Error('SMTP_REPLACEMENT_REJECTED');
   const member=(await db.query(`SELECT role FROM org_sender_memberships WHERE org_id=${p.org_id} AND subject=${q(principal.subject)} AND active FOR SHARE`)).rows[0];if(!member)throw Error('MEMBERSHIP_REQUIRED');
   const s=(await db.query(`SELECT connection_id,version,email,sharing,owner_subject,credential_ref,inbox_credential_ref FROM sender_connections WHERE org_id=${p.org_id} AND connection_id=${q(p.connection_id)} AND provider='smtp' AND (owner_subject=${q(principal.subject)} OR (sharing='team' AND ${q(member.role)} IN ('owner','admin'))) FOR UPDATE`)).rows[0];
   if(!s||typeof s.email!=='string'||s.email.startsWith('='))throw Error('SMTP_REPLACEMENT_REJECTED');if(s.version!==p.expected_version)throw Error('SMTP_VERSION_CONFLICT');
   const credentials=(await db.query(`SELECT c.id,c.type,c.data FROM credentials_entity c JOIN shared_credentials sc ON sc."credentialsId"=c.id WHERE ((c.id=${q(s.credential_ref)} AND c.type='smtp') OR (c.id=${q(s.inbox_credential_ref)} AND c.type='imap')) AND sc."projectId"=(SELECT "projectId" FROM shared_workflow WHERE "workflowId"='managedSmtpcheck' LIMIT 1) FOR UPDATE OF c`)).rows;
   if(credentials.length!==2||!credentials.some(c=>c.id===s.credential_ref&&c.type==='smtp')||!credentials.some(c=>c.id===s.inbox_credential_ref&&c.type==='imap'))throw Error('SMTP_REPLACEMENT_REJECTED');
   const encrypted=await rotate({email:s.email,smtp_cipher:credentials.find(c=>c.type==='smtp').data,imap_cipher:credentials.find(c=>c.type==='imap').data,smtp_password:p.smtp_password,imap_password:p.imap_password});
   for(const kind of ['smtp','imap'])if(typeof encrypted?.[kind]!=='string'||!(/^[A-Za-z0-9+/=]+$/).test(encrypted[kind]))throw Error('SMTP_ENCRYPTION_UNCONFIRMED');
   for(const kind of ['smtp','imap']){const id=kind==='smtp'?s.credential_ref:s.inbox_credential_ref;const updated=(await db.query(`UPDATE credentials_entity SET data=${q(encrypted[kind])},"updatedAt"=now() WHERE id=${q(id)} AND type=${q(kind)} RETURNING id`)).rows[0];if(updated?.id!==id)throw Error('SMTP_REPLACEMENT_UNCONFIRMED');}
   const r=(await db.query(`UPDATE sender_connections SET version=version+1,state='pending_check',send_capable=false,reply_capable=false,checked_at=NULL WHERE org_id=${p.org_id} AND connection_id=${q(p.connection_id)} AND version=${p.expected_version} RETURNING org_id,connection_id,version,state`)).rows[0];
   if(r?.org_id!==p.org_id||r.connection_id!==p.connection_id||r.version!==p.expected_version+1||r.state!=='pending_check')throw Error('SMTP_REPLACEMENT_UNCONFIRMED');
   return{connection_id:r.connection_id,version:r.version,state:r.state,execution_authorized:false,campaign_rebind_required:true};
  });
  if(!provision)return saved;
  try{const setup=await provision({org_id:p.org_id,connection_id:p.connection_id,subject:principal.subject});return{...saved,workflow_setup:setup?.workflow_setup==='configured'?'configured':'pending_operator_review'};}catch{return{...saved,workflow_setup:'pending_operator_review'};}
 }catch(e){if(['SMTP_VERSION_CONFLICT','SMTP_REPLACEMENT_REJECTED','MEMBERSHIP_REQUIRED'].includes(e.message))throw e;throw Error('SMTP_REPLACEMENT_UNCONFIRMED');}
}};}
module.exports={normalize,smtpReplacement};
