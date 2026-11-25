'use strict';
// Adds the separate campaign namespace, then reloads custom nodes. No workflow mutations.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function docker(args,extra={}){const r=cp.spawnSync('docker',args,{timeout:60000,maxBuffer:25e6,...extra});assert.equal(r.status,0,'LOCAL_RUNTIME_DOCKER_OPERATION_FAILED');return r.stdout;}
function sql(s){return docker(['exec','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db','-c',s]).toString().trim();}
async function main(){
 assert(process.argv.includes('--install-local'),'LOCAL_INSTALL_SCOPE_REQUIRED');assert(process.env.EMAIL_CAMPAIGN_RENEWAL_ENABLED!=='true','AUTOMATION_MUST_REMAIN_OFF');
 const verifyOnly=process.argv.includes('--verify-loaded'),resume=verifyOnly||process.argv.includes('--reload-staged'),source=path.resolve('.local/campaign-runtime-20261110-v3'),manifest=JSON.parse(fs.readFileSync(path.join(source,'manifest.json'))),dir=resume?'.local/campaign-runtime-install-1794320770791':'.local/campaign-runtime-install-'+Date.now();assert.equal(manifest.namespace,'campaign-system');
 for(const item of manifest.files)assert.equal(hash(fs.readFileSync(item.file)),item.sha256,'REVIEWED_PACKAGE_CHANGED');
 const remote=()=>JSON.parse(docker(['exec','n8n','node','-e',"const fs=require('fs'),c=require('crypto');console.log(JSON.stringify({node:fs.existsSync('/home/node/.n8n/custom/ManagedCampaignSender.node.js'),namespace:fs.existsSync('/home/node/.n8n/custom/campaign-system'),legacy:c.createHash('sha256').update(fs.readFileSync('/home/node/.n8n/custom/lead-system/scripts/sender-connections/worker.cjs')).digest('hex')}));"]).toString());
 const before=resume?JSON.parse(fs.readFileSync(dir+'/before.json','utf8')).before:remote();if(resume){assert(remote().node&&remote().namespace,'STAGED_RUNTIME_MISSING');assert(fs.statSync(dir+'/custom-before.tar').size>0,'ORIGINAL_RUNTIME_BACKUP_REQUIRED');}else assert(!before.node&&!before.namespace,'CAMPAIGN_RUNTIME_ALREADY_PRESENT_DO_NOT_OVERWRITE');
 assert.equal(before.legacy,'015b7febfd874b7a90490c395796c2c5363c900d158bfb01138408ab336c5832','LEGACY_RUNTIME_CHANGED');
 const idle=()=>assert.equal(sql("SELECT count(*) FROM execution_entity WHERE status IN('running','waiting')"),'0','ACTIVE_EXECUTIONS_RELOAD_DEFERRED');if(!verifyOnly)idle();
 const saved=resume?JSON.parse(fs.readFileSync(dir+'/before.json','utf8')):null;
 const active=saved?.active||sql('SELECT md5(coalesce(string_agg(id,\',\' ORDER BY id),\'\')) FROM workflow_entity WHERE active');
 const stale=saved?saved.stale:sql("SELECT coalesce(string_agg(id::text,',' ORDER BY id),'') FROM execution_entity WHERE status='new'");
 if(!resume){fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/before.json',JSON.stringify({before,active,stale},null,2));
 fs.writeFileSync(dir+'/custom-before.tar',docker(['exec','n8n','tar','-C','/home/node/.n8n','-cf','-','custom']));
 fs.writeFileSync(dir+'/rollback.txt','Keep automation disabled. Remove only the two newly installed paths /home/node/.n8n/custom/ManagedCampaignSender.node.js and /home/node/.n8n/custom/campaign-system after checking no campaign workflow is active, then reload n8n while idle. The original custom directory is saved in custom-before.tar. Do not replace or delete lead-system.\n');
 idle();docker(['cp',path.join(source,'custom','ManagedCampaignSender.node.js'),'n8n:/home/node/.n8n/custom/ManagedCampaignSender.node.js']);docker(['cp',path.join(source,'custom','campaign-system'),'n8n:/home/node/.n8n/custom/campaign-system']);}
 const program="const fs=require('fs'),c=require('crypto');const files="+JSON.stringify(manifest.files.map(x=>({file:x.file.replaceAll('\\','/'),sha256:x.sha256})))+";for(const x of files){const p='/home/node/.n8n/custom/'+(x.file.endsWith('/ManagedCampaignSender.node.js')?'ManagedCampaignSender.node.js':'campaign-system/'+x.file);if(c.createHash('sha256').update(fs.readFileSync(p)).digest('hex')!==x.sha256)throw Error('RUNTIME_HASH_MISMATCH');}console.log('EXACT_RUNTIME_VERIFIED');";
 docker(['exec','n8n','node','-e',program]);assert.equal(remote().legacy,before.legacy);if(!verifyOnly){idle();docker(['restart','-t','30','n8n']);}
 let ready=false;for(let n=0;n<30;n++){try{const r=await fetch('http://localhost:5678/healthz/readiness',{signal:AbortSignal.timeout(2000)});if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}assert(ready,'N8N_READINESS_UNCONFIRMED');
 const loaded=JSON.parse(docker(['exec','n8n','node','-e',"const fs=require('fs');const x=JSON.parse(fs.readFileSync('/home/node/.cache/n8n/public/types/nodes.json','utf8'));console.log(JSON.stringify((Array.isArray(x)?x:Object.values(x)).some(n=>n.name==='CUSTOM.managedCampaignSender')));"]).toString());assert(loaded,'CUSTOM_NODE_LOAD_UNCONFIRMED');
 assert.equal(remote().legacy,before.legacy);assert.equal(sql('SELECT md5(coalesce(string_agg(id,\',\' ORDER BY id),\'\')) FROM workflow_entity WHERE active'),active,'WORKFLOW_ACTIVATION_CHANGED');
 const queuedAfter=sql("SELECT coalesce(string_agg(id::text,',' ORDER BY id),'') FROM execution_entity WHERE status='new'");
 // New scheduled execution records can complete/prune during this operation.
 // Never restore, cancel or rewrite them to manufacture an unchanged snapshot.
 const result={installed:true,custom_node_loaded:true,files:manifest.files.length,legacy_runtime_unchanged:true,workflow_activation_unchanged:true,queued_execution_snapshot_unchanged:queuedAfter===stale,execution_records_modified_by_installer:false,execution_history_preservation_verified:queuedAfter===stale,automation_enabled:false,provider_requests_by_installer:0,backup:dir+'/custom-before.tar',verified_at:new Date().toISOString()};fs.writeFileSync(dir+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
