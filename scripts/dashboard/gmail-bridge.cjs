'use strict';
const crypto=require('node:crypto'),cp=require('node:child_process');
const q=v=>"'"+String(v).replace(/'/g,"''")+"'";
const encryptionProgram=`let raw='';process.stdin.on('data',b=>{raw+=b;if(raw.length>65536)process.exit(1)});process.stdin.on('end',()=>{try{const fs=require('fs');const root='/usr/local/lib/node_modules/n8n';const {Cipher}=require(require.resolve('n8n-core',{paths:[root]}));const encryptionKey=process.env.N8N_ENCRYPTION_KEY||JSON.parse(fs.readFileSync('/home/node/.n8n/config','utf8')).encryptionKey;if(!encryptionKey)throw Error();const c=new Cipher({encryptionKey});const data=JSON.parse(raw);const encrypted=c.encrypt(data);if(c.decrypt(encrypted)!==JSON.stringify(data))throw Error();process.stdout.write(encrypted);}catch{process.exitCode=1}});`;
function encryptInContainer(data){const adapter=require('./credential-adapter-client.cjs').fromEnvironment();if(adapter)return adapter.encrypt(data);return new Promise((resolve,reject)=>{
 const child=cp.spawn('docker',['exec','-i','n8n','node','-e',encryptionProgram],{windowsHide:true,stdio:['pipe','pipe','pipe']});let output='';
 const timer=setTimeout(()=>{child.kill();reject(Error('GMAIL_CREDENTIAL_STORAGE_UNCONFIRMED'));},20000);
 child.stdout.on('data',b=>{output+=b;if(output.length>131072)child.kill();});child.stderr.on('data',()=>{});child.on('error',()=>{clearTimeout(timer);reject(Error('GMAIL_CREDENTIAL_STORAGE_UNCONFIRMED'));});
 child.on('close',code=>{clearTimeout(timer);code===0&&/^[A-Za-z0-9+/=]+$/.test(output)?resolve(output):reject(Error('GMAIL_CREDENTIAL_STORAGE_UNCONFIRMED'));});child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(data));
});}
function bridge({identity,read,write,client,encrypt=encryptInContainer,transaction,rotateReconnect=require('./gmail-token-crypto.cjs').rotateGmailInContainer,durable=false}){
 if(durable)return require('./gmail-durable-bridge.cjs').durableBridge({identity,read,transaction,client,encrypt,rotateReconnect});
 const pending=new Map(),registered=new Map();
 return{
  ...require('./gmail-reconnect-bridge.cjs').reconnectBridge({identity,read,transaction,client,rotate:rotateReconnect,remember:(id,value)=>registered.set(id,value)}),
  async canRestartGmail(){
   // Fail closed for historical encrypted orphans as well as registered senders.
   const result=await read(`SELECT NOT EXISTS(SELECT 1 FROM credentials_entity WHERE type='gmailOAuth2' AND (name LIKE 'Managed Gmail %' OR name LIKE 'Quarantined Gmail %')) AS empty`);
   return result.rows[0]?.empty===true;
  },
  async provisionCredential(input){
   // Installed n8n credentials_entity/shared_credentials IDs are varchar(36).
   const ref=crypto.randomUUID();
   const project=(await read(`SELECT "projectId" FROM shared_workflow WHERE "workflowId"='managedSmtpcheck' LIMIT 1`)).rows[0]?.projectId;
   if(typeof project!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(project))throw Error('GMAIL_CREDENTIAL_PROJECT_REQUIRED');
   const encrypted=await encrypt({clientId:client.client_id,clientSecret:client.client_secret,scope:'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly',oauthTokenData:input.tokens,...(typeof input.google_subject==='string'?{leadGenGoogleSubject:input.google_subject,leadGenGoogleEmail:input.email}:{})});
   // One SQL statement atomically inserts encrypted data and its existing n8n project owner.
   pending.set(ref,{org_id:input.org_id,owner_subject:input.owner_subject,connection_id:input.connection_id,email:input.email});
   await write(`WITH created AS (INSERT INTO credentials_entity(id,name,type,data) VALUES(${q(ref)},${q('Managed Gmail '+input.connection_id)},'gmailOAuth2',${q(encrypted)}) RETURNING id)
     INSERT INTO shared_credentials("credentialsId","projectId",role) SELECT id,${q(project)},'credential:owner' FROM created`);
   return{credential_ref:ref};
  },
  async registerSender(token,input){
   const p=await identity.principal(token,input.org_id),owned=pending.get(input.credential_ref);
   if(!owned||owned.org_id!==p.org_id||owned.owner_subject!==p.subject||owned.connection_id!==input.connection_id||owned.email!==input.email)throw Error('GMAIL_CREDENTIAL_OWNERSHIP_REQUIRED');
   const result=(await write(`SELECT sender_connection_manage(${p.org_id},${q(p.subject)},${q(JSON.stringify({...input,org_id:undefined,action:'create'}))}::jsonb) AS result`)).rows[0]?.result;
   if(result?.connection_id!==input.connection_id||result.org_id!==p.org_id||result.state!=='pending_check')throw Error('GMAIL_REGISTRY_UNCONFIRMED');
   registered.set(input.connection_id,{...owned,credential_ref:input.credential_ref,version:result.version,expires:Date.now()+60000});pending.delete(input.credential_ref);return result;
  },
  async checkSender(token,input){
   // Internal-only continuation of verified OAuth enrollment, not a dashboard action.
   // Read/send capabilities mean granted permissions, not proven mail delivery.
   const p=await identity.principal(token,input.org_id),owned=registered.get(input.connection_id);
   for(const [key,value]of registered)if(value.expires<=Date.now())registered.delete(key);
   if(!owned||owned.expires<=Date.now()||owned.org_id!==p.org_id||owned.owner_subject!==p.subject||owned.credential_ref!==input.credential_ref||owned.email!==input.email||!Number.isSafeInteger(owned.version))throw Error('GMAIL_CHECK_OWNERSHIP_REQUIRED');
   registered.delete(input.connection_id);
   const result=(await write(`SELECT sender_connection_checked(${p.org_id},${q(input.connection_id)},${owned.version},${q(JSON.stringify({email:owned.email,credential_ref:owned.credential_ref,send:true,read_replies:true}))}::jsonb) AS result`)).rows[0]?.result;
   if(result?.state!=='ready'||result.version!==owned.version+1||result.execution_authorized!==false)throw Error('GMAIL_CHECK_UNCONFIRMED');
   return result;
  },
  async quarantineCredential({credential_ref}){
   const owned=pending.get(credential_ref);if(!owned)return;
   await write(`WITH disabled AS (UPDATE sender_connections SET state='disabled',send_capable=false,reply_capable=false,version=version+1 WHERE org_id=${owned.org_id} AND owner_subject=${q(owned.owner_subject)} AND credential_ref=${q(credential_ref)} RETURNING connection_id)
     UPDATE credentials_entity SET name=${q('Quarantined Gmail '+owned.connection_id)} WHERE id=${q(credential_ref)} AND type='gmailOAuth2'`);pending.delete(credential_ref);
  }
 };
}
module.exports={bridge,encryptInContainer};
