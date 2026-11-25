'use strict';
const q=v=>"'"+String(v).replace(/'/g,"''")+"'";
function reconnectBridge({identity,read,transaction,client,rotate,remember,rememberInTransaction}){
 async function target(token,p,checkVersion=true){
  if(!p||!Number.isSafeInteger(p.org_id)||p.org_id<1||!/^gmail_[a-f0-9]{32}$/.test(p.connection_id||'')||checkVersion&&(!Number.isSafeInteger(p.expected_version)||p.expected_version<1))throw Error('INVALID_FILTER');
  const principal=await identity.principal(token,p.org_id);if(principal.org_id!==p.org_id||!/^[a-f0-9]{64}$/.test(principal.subject||''))throw Error('MEMBERSHIP_REQUIRED');
  const r=(await read(`SELECT s.org_id,s.connection_id,s.version,s.email,s.sharing FROM sender_connections s JOIN organizations o ON o.id=s.org_id AND o.status='active' JOIN org_sender_memberships m ON m.org_id=s.org_id AND m.subject=${q(principal.subject)} AND m.active WHERE s.org_id=${p.org_id} AND s.connection_id=${q(p.connection_id)} AND s.provider='gmail' AND (s.owner_subject=m.subject OR (s.sharing='team' AND m.role IN ('owner','admin')))`)).rows[0];
  if(!r)throw Error('GMAIL_RECONNECT_FORBIDDEN');if(checkVersion&&r.version!==p.expected_version)throw Error('GMAIL_RECONNECT_VERSION_CONFLICT');return r;
 }
 return{
  reconnectTarget:(token,p)=>target(token,p),reconnectStatus:(token,p)=>target(token,p,false),
  async replaceCredential(token,p){
   if(typeof transaction!=='function'||typeof rotate!=='function')throw Error('GMAIL_SETUP_REQUIRED');
   const current=await target(token,p),principal=await identity.principal(token,p.org_id);
   if(current.email!==p.email||typeof p.google_subject!=='string'||!p.google_subject||p.google_subject.length>255||/[\x00-\x20]/.test(p.google_subject))throw Error('GMAIL_RECONNECT_ACCOUNT_MISMATCH');
   try{
    const saved=await transaction(async db=>{
     if(!(await db.query(`SELECT id FROM organizations WHERE id=${p.org_id} AND status='active' FOR UPDATE`)).rows[0])throw Error('GMAIL_RECONNECT_FORBIDDEN');
     const m=(await db.query(`SELECT role FROM org_sender_memberships WHERE org_id=${p.org_id} AND subject=${q(principal.subject)} AND active FOR SHARE`)).rows[0];if(!m)throw Error('GMAIL_RECONNECT_FORBIDDEN');
     const s=(await db.query(`SELECT s.connection_id,s.org_id,s.version,s.email,s.credential_ref,c.data FROM sender_connections s JOIN credentials_entity c ON c.id=s.credential_ref AND c.type='gmailOAuth2' JOIN shared_credentials sc ON sc."credentialsId"=c.id WHERE s.org_id=${p.org_id} AND s.connection_id=${q(p.connection_id)} AND s.provider='gmail' AND (s.owner_subject=${q(principal.subject)} OR (s.sharing='team' AND ${q(m.role)} IN ('owner','admin'))) AND sc."projectId"=(SELECT "projectId" FROM shared_workflow WHERE "workflowId"='managedSmtpcheck' LIMIT 1) FOR UPDATE OF s,c`)).rows[0];
     if(!s)throw Error('GMAIL_RECONNECT_FORBIDDEN');if(s.version!==p.expected_version)throw Error('GMAIL_RECONNECT_VERSION_CONFLICT');if(s.email!==p.email)throw Error('GMAIL_RECONNECT_ACCOUNT_MISMATCH');
     const encrypted=await rotate({cipher:s.data,email:s.email,google_subject:p.google_subject,client_id:client.client_id,client_secret:client.client_secret,tokens:p.tokens});
     if(typeof encrypted!=='string'||!(/^[A-Za-z0-9+/=]+$/).test(encrypted))throw Error('GMAIL_RECONNECT_UNCONFIRMED');
     if((await db.query(`UPDATE credentials_entity SET data=${q(encrypted)},"updatedAt"=now() WHERE id=${q(s.credential_ref)} AND type='gmailOAuth2' RETURNING id`)).rows[0]?.id!==s.credential_ref)throw Error('GMAIL_RECONNECT_UNCONFIRMED');
     const r=(await db.query(`UPDATE sender_connections SET version=version+1,state='pending_check',send_capable=false,reply_capable=false,checked_at=NULL WHERE org_id=${p.org_id} AND connection_id=${q(p.connection_id)} AND version=${p.expected_version} RETURNING org_id,connection_id,version,state`)).rows[0];
     if(r?.version!==p.expected_version+1||r.connection_id!==p.connection_id||r.state!=='pending_check')throw Error('GMAIL_RECONNECT_UNCONFIRMED');if(rememberInTransaction)await rememberInTransaction(db,r.connection_id,{org_id:p.org_id,owner_subject:principal.subject,email:p.email,credential_ref:s.credential_ref,version:r.version,oauth_state_hash:p.oauth_state_hash});return{...r,credential_ref:s.credential_ref};
    });
    remember(saved.connection_id,{org_id:p.org_id,owner_subject:principal.subject,connection_id:saved.connection_id,email:p.email,credential_ref:saved.credential_ref,version:saved.version,expires:Date.now()+60000});return saved;
   }catch(e){if(['GMAIL_RECONNECT_FORBIDDEN','GMAIL_RECONNECT_VERSION_CONFLICT','GMAIL_RECONNECT_ACCOUNT_MISMATCH','GMAIL_RECONNECT_IDENTITY_REVIEW_REQUIRED'].includes(e.message))throw e;throw Error('GMAIL_RECONNECT_UNCONFIRMED');}
  }
 };
}
module.exports={reconnectBridge};
