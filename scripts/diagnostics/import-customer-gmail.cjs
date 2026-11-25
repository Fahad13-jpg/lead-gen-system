'use strict';
// Import only a reviewed, hash-checked closed installation. Never activates or executes it.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const q=v=>"'"+String(v).replace(/'/g,"''")+"'";
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:90000,maxBuffer:2000000});assert.equal(r.status,0,'IMPORT_COMMAND_UNCONFIRMED');return r.stdout.trim();}
const sql=q=>JSON.parse(docker(['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],q));
function main(){
 const dir=path.resolve(process.argv[2]||'');assert(dir.startsWith(path.resolve('.local')+path.sep),'LOCAL_BUNDLE_REQUIRED');
 const m=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'))),workflows=['email','reply'].map(key=>JSON.parse(fs.readFileSync(path.join(dir,key+'.json'))));
 assert.equal(m.kind,'gmail_closed_installation');assert.equal(m.execution_authorized,false);assert.equal(m.bounded_release_required,true);assert(Number.isSafeInteger(m.org_id)&&m.org_id>0);assert(/^[A-Za-z0-9_-]{1,36}$/.test(m.project_id));
 assert.deepEqual(workflows.map(w=>crypto.createHash('sha256').update(JSON.stringify(w)).digest('hex')),m.hashes);
 assert.deepEqual(workflows.map(w=>w.id),m.workflow_ids);assert(m.workflow_ids.every(id=>/^gmail(Send|Reply)_[a-f0-9]{16}$/.test(id)));
 assert(workflows.every(w=>w.active===false));
 assert(workflows[0].nodes.find(n=>n.name==='Daily limit check').parameters.jsCode.includes('const binding=null;'));
 assert(workflows[0].nodes.find(n=>n.name==='Send Email - Gmail').parameters.url.includes('EMAIL_TRANSPORT_NOT_ENABLED'));
 assert(workflows[1].nodes.find(n=>n.name==='Bound Mailbox Gate').parameters.jsCode.trim().endsWith('return null;'));
 const ids=m.workflow_ids.map(q).join(',');
 assert.equal(sql(`SELECT count(*)::integer FROM workflow_entity WHERE id IN (${ids})`),0,'ALREADY_IMPORTED_REQUIRES_REVIEW');
 assert.equal(sql(`SELECT count(*)::integer FROM sender_connections WHERE org_id=${m.org_id} AND connection_id=${q(m.connection_id)} AND version=${m.connection_version} AND state='ready' AND send_capable AND reply_capable AND checked_at BETWEEN now()-interval '24 hours' AND now()`),1,'SENDER_CHANGED');
 const snapshot=()=>sql(`SELECT json_build_object('activities',(SELECT count(*) FROM outreach_activities),'workflows',(SELECT md5(jsonb_agg(jsonb_build_object('id',id,'active',active,'nodes',nodes,'connections',connections) ORDER BY id)::text) FROM workflow_entity WHERE id NOT IN (${ids})))`);
 const before=snapshot(),progress={imported:[]};fs.writeFileSync(path.join(dir,'before.json'),JSON.stringify(before));
 for(const [i,key]of ['email','reply'].entries()){
  docker(['cp',path.join(dir,key+'.json'),'n8n:/tmp/customer-gmail-'+key+'.json']);
  docker(['exec','n8n','n8n','import:workflow','--input=/tmp/customer-gmail-'+key+'.json','--projectId='+m.project_id]);
  progress.imported.push(m.workflow_ids[i]);fs.writeFileSync(path.join(dir,'import-progress.json'),JSON.stringify(progress));
 }
 assert.equal(sql(`SELECT count(*)::integer FROM workflow_entity WHERE id IN (${ids}) AND NOT active`),2,'INACTIVE_STATE_UNCONFIRMED');assert.deepEqual(snapshot(),before,'UNRELATED_STATE_CHANGED');
 const result={imported:2,active:false,transport_closed:true,reply_gate_closed:true,other_workflows_unchanged:true,activities_unchanged:true,emails_sent:0,imported_at:new Date().toISOString()};
 fs.writeFileSync(path.join(dir,'import-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
try{main();}catch{console.error('CUSTOMER_GMAIL_IMPORT_UNCONFIRMED; inspect local progress before retry');process.exitCode=1;}
