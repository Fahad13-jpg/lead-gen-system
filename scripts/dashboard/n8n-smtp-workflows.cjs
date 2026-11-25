'use strict';
// Local n8n API adapter. Raw mailbox credentials never enter this module.
const fs=require('node:fs/promises'),syncFs=require('node:fs'),path=require('node:path');
const{provision}=require('../sender-connections/smtp-workflows.cjs');
const q=v=>"'"+String(v).replace(/'/g,"''")+"'";
async function lookup(read,p){
  if(!Number.isSafeInteger(p.org_id)||p.org_id<1||!/^smtp_[a-f0-9]{32}$/.test(p.connection_id||'')||!/^[a-f0-9]{64}$/.test(p.subject||''))return null;
  const sql=`SELECT s.org_id,s.connection_id,s.credential_ref,s.inbox_credential_ref,s.state,
   (SELECT sc."projectId" FROM shared_credentials sc JOIN shared_credentials ic ON ic."projectId"=sc."projectId" AND ic."credentialsId"=s.inbox_credential_ref JOIN shared_workflow w ON w."projectId"=sc."projectId" AND w."workflowId"='managedSmtpcheck' WHERE sc."credentialsId"=s.credential_ref LIMIT 1) AS project_id
   FROM sender_connections s JOIN organizations o ON o.id=s.org_id AND o.status='active'
   JOIN org_sender_memberships m ON m.org_id=s.org_id AND m.subject=${q(p.subject)} AND m.active
   JOIN credentials_entity smtp ON smtp.id=s.credential_ref AND smtp.type='smtp'
   JOIN credentials_entity imap ON imap.id=s.inbox_credential_ref AND imap.type='imap'
   WHERE s.org_id=${p.org_id} AND s.connection_id=${q(p.connection_id)} AND s.provider='smtp'
   AND (s.owner_subject=m.subject OR m.role IN ('owner','admin'))`;
  return(await read(sql)).rows[0]||null;
}
function createProvisioner({read}){
 const flights=new Map(),root=path.resolve(__dirname,'../..');
 const runtimeReady=()=>require('./n8n-runtime-check.cjs').matches('smtp');
 async function run(p,connection){
  if(!connection.project_id||['disabled','disconnected'].includes(connection.state))throw Error('SMTP_PROVISIONING_UNAVAILABLE');
  const keyPath=['.local/n8n-api-key','.local/n8n-api-key.txt'].map(x=>path.join(root,x)).find(x=>syncFs.existsSync(x));if(!keyPath)throw Error('N8N_API_SETUP_REQUIRED');
  const key=(await fs.readFile(keyPath,'utf8')).trim();if(!key||/[\r\n]/.test(key))throw Error('N8N_API_SETUP_REQUIRED');
  const directory=path.join(root,'.local/smtp-provisioning',`${p.org_id}_${p.connection_id}`);await fs.mkdir(directory,{recursive:true});
  const request=async(method,url,body)=>{
   const r=await fetch(require('./runtime-config.cjs').internalOrigin()+'/api/v1'+url,{method,redirect:'error',headers:{'X-N8N-API-KEY':key,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
   if(![200,201].includes(r.status))throw Object.assign(Error('N8N_WORKFLOW_REQUEST_FAILED'),{status:r.status});return r.json();
  };
  return provision(connection,{request,runtimeReady,projectFor:async id=>{if(!/^[A-Za-z0-9_-]{1,100}$/.test(id||''))throw Error('INVALID_WORKFLOW_ID');return(await read(`SELECT "projectId" FROM shared_workflow WHERE "workflowId"=${q(id)} LIMIT 1`)).rows[0]?.projectId;},
   readJournal:async operation=>{try{return JSON.parse(await fs.readFile(path.join(directory,operation+'.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}},
   writeJournal:async(operation,value)=>{const target=path.join(directory,operation+'.json');await fs.writeFile(target+'.tmp',JSON.stringify(value));await fs.rename(target+'.tmp',target);}
  });
 }
 return async p=>{
  const connection=await lookup(read,p);if(!connection)return{workflow_setup:'not_applicable'};
  const key=`${p.org_id}:${p.connection_id}`;if(flights.has(key))return flights.get(key);
  const task=run(p,connection);flights.set(key,task);try{return await task;}finally{flights.delete(key);}
 };
}
module.exports={createProvisioner,lookup};
