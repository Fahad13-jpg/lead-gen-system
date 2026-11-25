'use strict';
// Trusted-backend contract. Never accept principal/catalog/check results from a webhook body.
const assert=require('node:assert/strict');
const policy=require('../lead-strategy/v2/sender-policy.cjs');
const id=v=>Number.isSafeInteger(v)&&v>0;
const token=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(v);
function authorize(principal,org,owner,sharing){
 assert(principal&&id(org)&&principal.org_id===org&&principal.active===true&&token(principal.subject),'MEMBERSHIP_REQUIRED');
 assert(['owner','admin','member'].includes(principal.role),'ROLE_REQUIRED');
 assert(sharing!=='private'||principal.subject===owner||['owner','admin'].includes(principal.role),'PRIVATE_SENDER');
}
function create(input,principal,catalog){
 assert(input&&Object.keys(input).every(k=>['org_id','connection_id','provider','credential_ref','inbox_credential_ref','email','sharing','limits'].includes(k)),'UNSUPPORTED_CONNECTION_FIELD');
 authorize(principal,input.org_id,principal.subject,'private');
 assert(token(input.connection_id)&&['gmail','smtp'].includes(input.provider),'INVALID_CONNECTION');
 assert(['private','team'].includes(input.sharing),'INVALID_SHARING');
 if(input.sharing==='team')assert(['owner','admin'].includes(principal.role),'TEAM_SENDER_ADMIN_REQUIRED');
 const refs=[['credential_ref',input.provider==='gmail'?'gmailOAuth2':'smtp']];
 if(input.provider==='smtp')refs.push(['inbox_credential_ref','imap']);
 for(const [key,type] of refs){
  assert(token(input[key]),'CREDENTIAL_REFERENCE_REQUIRED');
  assert(catalog.some(c=>c.id===input[key]&&c.org_id===input.org_id&&c.type===type&&c.active===true),'CREDENTIAL_OWNERSHIP_REQUIRED');
 }
 assert(!input.inbox_credential_ref||input.provider==='smtp','UNEXPECTED_INBOX_CREDENTIAL');
 const limits=input.limits;assert(limits&&Object.keys(limits).sort().join(',')==='daily_limit,mailbox_rolling_limit,min_interval_seconds','INVALID_LIMITS');
 assert(policy.validate({enabled:false,credential_ref:input.credential_ref,sender_email:input.email,...limits}).valid,'INVALID_SENDER_POLICY');
 return {version:1,connection_id:input.connection_id,org_id:input.org_id,provider:input.provider,credential_ref:input.credential_ref,
  ...(input.inbox_credential_ref?{inbox_credential_ref:input.inbox_credential_ref}:{}),email:input.email,owner_subject:principal.subject,
  sharing:input.sharing,limits:{...limits},state:'pending_check',capabilities:{send:false,read_replies:false},checked_at:null,execution_authorized:false};
}
function checked(connection,result,now=new Date().toISOString()){
 // Result comes ONLY from a server-side connector. Check completion is not sending authority.
 assert(['pending_check','reconnect_required','degraded'].includes(connection.state),'CHECK_NOT_PENDING');
 assert(Number.isFinite(Date.parse(now)),'INVALID_CHECK_TIME');
 const identity=result?.email===connection.email&&result?.credential_ref===connection.credential_ref;
 const capabilities={send:identity&&result.send===true,read_replies:identity&&result.read_replies===true};
 return {...connection,version:connection.version+1,state:capabilities.send&&capabilities.read_replies?'ready':'reconnect_required',capabilities,
  checked_at:now,execution_authorized:false};
}
function transition(connection,action,principal,expectedVersion){
 authorize(principal,connection.org_id,connection.owner_subject,connection.sharing);
 assert(principal.subject===connection.owner_subject||['owner','admin'].includes(principal.role),'MANAGE_SENDER_FORBIDDEN');
 assert(expectedVersion===connection.version,'CONNECTION_VERSION_CONFLICT');
 assert(['pause','disconnect','recheck'].includes(action),'INVALID_CONNECTION_ACTION');
 return {...connection,version:connection.version+1,state:action==='pause'?'disabled':action==='disconnect'?'disconnected':'pending_check',
  capabilities:{send:false,read_replies:false},checked_at:null,execution_authorized:false};
}
function binding(connection,principal,now=Date.now()){
 authorize(principal,connection.org_id,connection.owner_subject,connection.sharing);
 const age=now-Date.parse(connection.checked_at);
 assert(connection.state==='ready'&&connection.capabilities.send&&connection.capabilities.read_replies&&age>=0&&age<=86400000,'CONNECTION_CHECK_REQUIRED');
 return {org_id:connection.org_id,email:connection.email,credential_ref:connection.credential_ref};
}
function campaignPatch(connection,principal,now){
 const b=binding(connection,principal,now);
 return {sender_connection:{connection_id:connection.connection_id,version:connection.version,provider:connection.provider,subject:principal.subject},
  email_dispatch:{enabled:false,credential_ref:b.credential_ref,sender_email:b.email,...connection.limits}};
}
module.exports={create,checked,transition,binding,campaignPatch};
