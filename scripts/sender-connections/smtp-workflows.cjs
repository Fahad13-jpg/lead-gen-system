'use strict';
// Provision existing SMTP templates. Never activates dispatch or reply polling.
const assert=require('node:assert/strict'),{workflows}=require('./package.cjs');
function build(connection,postgres){
 assert(Number.isSafeInteger(connection.org_id)&&connection.org_id>0&&/^smtp_[a-f0-9]{32}$/.test(connection.connection_id));
 for(const ref of [connection.credential_ref,connection.inbox_credential_ref,postgres?.id])assert(/^[A-Za-z0-9_-]{1,120}$/.test(ref||''),'CREDENTIAL_BINDING_REQUIRED');
 return workflows().map(source=>{const w=structuredClone(source);delete w.id;const node=w.nodes.find(n=>n.type==='CUSTOM.managedSender'),operation=node.parameters.operation;
  w.name=`SMTP ${operation} - org ${connection.org_id} - ${connection.connection_id}`;w.active=false;
  node.parameters.binding=JSON.stringify({org_id:connection.org_id,connection_id:connection.connection_id});node.parameters.release='null';
  node.credentials={postgres:{...postgres},smtp:{id:connection.credential_ref,name:'Managed SMTP sender'},imap:{id:connection.inbox_credential_ref,name:'Managed SMTP inbox'}};
  // Successful/error executions must not retain credential-bearing provider data.
  w.settings={...w.settings,saveManualExecutions:false,saveDataSuccessExecution:'none',saveDataErrorExecution:'none'};
  w.nodes.push({id:'customer-enrollment-note',name:'Customer enrollment boundary',type:'n8n-nodes-base.stickyNote',typeVersion:1,position:[650,40],parameters:{width:560,height:180,content:'Customer-enrolled SMTP account. Original template notes are retained. Only the connection-check schedule is enabled automatically after binding/project/runtime verification. Sending and reply polling require their separate reviewed release. The registry and version checks remain authoritative.'}});return w;
 });
}
const payload=w=>({name:w.name,nodes:w.nodes,connections:w.connections,settings:w.settings});
function equivalent(actual,expected){
 const a=structuredClone(payload(actual)),b=structuredClone(payload(expected));
 for(const w of [a,b])for(const n of w.nodes){for(const c of Object.values(n.credentials||{}))delete c.name;
  // A previously reviewed send release may be present. Provisioning never edits it.
  if(n.type==='CUSTOM.managedSender'&&n.parameters.operation==='send')n.parameters.release='null';}
 assert.deepEqual(a,b,'WORKFLOW_CHANGED_REVIEW_REQUIRED');
}
async function provision(connection,ports){
 assert(['pending_check','ready','reconnect_required','degraded'].includes(connection.state),'CONNECTION_NOT_ENABLED');
 assert(await ports.runtimeReady(),'SMTP_RUNTIME_REVIEW_REQUIRED');
 const base=await ports.request('GET','/workflows/managedSmtpcheck');
 const postgres=base.nodes.find(n=>n.type==='CUSTOM.managedSender'&&n.parameters.operation==='check')?.credentials?.postgres;
 const expected=build(connection,postgres),installed=[];
 for(const candidate of expected){
  const operation=candidate.nodes.find(n=>n.type==='CUSTOM.managedSender').parameters.operation;
  let journal=await ports.readJournal(operation);let current;
  const find=async()=>{const list=await ports.request('GET','/workflows?name='+encodeURIComponent(candidate.name)+'&limit=100');assert(Array.isArray(list.data)&&!list.nextCursor,'WORKFLOW_LOOKUP_TRUNCATED_REVIEW_REQUIRED');const matches=list.data.filter(w=>w.name===candidate.name);assert(matches.length<=1,'DUPLICATE_WORKFLOW_REVIEW_REQUIRED');return matches[0]?ports.request('GET','/workflows/'+encodeURIComponent(matches[0].id)):null;};
  current=await find();
  if(!current){
   assert(!journal||journal.phase==='auth_rejected','WORKFLOW_CREATE_UNCONFIRMED_DO_NOT_RETRY');
   await ports.writeJournal(operation,{phase:'creating',name:candidate.name});
   try{await ports.request('POST','/workflows',payload(candidate));}
   catch(e){if([401,403].includes(e.status))await ports.writeJournal(operation,{phase:'auth_rejected',name:candidate.name});}
   current=await find();assert(current,'WORKFLOW_CREATE_UNCONFIRMED_DO_NOT_RETRY');
   assert.equal(current.active,false,'NEW_WORKFLOW_MUST_BE_INACTIVE');
  }
  equivalent(current,candidate);assert.equal(await ports.projectFor(current.id),connection.project_id,'CREDENTIAL_PROJECT_MISMATCH');
  journal={phase:'created',id:current.id,name:current.name};await ports.writeJournal(operation,journal);installed.push({...journal,operation,active:current.active});
 }
 // Only pending accounts need a provider check. Ready accounts stay idle.
 const check=installed.find(w=>w.operation==='check');
 if(connection.state==='pending_check'&&!check.active){
  const old=await ports.readJournal('check_activation');assert(!old||old.phase==='auth_rejected','CHECK_ACTIVATION_UNCONFIRMED_DO_NOT_RETRY');
  await ports.writeJournal('check_activation',{phase:'activating',id:check.id});
  try{await ports.request('POST','/workflows/'+encodeURIComponent(check.id)+'/activate');}
  catch(e){if([401,403].includes(e.status))await ports.writeJournal('check_activation',{phase:'auth_rejected',id:check.id});}
  const current=await ports.request('GET','/workflows/'+encodeURIComponent(check.id));assert.equal(current.active,true,'CHECK_ACTIVATION_UNCONFIRMED_DO_NOT_RETRY');
  equivalent(current,expected.find(w=>w.nodes.some(n=>n.type==='CUSTOM.managedSender'&&n.parameters.operation==='check')));
  await ports.writeJournal('check_activation',{phase:'active',id:check.id});
 }
 return{workflow_setup:'configured',connection_check_scheduled:connection.state==='pending_check',sending_activated:false};
}
module.exports={build,equivalent,provision,payload};
