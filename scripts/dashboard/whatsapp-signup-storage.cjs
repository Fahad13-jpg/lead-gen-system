'use strict';
// Tokens are encrypted in n8n before persistence. Credential/project ownership and
// pending sender registration commit together; no ready flag or workflow is set.
const crypto=require('node:crypto'),assert=require('node:assert/strict');
const registry=require('../whatsapp/sender-registry.cjs');
const key=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(v);
function storage({identity,transaction,encrypt,now=Date.now}){
 const pending=new Map();
 function clean(){for(const [ref,v]of pending)if(v.expires<=now()&&!v.attempted)pending.delete(ref);}
 return {
  async provisionCredential(p){
   clean();assert(pending.size<100,'WHATSAPP_SIGNUP_CAPACITY');
   assert(Number.isSafeInteger(p?.org_id)&&p.org_id>0&&/^[a-f0-9]{64}$/.test(p.owner_subject||'')&&key(p.connection_id),'WHATSAPP_CREDENTIAL_BINDING_REQUIRED');
   assert(typeof p.access_token==='string'&&p.access_token.length>0&&p.access_token.length<=8192&&!/[\s\p{Cc}\p{Cf}]/u.test(p.access_token)&&/^\d{5,30}$/.test(p.waba_id||'')&&/^\d{5,30}$/.test(p.phone_number_id||'')&&/^v\d{1,3}\.\d$/.test(p.api_version||'')&&Date.parse(p.credential_expires_at)>now()+30000,'WHATSAPP_CREDENTIAL_BINDING_REQUIRED');
   const encrypted=await encrypt({accessToken:p.access_token,businessAccountId:p.waba_id});
   assert(typeof encrypted==='string'&&/^[A-Za-z0-9+/=]+$/.test(encrypted),'WHATSAPP_ENCRYPTION_UNCONFIRMED');
   const credential_ref=crypto.randomUUID();pending.set(credential_ref,{org_id:p.org_id,owner_subject:p.owner_subject,connection_id:p.connection_id,waba_id:p.waba_id,phone_number_id:p.phone_number_id,api_version:p.api_version,credential_expires_at:p.credential_expires_at,encrypted,expires:now()+300000,attempted:false});
   return {credential_ref};
  },
  async registerSender(token,input){
   clean();const a=await identity.principal(token,input.org_id),v=pending.get(input.credential_ref);
   assert(a?.active===true&&v&&v.expires>now()&&!v.attempted&&a.org_id===v.org_id&&a.subject===v.owner_subject&&input.connection_id===v.connection_id&&input.whatsapp?.waba_id===v.waba_id&&input.whatsapp?.phone_number_id===v.phone_number_id&&input.whatsapp?.api_version===v.api_version,'WHATSAPP_CREDENTIAL_OWNERSHIP_REQUIRED');
   const catalog=[{id:input.credential_ref,org_id:v.org_id,type:'whatsAppApi',active:true,waba_id:v.waba_id,credential_expires_at:v.credential_expires_at}];
   const payload=registry.create(input,a,catalog,now());
   v.attempted=true; // Ambiguous commit never permits a second registration.
   const result=await transaction(async db=>{
    const member=(await db.query("SELECT m.role FROM org_sender_memberships m JOIN organizations o ON o.id=m.org_id AND o.status='active' WHERE m.org_id=$1 AND m.subject=$2 AND m.active FOR SHARE OF m",[v.org_id,a.subject])).rows[0];
    assert(member&&['owner','admin','member'].includes(member.role)&&!(input.sharing==='team'&&!['owner','admin'].includes(member.role)),'MEMBERSHIP_REQUIRED');
    const project=(await db.query("SELECT \"projectId\" FROM shared_workflow WHERE \"workflowId\"='managedSmtpcheck' LIMIT 1")).rows[0]?.projectId;
    assert(typeof project==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(project),'WHATSAPP_CREDENTIAL_PROJECT_REQUIRED');
    await db.query('INSERT INTO credentials_entity(id,name,type,data) VALUES($1,$2,$3,$4)',[input.credential_ref,'Managed WhatsApp '+v.connection_id,'whatsAppApi',v.encrypted]);
    await db.query('INSERT INTO shared_credentials("credentialsId","projectId",role) VALUES($1,$2,$3)',[input.credential_ref,project,'credential:owner']);
    const {org_id,...body}=payload;
    const r=(await db.query('SELECT sender_whatsapp_manage($1,$2,$3::jsonb) AS result',[org_id,a.subject,JSON.stringify(body)])).rows[0]?.result;
    assert(r?.org_id===v.org_id&&r.connection_id===v.connection_id&&r.state==='pending_check'&&r.version===1&&r.execution_authorized===false,'WHATSAPP_REGISTRATION_UNCONFIRMED');return r;
   });
   pending.delete(input.credential_ref);return result;
  },
  async quarantineCredential({org_id,credential_ref}){
   const v=pending.get(credential_ref);if(!v||v.org_id!==org_id)return;
   // Also covers a connection whose COMMIT succeeded but response was lost.
   // Preserve encrypted material for reconciliation; never delete credentials.
   if(v.attempted)await transaction(async db=>{
    await db.query("UPDATE sender_connections SET state='disabled',send_capable=false,reply_capable=false,version=version+1 WHERE org_id=$1 AND owner_subject=$2 AND connection_id=$3 AND credential_ref=$4 AND provider='whatsapp'",[org_id,v.owner_subject,v.connection_id,credential_ref]);
    await db.query("UPDATE credentials_entity SET name=$1 WHERE id=$2 AND type='whatsAppApi'",['Quarantined WhatsApp '+v.connection_id,credential_ref]);
   });
   pending.delete(credential_ref);
  }
 };
}
module.exports={storage};
