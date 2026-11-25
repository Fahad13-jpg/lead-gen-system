'use strict';
// Operator boundary around the existing bounded rollout. No provider client.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const rollout=require('../lead-strategy/v2/email-rollout.cjs');
const{assess}=require('../dashboard/email-preflight.cjs');
const smtp=require('./smtp-workflows.cjs'),gmail=require('./gmail-package.cjs');
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const payload=w=>({name:w.name,nodes:w.nodes,connections:w.connections,settings:w.settings});
// n8n resolves credential display names on save. IDs and credential types remain
// authoritative; compare every other workflow field without changing the artifact.
function comparablePayload(w){
 const value=structuredClone(payload(w));
 for(const node of value.nodes||[])for(const credential of Object.values(node.credentials||{})){
  if(credential&&typeof credential==='object'&&typeof credential.id==='string'&&credential.id)delete credential.name;
 }
 return value;
}
function prepare({packet,snapshot,principal,project_id,postgres,email,reply},now=Date.now()){
 assert(['email_batch_review_v1','email_followup_batch_review_v1'].includes(packet?.kind)&&packet.execution_authorized===false,'REVIEW_PACKET_REQUIRED');
 assert.deepEqual(Object.keys(packet).sort(),['kind','org_id','campaign_id','campaign_version','sender_connection_id','sender_version','expires_at','plans','execution_authorized'].sort(),'UNSUPPORTED_PACKET_FIELD');
 assert(principal?.org_id===packet.org_id&&principal.active===true&&['owner','admin'].includes(principal.role),'OPERATOR_MEMBERSHIP_REQUIRED');
 assert(/^[a-f0-9]{64}$/.test(principal.subject||''),'OPERATOR_SUBJECT_REQUIRED');
 assert(/^[A-Za-z0-9_-]{1,100}$/.test(project_id||''),'CREDENTIAL_PROJECT_REQUIRED');
 assert(Array.isArray(packet.plans)&&packet.plans.length>0&&packet.plans.length<=10,'BOUNDED_PLANS_REQUIRED');
 const step=packet.kind==='email_followup_batch_review_v1'?2:1;
 const current=assess(snapshot,{org:packet.org_id,campaign:Number(packet.campaign_id),version:packet.campaign_version,ids:packet.plans.map(p=>p.plan_id),subject:principal.subject,step,now});
 assert(current.ready_for_operator_review,'BATCH_PREFLIGHT_BLOCKED');
 const expected=current.review_packet;
 assert(Number.isFinite(Date.parse(packet.expires_at))&&Date.parse(packet.expires_at)>now&&Date.parse(packet.expires_at)<=Date.parse(expected.expires_at),'REVIEW_PACKET_EXPIRED_OR_EXTENDED');
 assert.deepEqual(packet,{...expected,expires_at:packet.expires_at},'REVIEW_PACKET_CHANGED');
 const s=snapshot.sender,connection={...s,limits:{daily_limit:s.daily_limit,mailbox_rolling_limit:s.mailbox_rolling_limit,min_interval_seconds:s.min_interval_seconds},capabilities:{send:s.send_capable,read_replies:s.reply_capable}};
 const release={binding:{org_id:packet.org_id,email:s.email,credential_ref:s.credential_ref},expires_at:packet.expires_at,plans:structuredClone(packet.plans)};rollout.validate(release,now);
 const batch_id=hash(packet).slice(0,20);let workflows;
 if(s.provider==='gmail'){const built=gmail.build(email,reply,connection,principal,release,now);workflows={send:built.email,reply:built.reply};if(step===2){const query=workflows.send.nodes.find(n=>n.name==='Get Email-Ready Leads').parameters;assert(query.query.includes('WHERE p.org_id=')&&query.query.includes('steps.step'),'FOLLOWUP_QUERY_SCOPE_REQUIRED');query.query=query.query.replace('WHERE p.org_id=','WHERE steps.step=2 AND p.org_id=');}}
 else{assert.equal(s.provider,'smtp','EMAIL_PROVIDER_UNSUPPORTED');const built=smtp.build(connection,postgres);workflows={send:built.find(w=>w.nodes.some(n=>n.type==='CUSTOM.managedSender'&&n.parameters.operation==='send')),reply:built.find(w=>w.nodes.some(n=>n.type==='CUSTOM.managedSender'&&n.parameters.operation==='poll'))};workflows.send.nodes.find(n=>n.type==='CUSTOM.managedSender').parameters.release=JSON.stringify(release);}
 for(const[k,w]of Object.entries(workflows)){
  w.name=`Email batch ${batch_id} ${k} - org ${packet.org_id}`;w.active=false;
  for(const field of ['id','versionId','activeVersionId','shared','pinData','staticData','createdAt','updatedAt'])delete w[field];
  w.settings={...w.settings,saveDataSuccessExecution:'none',saveDataErrorExecution:'none',saveManualExecutions:false};
  w.nodes.push({id:'batch-release-boundary',name:'Batch release boundary',type:'n8n-nodes-base.stickyNote',typeVersion:1,position:[850,-520],parameters:{width:550,height:220,content:`Batch ${batch_id}. Exact plan/hash/recipient release; ${step===2?'second message only; first-step duplicate guards retained':'first messages only'}; expires ${release.expires_at}. Install inactive. Start reply monitoring before sending. Pause disables sending only; retain reply monitoring for late replies. Existing runtime approval, freshness, sender, quota, lease and suppression gates remain authoritative. Never replay uncertain provider acceptance.`}});
 }
 const bundle={format:'email_batch_release_v1',batch_id,packet:structuredClone(packet),project_id,provider:s.provider,release,workflows};return{...bundle,digest:hash(bundle)};
}
function verify(bundle,now=Date.now(),allowExpired=false){
 if(bundle?.format==='email_campaign_slice_bundle_v1')return require('./campaign-slice-workflows.cjs').verify(bundle,now,allowExpired);
 assert(bundle?.format==='email_batch_release_v1','RELEASE_BUNDLE_REQUIRED');const{digest,...data}=bundle;assert.equal(hash(data),digest,'RELEASE_BUNDLE_CHANGED');
 assert.equal(bundle.batch_id,hash(bundle.packet).slice(0,20),'BATCH_ID_CHANGED');
 assert.deepEqual(bundle.release.plans,bundle.packet.plans,'BATCH_PLANS_CHANGED');assert(['email_batch_review_v1','email_followup_batch_review_v1'].includes(bundle.packet.kind),'PACKET_KIND_REQUIRED');assert(bundle.release.plans.every(p=>p.max_step===(bundle.packet.kind==='email_followup_batch_review_v1'?2:1)),'EXACT_APPROVED_STEP_REQUIRED');
 // Expired bundles can be paused, but can never be installed or started.
 if(!allowExpired)rollout.validate(bundle.release,now);
 for(const w of Object.values(bundle.workflows)){assert.equal(w.active,false,'INACTIVE_ARTIFACT_REQUIRED');assert(!w.id,'NEW_COPY_REQUIRED');}
 return bundle;
}
async function find(bundle,kind,ports){
 const desired=bundle.workflows[kind],list=await ports.request('GET','/workflows?name='+encodeURIComponent(desired.name)+'&limit=100');
 assert(Array.isArray(list.data)&&!list.nextCursor,'WORKFLOW_LOOKUP_TRUNCATED');const matches=list.data.filter(w=>w.name===desired.name);assert(matches.length<=1,'DUPLICATE_BATCH_WORKFLOW');
 if(!matches.length)return null;const current=await ports.request('GET','/workflows/'+encodeURIComponent(matches[0].id));
 assert.deepEqual(comparablePayload(current),comparablePayload(desired),'BATCH_WORKFLOW_CHANGED');assert.equal(await ports.projectFor(current.id),bundle.project_id,'CREDENTIAL_PROJECT_MISMATCH');return current;
}
async function transition(bundle,kind,active,ports){
 let current=await find(bundle,kind,ports);assert(current,'BATCH_NOT_INSTALLED');if(current.active===active)return current;
 const operation=`${kind}_${active?'start':'pause'}`,old=await ports.readJournal(operation);
 assert(!old||old.phase==='auth_rejected','WORKFLOW_TRANSITION_UNCONFIRMED_DO_NOT_RETRY');
 await ports.writeJournal(operation,{phase:'requested',workflow_id:current.id});
 try{await ports.request('POST','/workflows/'+encodeURIComponent(current.id)+(active?'/activate':'/deactivate'));}
 catch(e){if([401,403].includes(e.status))await ports.writeJournal(operation,{phase:'auth_rejected',workflow_id:current.id});}
 current=await find(bundle,kind,ports);assert(current?.active===active,'WORKFLOW_TRANSITION_UNCONFIRMED_DO_NOT_RETRY');
 await ports.writeJournal(operation,{phase:'confirmed',workflow_id:current.id});return current;
}
async function install(bundle,ports,now=Date.now()){
 verify(bundle,now);await ports.authorize(bundle);await ports.revalidate(bundle);const installed={};
 for(const kind of ['reply','send']){
  let current=await find(bundle,kind,ports);if(!current){const op=`${kind}_install`,old=await ports.readJournal(op);assert(!old||old.phase==='auth_rejected','WORKFLOW_CREATE_UNCONFIRMED_DO_NOT_RETRY');
   await ports.revalidate(bundle);await ports.writeJournal(op,{phase:'requested'});
   try{await ports.request('POST','/workflows',payload(bundle.workflows[kind]));}catch(e){if([401,403].includes(e.status))await ports.writeJournal(op,{phase:'auth_rejected'});}
   current=await find(bundle,kind,ports);assert(current,'WORKFLOW_CREATE_UNCONFIRMED_DO_NOT_RETRY');await ports.writeJournal(op,{phase:'confirmed',workflow_id:current.id});
  }
  assert.equal(current.active,false,'INSTALL_REQUIRES_INACTIVE_PAIR');installed[kind]=current.id;
 }
 return{installed:true,batch_id:bundle.batch_id,workflows:installed,sending_active:false,reply_active:false};
}
async function start(bundle,ports,now=Date.now()){
 verify(bundle,now);await ports.authorize(bundle);await ports.revalidate(bundle);
 // Validate both graphs/projects before enabling either schedule.
 assert(await find(bundle,'send',ports),'BATCH_NOT_INSTALLED');assert(await find(bundle,'reply',ports),'BATCH_NOT_INSTALLED');
 await transition(bundle,'reply',true,ports);await ports.revalidate(bundle);
 assert((await find(bundle,'reply',ports))?.active===true,'REPLY_MONITOR_REQUIRED');
 await transition(bundle,'send',true,ports);return{batch_id:bundle.batch_id,sending_active:true,reply_active:true,provider_acceptance:'not_observed_by_controller'};
}
async function pause(bundle,ports){
 verify(bundle,Date.now(),true);await ports.authorize(bundle);await transition(bundle,'send',false,ports);
 const reply=await find(bundle,'reply',ports);return{batch_id:bundle.batch_id,sending_active:false,reply_active:reply?.active===true,in_flight_may_complete:true};
}
async function status(bundle,ports){
 verify(bundle,Date.now(),true);await ports.authorize(bundle);
 const send=await find(bundle,'send',ports),reply=await find(bundle,'reply',ports),attempt=await ports.readJournal('send_start'),replyAttempt=await ports.readJournal('reply_start'),pauseAttempt=await ports.readJournal('send_pause');
 return{batch_id:bundle.batch_id,installed:!!send&&!!reply,sending_active:send?.active??null,reply_active:reply?.active??null,restart_requires_new_release:send?.active===false&&attempt?.phase==='confirmed',start_outcome_uncertain:attempt?.phase==='requested'&&send?.active!==true||replyAttempt?.phase==='requested'&&reply?.active!==true,pause_outcome_uncertain:pauseAttempt?.phase==='requested'&&send?.active!==false};
}
module.exports={prepare,verify,install,start,pause,status,hash,payload};
