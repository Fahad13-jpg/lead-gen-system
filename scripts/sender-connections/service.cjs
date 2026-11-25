'use strict';
// Backend service, not a public n8n webhook. No token, password or provider errors in results.
const assert=require('node:assert/strict'),auth=require('./auth.cjs'),connections=require('./connections.cjs');
const q=value=>"'"+String(value).replace(/'/g,"''")+"'";
const json=value=>q(JSON.stringify(value))+'::jsonb';
function service(deps){
 async function principal(token,org){
  assert(Number.isSafeInteger(org)&&org>0,'INVALID_ORG');
  const identity=auth.verify(token,deps.authConfig);
  const member=await deps.query(`SELECT jsonb_build_object('org_id',org_id,'subject',subject,'role',role,'active',active) AS result FROM org_sender_memberships WHERE org_id=${org} AND subject=${q(identity.subject)} AND active`);
  assert(member&&member.org_id===org&&member.subject===identity.subject&&member.active===true,'MEMBERSHIP_REQUIRED');return member;
 }
 return {
  async create(token,input){
   const p=await principal(token,input?.org_id);
   const catalog=await deps.credentialCatalog(p.org_id); // Operator-managed mapping, not input.
   connections.create(input,p,catalog);
   const {org_id,...payload}=input;
   return deps.query(`SELECT sender_connection_manage(${org_id},${q(p.subject)},${json({...payload,action:'create'})}) AS result`);
  },
  async transition(token,input){
   assert(input&&Object.keys(input).every(k=>['org_id','connection_id','expected_version','action'].includes(k)),'UNSUPPORTED_FIELD');
   assert(['pause','disconnect','recheck'].includes(input.action),'INVALID_ACTION');
   const p=await principal(token,input.org_id);const {org_id,...payload}=input;
   return deps.query(`SELECT sender_connection_manage(${org_id},${q(p.subject)},${json(payload)}) AS result`);
  },
  async list(token,org){
   const p=await principal(token,org);
   return deps.query(`SELECT coalesce(jsonb_agg(jsonb_build_object('connection_id',connection_id,'provider',provider,'email',email,'state',state,'version',version,'sharing',sharing,'checked_at',checked_at)),'[]'::jsonb) AS result FROM sender_connections WHERE org_id=${org} AND (sharing='team' OR owner_subject=${q(p.subject)} OR ${q(p.role)} IN ('owner','admin'))`);
  },
  async bind(token,input){
   assert(input&&Object.keys(input).every(k=>['org_id','connection_id','campaign_id','expected_version'].includes(k)),'UNSUPPORTED_FIELD');
   assert(Number.isSafeInteger(input.campaign_id)&&input.campaign_id>0&&Number.isSafeInteger(input.expected_version)&&input.expected_version>0,'INVALID_CAMPAIGN');
   assert(typeof input.connection_id==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(input.connection_id),'INVALID_CONNECTION');
   const p=await principal(token,input.org_id);
   return deps.query(`SELECT sender_connection_bind(${input.org_id},${q(p.subject)},${q(input.connection_id)},${input.campaign_id},${input.expected_version}) AS result`);
  }
 };
}
module.exports={service};
