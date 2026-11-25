'use strict';
const fs=require('node:fs/promises'),sync=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const controller=require('../sender-connections/email-batch-release.cjs'),builder=require('../sender-connections/campaign-slice-workflows.cjs'),policy=require('../sender-connections/campaign-slice.cjs'),operator=require('../sender-connections/email-batch-operator.cjs');
const q=v=>"'"+String(v).replace(/'/g,"''")+"'";
function create({pool,execute,request=operator.client()}){return async(slice,claim)=>{
 policy.validate(slice);assert.equal(slice.authority.revision,claim.revision);assert.equal(slice.authority.scope_hash,claim.scope_hash);assert(/^[a-f0-9]{64}$/.test(claim.actor_subject));
 const proof=async()=>{const payload={org_id:slice.binding.org_id,plan_id:slice.plan.plan_id,step:slice.target_step,content_hash:slice.plan.content_hash,to_email:slice.plan.recipient,sender_email:slice.binding.email,credential_ref:slice.binding.credential_ref,authority:policy.authority(slice)};const r=(await execute(`SELECT email_campaign_dispatch_gate(${q(JSON.stringify(payload))}::jsonb) AS result`)).rows[0]?.result;assert.equal(r?.allowed,true,'CAMPAIGN_AUTHORITY_NOT_CURRENT');};
 await proof();
 const row=(await pool.query(`SELECT s.*,m.subject,m.role,(SELECT sc."projectId" FROM shared_credentials sc JOIN shared_workflow w ON w."projectId"=sc."projectId" AND w."workflowId"='managedSmtpcheck' JOIN credentials_entity c ON c.id=sc."credentialsId" AND c.type=CASE WHEN s.provider='gmail' THEN 'gmailOAuth2' ELSE 'smtp' END WHERE sc."credentialsId"=s.credential_ref LIMIT 1) AS project_id FROM sender_connections s JOIN organizations o ON o.id=s.org_id AND o.status='active' JOIN org_sender_memberships m ON m.org_id=s.org_id AND m.subject=${q(claim.actor_subject)} AND m.active AND m.role IN ('owner','admin') WHERE s.org_id=${slice.binding.org_id} AND s.credential_ref=${q(slice.binding.credential_ref)} AND s.email=${q(slice.binding.email)} AND (s.sharing='team' OR s.owner_subject=m.subject)`)).rows[0];assert(row?.project_id,'CREDENTIAL_PROJECT_REQUIRED');
 const connection={...row,limits:{daily_limit:row.daily_limit,mailbox_rolling_limit:row.mailbox_rolling_limit,min_interval_seconds:row.min_interval_seconds},capabilities:{send:row.send_capable,read_replies:row.reply_capable}},principal={org_id:row.org_id,subject:row.subject,role:row.role,active:true};
 const root=path.resolve(__dirname,'../..'),email=JSON.parse(await fs.readFile(path.join(root,'workflows/07a_email_outreach_executor.json'),'utf8')),reply=JSON.parse(await fs.readFile(path.join(root,'workflows/09_reply_detection.json'),'utf8'));let postgres;
 if(row.provider==='smtp'){
  assert(await require('./n8n-runtime-check.cjs').matches('campaign'),'CAMPAIGN_SMTP_RUNTIME_NOT_INSTALLED');
  const base=await request('GET','/workflows/managedSmtpcheck');postgres=base.nodes.find(n=>n.type==='CUSTOM.managedSender'&&n.parameters.operation==='check')?.credentials?.postgres;assert(postgres?.id);
  assert((await pool.query(`SELECT 1 FROM shared_credentials sc JOIN credentials_entity c ON c.id=sc."credentialsId" AND c.type='imap' WHERE sc."credentialsId"=${q(row.inbox_credential_ref)} AND sc."projectId"=${q(row.project_id)}`)).rows[0],'INBOX_PROJECT_MISMATCH');
 }
 for(const id of row.provider==='smtp'?[postgres.id]:[...new Set([email,reply].flatMap(w=>w.nodes.filter(n=>n.credentials?.postgres).map(n=>n.credentials.postgres.id)))])assert((await pool.query(`SELECT 1 FROM shared_credentials sc JOIN credentials_entity c ON c.id=sc."credentialsId" AND c.type='postgres' WHERE sc."credentialsId"=${q(id)} AND sc."projectId"=${q(row.project_id)}`)).rows[0],'DATABASE_PROJECT_MISMATCH');
 const bundle=builder.build({slice,connection,principal,project_id:row.project_id,postgres,email,reply});const directory=path.join(root,'.local/campaign-slices',slice.authority.slice_id);await fs.mkdir(directory,{recursive:true});const file=path.join(directory,'operator.lock');let lock;
 try{lock=await fs.open(file,'wx');}catch{throw Error('CAMPAIGN_INSTALLER_BUSY');}
 try{
  const stored=path.join(directory,'bundle.json');if(sync.existsSync(stored))assert.deepEqual(JSON.parse(await fs.readFile(stored,'utf8')),bundle,'CAMPAIGN_BUNDLE_CHANGED');else await fs.writeFile(stored,JSON.stringify(bundle,null,2),{flag:'wx'});
  const ports={request,authorize:proof,revalidate:proof,projectFor:async id=>{assert(/^[A-Za-z0-9_-]{1,100}$/.test(id));return(await pool.query(`SELECT "projectId" FROM shared_workflow WHERE "workflowId"=${q(id)} LIMIT 1`)).rows[0]?.projectId;},readJournal:async operation=>{assert(/^(send|reply)_(install|start|pause)$/.test(operation));try{return JSON.parse(await fs.readFile(path.join(directory,operation+'.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}},writeJournal:async(operation,value)=>{assert(/^(send|reply)_(install|start|pause)$/.test(operation));const target=path.join(directory,operation+'.json');await fs.writeFile(target+'.tmp',JSON.stringify(value));await fs.rename(target+'.tmp',target);}};
  // Skip installation only after both exact workflow definitions/projects match.
  const current=await controller.status(bundle,ports);if(!current.installed)await controller.install(bundle,ports);
  await controller.start(bundle,ports);return{confirmed:true,slice_id:slice.authority.slice_id};
 }finally{await lock.close();await fs.unlink(file);}
};}
module.exports={create};
