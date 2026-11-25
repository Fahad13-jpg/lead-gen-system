'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const dir='.local/whatsapp-hardening-20261106';
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:180000,maxBuffer:4e6});assert.equal(r.status,0,'WHATSAPP_PATCH_COMMAND_FAILED; private output suppressed');return r.stdout.trim();}
const sql=q=>docker(['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],q);
function snapshot(){return sql("SELECT json_build_object('workflows',(SELECT md5(jsonb_agg(jsonb_build_object('id',id,'active',active,'nodes',nodes,'connections',connections) ORDER BY id)::text) FROM workflow_entity),'activities',(SELECT md5(coalesce(jsonb_agg(to_jsonb(a) ORDER BY id)::text,'')) FROM outreach_activities a))");}
assert(!fs.existsSync(dir),'INSPECT_EXISTING_PATCH_PROGRESS');
assert.equal(sql("SELECT count(*) FROM execution_entity WHERE status IN ('new','running','waiting')"),'0','EXECUTIONS_PRESENT');
assert.equal(sql("SELECT count(*) FROM workflow_entity w WHERE id='managedWhatsappSend046' AND active=false AND EXISTS(SELECT 1 FROM jsonb_array_elements(w.nodes::jsonb) n WHERE n->>'type'='CUSTOM.managedWhatsApp' AND n->'parameters'->>'dispatchEnabled'='false')"),'1','DISPATCH_MUST_REMAIN_DISABLED');
fs.mkdirSync(dir,{recursive:true});const before=snapshot();fs.writeFileSync(dir+'/before.json',before);
docker(['cp','n8n:/home/node/.n8n/custom/lead-system/scripts/whatsapp',path.resolve(dir+'/before-whatsapp')]);
const files=['worker.cjs','executor.cjs','network.cjs'];
for(const file of files)docker(['cp','scripts/whatsapp/'+file,'n8n:/home/node/.n8n/custom/lead-system/scripts/whatsapp/'+file]);
fs.writeFileSync(dir+'/progress.json',JSON.stringify({files_copied:true,restarted:false}));
docker(['restart','--time','60','n8n']);
assert.equal(snapshot(),before,'EXISTING_STATE_CHANGED');
const hashes=JSON.parse(docker(['exec','n8n','node','-e',"const fs=require('fs'),c=require('crypto');console.log(JSON.stringify(['worker.cjs','executor.cjs','network.cjs'].map(f=>({file:f,sha:c.createHash('sha256').update(fs.readFileSync('/home/node/.n8n/custom/lead-system/scripts/whatsapp/'+f)).digest('hex')}))))"]));
for(const row of hashes)assert.equal(row.sha,crypto.createHash('sha256').update(fs.readFileSync('scripts/whatsapp/'+row.file)).digest('hex'));
fs.writeFileSync(dir+'/progress.json',JSON.stringify({files_copied:true,restarted:true,verified:true,dispatch_enabled:false,messages_sent:0},null,2));
console.log(JSON.stringify({installed:files,existing_workflows_and_activities_preserved:true,dispatch_enabled:false,messages_sent:0}));
