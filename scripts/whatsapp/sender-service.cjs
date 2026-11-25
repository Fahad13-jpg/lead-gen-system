'use strict';
// Private backend methods only. No public routes or Embedded Signup claims.
const assert=require('node:assert/strict'),auth=require('../sender-connections/auth.cjs'),registry=require('./sender-registry.cjs'),connection=require('./connection.cjs');
const q=v=>"'"+String(v).replace(/'/g,"''")+"'",json=v=>q(JSON.stringify(v))+'::jsonb';
const key=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(v),id=v=>Number.isSafeInteger(v)&&v>0;
function service(deps){
 async function principal(token,org){assert(id(org),'INVALID_ORG');const identity=auth.verify(token,deps.authConfig),p=await deps.query(`SELECT jsonb_build_object('org_id',org_id,'subject',subject,'role',role,'active',active) AS result FROM org_sender_memberships WHERE org_id=${org} AND subject=${q(identity.subject)} AND active`);assert(p?.org_id===org&&p.subject===identity.subject&&p.active===true,'MEMBERSHIP_REQUIRED');return p;}
 function request(input,keys){assert(input&&Object.keys(input).every(k=>['org_id',...keys].includes(k)),'UNSUPPORTED_FIELD');assert(key(input.connection_id),'INVALID_CONNECTION');}
 return {
  async create(token,input){const p=await principal(token,input?.org_id),payload=registry.create(input,p,await deps.credentialCatalog(p.org_id));const {org_id,...body}=payload;return deps.query(`SELECT sender_whatsapp_manage(${org_id},${q(p.subject)},${json(body)}) AS result`);},
  async list(token,org){const p=await principal(token,org);return deps.query(`SELECT coalesce(jsonb_agg(jsonb_build_object('connection_id',connection_id,'provider',provider,'sharing',sharing,'version',version,'state',CASE WHEN state='ready' THEN 'identity_checked' ELSE state END,'checked_at',checked_at,'phone_number_id',channel_metadata->>'phone_number_id','waba_id',channel_metadata->>'waba_id','api_version',channel_metadata->>'api_version','sending_verified',false)),'[]'::jsonb) AS result FROM sender_connections WHERE org_id=${org} AND provider='whatsapp' AND (sharing='team' OR owner_subject=${q(p.subject)} OR ${q(p.role)} IN ('owner','admin'))`);},
  async transition(token,input){request(input,['connection_id','expected_version','action']);assert(id(input.expected_version)&&['pause','disconnect','recheck'].includes(input.action),'INVALID_ACTION');const p=await principal(token,input.org_id),{org_id,...payload}=input;return deps.query(`SELECT sender_whatsapp_manage(${org_id},${q(p.subject)},${json(payload)}) AS result`);},
  async bind(token,input){request(input,['connection_id','campaign_id','expected_version']);assert(id(input.campaign_id)&&id(input.expected_version),'INVALID_CAMPAIGN');const p=await principal(token,input.org_id);return deps.query(`SELECT sender_whatsapp_bind(${p.org_id},${q(p.subject)},${q(input.connection_id)},${input.campaign_id},${input.expected_version}) AS result`);},
  async check(token,input){
   request(input,['connection_id','expected_version']);assert(id(input.expected_version),'INVALID_VERSION');const p=await principal(token,input.org_id);
   const r=await deps.query(`SELECT sender_whatsapp_check_input(${p.org_id},${q(p.subject)},${q(input.connection_id)},${input.expected_version}) AS result`);if(r?.ready!==true)return r;
   const task=r.task,catalog=await deps.credentialCatalog(p.org_id);registry.catalogCredential(catalog,p.org_id,task.credential_ref,task.waba_id);
   assert(task.org_id===p.org_id&&task.connection_id===input.connection_id&&task.version===input.expected_version,'CHECK_BINDING_MISMATCH');
   assert(typeof deps.authenticatedGet==='function','TRUSTED_CONNECTOR_REQUIRED');
   const result=await connection.check(task,{authorizeBinding:async b=>b.org_id===p.org_id&&b.credential_ref===task.credential_ref,authenticatedGet:deps.authenticatedGet});
   return deps.query(`SELECT sender_whatsapp_checked(${p.org_id},${q(task.connection_id)},${task.version},${json(result)}) AS result`);
  }
 };
}
module.exports={service};
