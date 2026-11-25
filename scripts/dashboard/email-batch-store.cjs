'use strict';
// Trusted operator registry. The browser supplies no paths or workflow bodies.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const operator=require('../sender-connections/email-batch-operator.cjs'),controller=require('../sender-connections/email-batch-release.cjs');
const indexPath=path.resolve(__dirname,'../../.local/email-batch-dashboard.json');
const q=v=>"'"+String(v).replace(/'/g,"''")+"'";
async function index(){try{const value=JSON.parse(await fs.readFile(indexPath,'utf8'));assert(Array.isArray(value)&&value.length<=100,'INVALID_OPERATOR_REGISTRY');return value;}catch(e){if(e.code==='ENOENT')return[];throw e;}}
function grantValid(g){return g&&/^[a-f0-9]{20}$/.test(g.batch_id||'')&&/^[a-f0-9]{64}$/.test(g.digest||'')&&/^[a-f0-9]{64}$/.test(g.subject||'')&&Number.isSafeInteger(g.org_id)&&g.org_id>0&&Number.isSafeInteger(g.campaign_id)&&g.campaign_id>0&&typeof g.directory==='string';}
async function load(batch){assert(/^[a-f0-9]{20}$/.test(batch),'INVALID_BATCH');const entries=(await index()).filter(g=>g.batch_id===batch);assert(entries.length<=1,'DUPLICATE_OPERATOR_BATCH');if(!entries.length)return null;const grant=entries[0];assert(grantValid(grant),'INVALID_OPERATOR_REGISTRY');const directory=operator.localDirectory(grant.directory),bundle=JSON.parse(await fs.readFile(path.join(directory,'bundle.json'),'utf8'));controller.verify(bundle,Date.now(),true);assert.equal(bundle.batch_id,grant.batch_id);assert.equal(bundle.digest,grant.digest);assert.equal(bundle.packet.org_id,grant.org_id);assert.equal(Number(bundle.packet.campaign_id),grant.campaign_id);return{grant,bundle,directory};}
function createStore({pool,request=operator.client()}){return{
 load,
 async list(org,subject,campaign){const entries=await index();assert(entries.every(grantValid),'INVALID_OPERATOR_REGISTRY');return entries.filter(g=>g.org_id===org&&g.subject===subject&&g.campaign_id===campaign).map(({batch_id,digest})=>({batch_id,digest}));},
 async lock(entry,operation){let handle;const file=path.join(entry.directory,'operator.lock');try{handle=await fs.open(file,'wx');}catch{throw Error('EMAIL_BATCH_BUSY');}try{return await operation();}finally{await handle.close();await fs.unlink(file);}},
 async ports(entry,authorize){return{request,authorize,
  revalidate:async bundle=>{await authorize();const fresh=await operator.buildFromLive(bundle.packet,entry.grant.subject,pool,request);assert.equal(fresh.digest,bundle.digest,'BATCH_CHANGED_REVIEW_REQUIRED');},
  projectFor:async id=>{assert(/^[A-Za-z0-9_-]{1,100}$/.test(id));return(await pool.query(`SELECT "projectId" FROM shared_workflow WHERE "workflowId"=${q(id)} LIMIT 1`)).rows[0]?.projectId;},
  readJournal:async op=>{assert(/^(send|reply)_(start|pause|install)$/.test(op));try{return JSON.parse(await fs.readFile(path.join(entry.directory,op+'.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}},
  writeJournal:async(op,value)=>{assert(/^(send|reply)_(start|pause|install)$/.test(op));const file=path.join(entry.directory,op+'.json');await fs.writeFile(file+'.tmp',JSON.stringify(value));await fs.rename(file+'.tmp',file);}
 };}
};}
async function register(directory,bundle,subject){
 assert(/^[a-f0-9]{64}$/.test(subject));directory=operator.localDirectory(directory);controller.verify(bundle);const lockPath=indexPath+'.lock',handle=await fs.open(lockPath,'wx');try{const entries=await index();assert(entries.every(grantValid));const next={batch_id:bundle.batch_id,digest:bundle.digest,org_id:bundle.packet.org_id,campaign_id:Number(bundle.packet.campaign_id),subject,directory};const old=entries.find(g=>g.batch_id===bundle.batch_id);if(old)assert.deepEqual(old,next,'EXISTING_DASHBOARD_GRANT_CHANGED');else entries.push(next);assert(entries.length<=100);await fs.writeFile(indexPath+'.tmp',JSON.stringify(entries,null,2));await fs.rename(indexPath+'.tmp',indexPath);}finally{await handle.close();await fs.unlink(lockPath);}
}
module.exports={createStore,register,grantValid};
