'use strict';
// Explicit operator CLI. Merely importing this file performs no action.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const controller=require('./email-batch-release.cjs'),{loader}=require('../dashboard/email-preflight.cjs');
const q=v=>"'"+String(v).replace(/'/g,"''")+"'";
function localDirectory(value,{fresh=false}={}){
 const root=fs.realpathSync('.local'),target=path.resolve(value);assert(target.startsWith(root+path.sep),'LOCAL_OUTPUT_REQUIRED');
 if(fresh){assert(!fs.existsSync(target),'NEW_OUTPUT_DIRECTORY_REQUIRED');const parent=fs.realpathSync(path.dirname(target));assert(parent===root||parent.startsWith(root+path.sep),'LOCAL_PARENT_REQUIRED');}
 else assert(fs.realpathSync(target).startsWith(root+path.sep),'LOCAL_OUTPUT_REQUIRED');return target;
}
function client(){let key;return async(method,url,body)=>{
 if(!key){const file=['.local/n8n-api-key','.local/n8n-api-key.txt'].find(f=>fs.existsSync(f));assert(file,'LOCAL_API_KEY_REQUIRED');key=fs.readFileSync(file,'utf8').trim();assert(key&&!/[\r\n]/.test(key),'LOCAL_API_KEY_REQUIRED');}
 assert(['GET','POST'].includes(method)&&/^\/workflows(?:\?|\/|$)/.test(url),'FIXED_LOCAL_API_REQUIRED');
 const r=await fetch(require('../dashboard/runtime-config.cjs').internalOrigin()+'/api/v1'+url,{method,redirect:'error',headers:{'X-N8N-API-KEY':key,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
 if(![200,201].includes(r.status))throw Object.assign(Error('LOCAL_API_UNCONFIRMED'),{status:r.status});return r.json();
};}
async function principal(pool,org,subject){
 assert(Number.isSafeInteger(org)&&org>0&&org<=2147483647&&/^[a-f0-9]{64}$/.test(subject||''),'OPERATOR_IDENTITY_REQUIRED');
 const r=(await pool.query(`SELECT m.org_id,m.subject,m.role,m.active FROM org_sender_memberships m JOIN organizations o ON o.id=m.org_id AND o.status='active' WHERE m.org_id=${org} AND m.subject=${q(subject)} AND m.active AND m.role IN ('owner','admin')`)).rows[0];assert(r,'OPERATOR_MEMBERSHIP_REQUIRED');return r;
}
async function buildFromLive(packet,subject,pool,request){
 assert(Number.isSafeInteger(packet?.org_id)&&/^[1-9][0-9]*$/.test(String(packet.campaign_id))&&Number.isSafeInteger(Number(packet.campaign_id))&&Array.isArray(packet.plans),'REVIEW_PACKET_REQUIRED');
 const actor=await principal(pool,packet.org_id,subject),snapshot=await loader(pool)(packet.org_id,Number(packet.campaign_id),packet.plans.map(p=>p.plan_id),packet.kind==='email_followup_batch_review_v1'?2:1);assert(snapshot?.sender,'BATCH_PREFLIGHT_BLOCKED');
 const sender=snapshot.sender;
 const project=(await pool.query(`SELECT sc."projectId" AS id FROM shared_credentials sc JOIN credentials_entity c ON c.id=sc."credentialsId" AND c.type=${q(sender.provider==='gmail'?'gmailOAuth2':'smtp')} JOIN shared_workflow w ON w."projectId"=sc."projectId" AND w."workflowId"='managedSmtpcheck' WHERE sc."credentialsId"=${q(sender.credential_ref)} LIMIT 1`)).rows[0]?.id;assert(project,'CREDENTIAL_PROJECT_REQUIRED');
 const email=JSON.parse(fs.readFileSync('workflows/07a_email_outreach_executor.json','utf8')),reply=JSON.parse(fs.readFileSync('workflows/09_reply_detection.json','utf8'));
 let postgres;
 if(sender.provider==='smtp'){const base=await request('GET','/workflows/managedSmtpcheck');postgres=base.nodes.find(n=>n.type==='CUSTOM.managedSender'&&n.parameters.operation==='check')?.credentials?.postgres;assert(postgres?.id,'POSTGRES_BINDING_REQUIRED');
  const inbox=(await pool.query(`SELECT 1 AS ok FROM shared_credentials sc JOIN credentials_entity c ON c.id=sc."credentialsId" AND c.type='imap' WHERE sc."credentialsId"=${q(sender.inbox_credential_ref)} AND sc."projectId"=${q(project)}`)).rows[0];assert(inbox,'CREDENTIAL_PROJECT_REQUIRED');
 }
 const dbRefs=sender.provider==='smtp'?[postgres.id]:[...new Set([email,reply].flatMap(w=>w.nodes.filter(n=>n.credentials?.postgres).map(n=>n.credentials.postgres.id)))];assert(dbRefs.length,'POSTGRES_BINDING_REQUIRED');
 for(const ref of dbRefs){const db=(await pool.query(`SELECT 1 AS ok FROM shared_credentials sc JOIN credentials_entity c ON c.id=sc."credentialsId" AND c.type='postgres' WHERE sc."credentialsId"=${q(ref)} AND sc."projectId"=${q(project)}`)).rows[0];assert(db,'CREDENTIAL_PROJECT_REQUIRED');}
 // The same installed SMTP helper fingerprints used by customer provisioning.
 if(sender.provider==='smtp'){
  const cp=require('node:child_process'),crypto=require('node:crypto'),files={'ManagedSender.node.js':'scripts/sender-connections/n8n/ManagedSender.node.js','lead-system/scripts/sender-connections/worker.cjs':'scripts/sender-connections/worker.cjs','lead-system/scripts/sender-connections/clients.cjs':'scripts/sender-connections/clients.cjs','lead-system/scripts/sender-connections/smtp-check.cjs':'scripts/sender-connections/smtp-check.cjs'};
  const script=`const fs=require('fs'),crypto=require('crypto');console.log(JSON.stringify(Object.fromEntries(${JSON.stringify(Object.keys(files))}.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync('/home/node/.n8n/custom/'+p)).digest('hex')]))));`;
  const r=cp.spawnSync('docker',['exec','n8n','node','-e',script],{encoding:'utf8',timeout:30000,windowsHide:true,maxBuffer:4096});assert.equal(r.status,0,'SMTP_RUNTIME_REVIEW_REQUIRED');const remote=JSON.parse(r.stdout);for(const[p,f]of Object.entries(files))assert.equal(remote[p],crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),'SMTP_RUNTIME_REVIEW_REQUIRED');
 }
 return controller.prepare({packet,snapshot,principal:actor,project_id:project,postgres,email,reply});
}
async function main(args=process.argv.slice(2)){
 if(args.length===0||args[0]==='--help'){console.log('prepare <review-packet.json> <new-.local-directory> --subject=<membership-subject>\ninstall <bundle-directory> --subject=<membership-subject> --ack=<bundle-digest>\nstart <bundle-directory> --subject=<membership-subject> --ack=<bundle-digest> --authorize-sending\npause <bundle-directory> --subject=<membership-subject> --ack=<bundle-digest>\nauthorize-dashboard <bundle-directory> --subject=<membership-subject> --ack=<bundle-digest> --authorize-sending\nPrepare writes local artifacts only. Install creates inactive copies. Start can send real emails; never run without explicit recipient/content authorization. Pause retains reply monitoring.');return;}
 const[mode,source,...rest]=args;assert(['prepare','install','start','pause','authorize-dashboard'].includes(mode),'FIXED_OPERATION_REQUIRED');
 const subject=rest.find(v=>v.startsWith('--subject='))?.slice(10),ack=rest.find(v=>v.startsWith('--ack='))?.slice(6);assert(/^[a-f0-9]{64}$/.test(subject||''),'OPERATOR_IDENTITY_REQUIRED');
 const{localPool}=require('../dashboard/start-local-auth.cjs'),pool=localPool(),request=client();let lock,directory;
 try{
  if(mode==='prepare'){
   directory=localDirectory(rest[0],{fresh:true});const packet=JSON.parse(fs.readFileSync(source,'utf8')),bundle=await buildFromLive(packet,subject,pool,request);fs.mkdirSync(directory);fs.writeFileSync(path.join(directory,'bundle.json'),JSON.stringify(bundle,null,2),{flag:'wx'});
   for(const kind of ['send','reply'])fs.writeFileSync(path.join(directory,kind+'.json'),JSON.stringify(bundle.workflows[kind],null,2),{flag:'wx'});
   console.log(JSON.stringify({prepared:true,batch_id:bundle.batch_id,digest:bundle.digest,workflows_active:false,provider_requests:0}));return;
  }
  directory=localDirectory(source);const bundle=JSON.parse(fs.readFileSync(path.join(directory,'bundle.json'),'utf8'));assert(ack===bundle.digest,'EXACT_BUNDLE_ACKNOWLEDGEMENT_REQUIRED');controller.verify(bundle,Date.now(),mode==='pause');
  if(['start','authorize-dashboard'].includes(mode))assert(rest.includes('--authorize-sending'),'EXPLICIT_SENDING_AUTHORIZATION_REQUIRED');
  const lockFile=path.join(directory,'operator.lock');lock=fs.openSync(lockFile,'wx');
  const ports={request,authorize:()=>principal(pool,bundle.packet.org_id,subject),revalidate:async b=>{const fresh=await buildFromLive(b.packet,subject,pool,request);assert.equal(fresh.digest,b.digest,'BATCH_CHANGED_REVIEW_REQUIRED');},projectFor:async id=>{assert(/^[A-Za-z0-9_-]{1,100}$/.test(id),'INVALID_WORKFLOW_ID');return(await pool.query(`SELECT "projectId" FROM shared_workflow WHERE "workflowId"=${q(id)} LIMIT 1`)).rows[0]?.projectId;},
   readJournal:async op=>{const file=path.join(directory,op+'.json');return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;},
   writeJournal:async(op,value)=>{const file=path.join(directory,op+'.json');fs.writeFileSync(file+'.tmp',JSON.stringify(value));fs.renameSync(file+'.tmp',file);}};
  if(mode==='authorize-dashboard'){await ports.authorize();await ports.revalidate(bundle);const state=await controller.status(bundle,ports);assert(state.installed&&state.sending_active===false&&state.reply_active===false,'INACTIVE_INSTALLED_PAIR_REQUIRED');await require('../dashboard/email-batch-store.cjs').register(directory,bundle,subject);console.log(JSON.stringify({delegated:true,batch_id:bundle.batch_id,digest:bundle.digest,sending_active:false}));return;}
  const result=await controller[mode](bundle,ports);fs.writeFileSync(path.join(directory,mode+'-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{if(lock!==undefined){fs.closeSync(lock);fs.unlinkSync(path.join(directory,'operator.lock'));}await pool.end();}
}
module.exports={localDirectory,client,principal,buildFromLive,main};
if(require.main===module)main().catch(()=>{console.error('EMAIL_BATCH_OPERATION_STOPPED_REVIEW_LOCAL_STATE; no automatic retry');process.exitCode=1;});
