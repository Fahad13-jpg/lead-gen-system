'use strict';
// Prepare independent, inactive credential-bound copies; never imports or sends.
const assert=require('node:assert/strict');
const connections=require('./connections.cjs');
const rollout=require('../lead-strategy/v2/email-rollout.cjs');
function build(email,reply,connection,principal,release,now=Date.now()){
 assert.equal(connection.provider,'gmail','SMTP_EXECUTOR_NOT_INTEGRATED');
 const binding=connections.binding(connection,principal,now);
 assert.deepEqual(release.binding,binding,'RELEASE_SENDER_MISMATCH');
 // Preserve the existing bounded canary and approved limits, rather than creating a new release mechanism.
 assert(connection.limits.daily_limit<=10&&connection.limits.mailbox_rolling_limit<=10&&connection.limits.min_interval_seconds>=300,'CANARY_LIMITS_REQUIRED');
 const e=structuredClone(email),r=structuredClone(reply);
 const old=new Set([e,r].flatMap(w=>w.nodes.filter(n=>n.credentials?.gmailOAuth2).map(n=>n.credentials.gmailOAuth2.id)));
 assert.equal(old.size,1,'MIXED_SOURCE_CREDENTIALS');
 const previous=[...old][0];assert(/^[A-Za-z0-9_-]+$/.test(previous));
 for(const w of [e,r]){
  for(const n of w.nodes){
   if(n.credentials?.gmailOAuth2)n.credentials.gmailOAuth2={id:binding.credential_ref,name:'Managed sender '+connection.connection_id};
   // Existing identity checks embed the fixed reference as a JSON string literal.
   if(typeof n.parameters?.jsCode==='string')n.parameters.jsCode=n.parameters.jsCode.split(JSON.stringify(previous)).join(JSON.stringify(binding.credential_ref));
  }
 }
 const out=rollout.build(e,r,release,now);
 for(const [kind,w] of [['email',out.email],['reply',out.reply]]){
  // No original workflow ID may survive and accidentally replace org1 on import.
  delete w.id;delete w.versionId;delete w.activeVersionId;delete w.shared;delete w.pinData;
  delete w.staticData;delete w.createdAt;delete w.updatedAt;
  w.name=`${kind} - org ${connection.org_id} - ${connection.connection_id}`;w.active=false;
 }
 out.manifest.connection_id=connection.connection_id;out.manifest.connection_version=connection.version;
 out.manifest.requires_live_connection_recheck=true;
 // Parent hashes were computed before removing IDs/renaming.
 out.manifest.hashes=[out.email,out.reply].map(w=>require('node:crypto').createHash('sha256').update(JSON.stringify(w)).digest('hex'));
 return out;
}
// Credential-bound installation before a campaign/recipient release is approved.
// Preserve the original closed transport and mailbox gates even if activated by mistake.
function prepare(email,reply,connection,principal,now=Date.now()){
 assert.equal(connection.provider,'gmail','SMTP_EXECUTOR_NOT_INTEGRATED');
 const binding=connections.binding(connection,principal,now);
 const e=structuredClone(email),r=structuredClone(reply);
 assert(e.nodes.find(n=>n.name==='Daily limit check')?.parameters.jsCode.includes('const binding=null;'),'CLOSED_GATE_REQUIRED');
 assert(e.nodes.find(n=>n.name==='Send Email - Gmail')?.parameters.url.includes('EMAIL_TRANSPORT_NOT_ENABLED'),'CLOSED_TRANSPORT_REQUIRED');
 assert.equal(r.nodes.find(n=>n.name==='Bound Mailbox Gate')?.parameters.jsCode.trim().split('\n').at(-1),'return null;','CLOSED_MAILBOX_REQUIRED');
 const old=new Set([e,r].flatMap(w=>w.nodes.filter(n=>n.credentials?.gmailOAuth2).map(n=>n.credentials.gmailOAuth2.id)));assert.equal(old.size,1,'MIXED_SOURCE_CREDENTIALS');
 const previous=[...old][0];
 for(const [kind,w]of [['email',e],['reply',r]]){
  for(const n of w.nodes){if(n.credentials?.gmailOAuth2)n.credentials.gmailOAuth2={id:binding.credential_ref,name:'Managed sender '+connection.connection_id};
   if(typeof n.parameters?.jsCode==='string')n.parameters.jsCode=n.parameters.jsCode.split(JSON.stringify(previous)).join(JSON.stringify(binding.credential_ref));}
  for(const field of ['id','versionId','activeVersionId','shared','pinData','staticData','createdAt','updatedAt'])delete w[field];
  w.name=`${kind} - org ${connection.org_id} - ${connection.connection_id}`;w.active=false;
  w.settings={...w.settings,saveDataErrorExecution:'none',saveDataSuccessExecution:'none',saveManualExecutions:false};
 }
 const query=e.nodes.find(n=>n.name==='Get Email-Ready Leads').parameters;
 assert(query.query.includes("WHERE p.body->>'version'"));query.query=query.query.replace("WHERE p.body->>'version'",`WHERE p.org_id=${binding.org_id} AND p.body->>'version'`);
 const read=r.nodes.find(n=>n.name==='Get Recent Outreach Emails').parameters;
 assert(read.query.includes("AND a.channel='email'"));read.query=read.query.replace("AND a.channel='email'",`AND a.org_id=${binding.org_id} AND a.channel='email'`);
 return{email:e,reply:r,manifest:{kind:'gmail_closed_installation',org_id:connection.org_id,connection_id:connection.connection_id,connection_version:connection.version,active:false,execution_authorized:false,bounded_release_required:true,requires_current_connection_check:true,hashes:[e,r].map(w=>require('node:crypto').createHash('sha256').update(JSON.stringify(w)).digest('hex'))}};
}
module.exports={build,prepare};
