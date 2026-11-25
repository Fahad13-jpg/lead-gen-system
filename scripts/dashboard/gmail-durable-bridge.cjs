'use strict';
const crypto=require('node:crypto');
const q=v=>"'"+String(v).replace(/'/g,"''")+"'";
function durableBridge({identity,read,transaction,client,encrypt,rotateReconnect}){
 async function remember(db,id,value){await db.query(`INSERT INTO gmail_enrollment_journal(credential_ref,org_id,owner_subject,connection_id,email,phase,version,expires_at,oauth_state_hash) VALUES(${q(value.credential_ref)},${value.org_id},${q(value.owner_subject)},${q(id)},${q(value.email)},'registered',${value.version},now()+interval '60 seconds',${value.oauth_state_hash?q(value.oauth_state_hash):'NULL'}) ON CONFLICT(credential_ref) DO UPDATE SET owner_subject=excluded.owner_subject,phase='registered',version=excluded.version,expires_at=excluded.expires_at,oauth_state_hash=excluded.oauth_state_hash WHERE gmail_enrollment_journal.org_id=excluded.org_id AND gmail_enrollment_journal.connection_id=excluded.connection_id`);}
 async function owned(db,p,input){const r=(await db.query(`SELECT *,expires_at>now() AS fresh FROM gmail_enrollment_journal WHERE credential_ref=${q(input.credential_ref)} FOR UPDATE`)).rows[0];if(!r||!r.fresh||r.org_id!==p.org_id||r.owner_subject!==p.subject||r.connection_id!==input.connection_id||r.email!==input.email)throw Error('GMAIL_CREDENTIAL_OWNERSHIP_REQUIRED');return r;}
 return{
 ...require('./gmail-reconnect-bridge.cjs').reconnectBridge({identity,read,transaction,client,rotate:rotateReconnect,remember:()=>{},rememberInTransaction:remember}),
 async canRestartGmail(){return(await read("SELECT NOT EXISTS(SELECT 1 FROM credentials_entity WHERE type='gmailOAuth2' AND (name LIKE 'Managed Gmail %' OR name LIKE 'Quarantined Gmail %')) AS empty")).rows[0]?.empty===true;},
 async provisionCredential(input){const ref=crypto.randomUUID(),project=(await read(`SELECT "projectId" FROM shared_workflow WHERE "workflowId"='managedSmtpcheck' LIMIT 1`)).rows[0]?.projectId;if(typeof project!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(project))throw Error('GMAIL_CREDENTIAL_PROJECT_REQUIRED');
  const encrypted=await encrypt({clientId:client.client_id,clientSecret:client.client_secret,scope:'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly',oauthTokenData:input.tokens,...(typeof input.google_subject==='string'?{leadGenGoogleSubject:input.google_subject,leadGenGoogleEmail:input.email}:{})});
  await transaction(async db=>{
   await db.query(`WITH created AS (INSERT INTO credentials_entity(id,name,type,data) VALUES(${q(ref)},${q('Managed Gmail '+input.connection_id)},'gmailOAuth2',${q(encrypted)}) RETURNING id) INSERT INTO shared_credentials("credentialsId","projectId",role) SELECT id,${q(project)},'credential:owner' FROM created`);
   await db.query(`INSERT INTO gmail_enrollment_journal(credential_ref,org_id,owner_subject,connection_id,email,phase,oauth_state_hash) VALUES(${q(ref)},${input.org_id},${q(input.owner_subject)},${q(input.connection_id)},${q(input.email)},'provisioned',${input.oauth_state_hash?q(input.oauth_state_hash):'NULL'})`);
  });return{credential_ref:ref};
 },
 async registerSender(token,input){const p=await identity.principal(token,input.org_id);return transaction(async db=>{
  const r=await owned(db,p,input);if(r.phase!=='provisioned')throw Error('GMAIL_CREDENTIAL_OWNERSHIP_REQUIRED');
  const result=(await db.query(`SELECT sender_connection_manage(${p.org_id},${q(p.subject)},${q(JSON.stringify({...input,org_id:undefined,action:'create'}))}::jsonb) AS result`)).rows[0]?.result;
  if(result?.connection_id!==input.connection_id||result.org_id!==p.org_id||result.state!=='pending_check'||!Number.isSafeInteger(result.version))throw Error('GMAIL_REGISTRY_UNCONFIRMED');
  await remember(db,input.connection_id,{...r,version:result.version});return result;
 });},
 async checkSender(token,input){const p=await identity.principal(token,input.org_id);return transaction(async db=>{
  const r=await owned(db,p,input);if(r.phase!=='registered'||!Number.isSafeInteger(r.version))throw Error('GMAIL_CHECK_OWNERSHIP_REQUIRED');
  const result=(await db.query(`SELECT sender_connection_checked(${p.org_id},${q(input.connection_id)},${r.version},${q(JSON.stringify({email:r.email,credential_ref:r.credential_ref,send:true,read_replies:true}))}::jsonb) AS result`)).rows[0]?.result;
  if(result?.state!=='ready'||result.version!==r.version+1||result.execution_authorized!==false)throw Error('GMAIL_CHECK_UNCONFIRMED');
  await db.query(`UPDATE gmail_enrollment_journal SET phase='checked',version=${result.version} WHERE credential_ref=${q(r.credential_ref)}`);return result;
 });},
 async quarantineCredential({credential_ref}){return transaction(async db=>{
  const r=(await db.query(`SELECT * FROM gmail_enrollment_journal WHERE credential_ref=${q(credential_ref)} FOR UPDATE`)).rows[0];if(!r||r.phase!=='provisioned')return;
  await db.query(`WITH disabled AS (UPDATE sender_connections SET state='disabled',send_capable=false,reply_capable=false,version=version+1 WHERE org_id=${r.org_id} AND owner_subject=${q(r.owner_subject)} AND credential_ref=${q(credential_ref)} RETURNING connection_id) UPDATE credentials_entity SET name=${q('Quarantined Gmail '+r.connection_id)} WHERE id=${q(credential_ref)} AND type='gmailOAuth2'`);
  await db.query(`UPDATE gmail_enrollment_journal SET phase='quarantined' WHERE credential_ref=${q(credential_ref)}`);
 });}
 };
}
module.exports={durableBridge};
