'use strict';
// User-approved local installation. No activation, campaign updates or sending.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const dir='.local/whatsapp-deployment-046-20261106',pkg='.local/whatsapp-executor-package-20261106';
const ids=['managedWhatsappCheck046','managedWhatsappSend046','managedWhatsappCallback046'];
const names=['outreach_whatsapp_gate','outreach_whatsapp_begin','outreach_whatsapp_finish','outreach_whatsapp_event','outreach_whatsapp_queue','outreach_whatsapp_ingest'];
function docker(args,input,binary=false){const r=cp.spawnSync('docker',args,{input,encoding:binary?undefined:'utf8',timeout:180000,maxBuffer:150e6});assert.equal(r.status,0,'Docker operation failed: '+args.slice(0,3).join(' ')+'; private output suppressed');return binary?r.stdout:r.stdout.trim();}
const sql=q=>docker(['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],q),json=q=>JSON.parse(sql(q));
const quote=v=>"'"+String(v).replace(/'/g,"''")+"'";
function snapshot(){return json("SELECT json_build_object('activities',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM outreach_activities t),'campaigns',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY org_id,campaign_id,version)::text,'')) FROM strategy_campaign_versions t),'plans',(SELECT count(*) FROM strategy_plans),'ai_requests',(SELECT count(*) FROM strategy_ai_requests),'workflows',(SELECT md5(coalesce(jsonb_agg(jsonb_build_object('id',id,'active',active,'nodes',nodes,'connections',connections) ORDER BY id)::text,'')) FROM workflow_entity WHERE id NOT IN ("+ids.map(quote).join(',')+")))");}
function verify(){
 assert.deepEqual(snapshot(),JSON.parse(fs.readFileSync(dir+'/before.json')),'EXISTING_STATE_CHANGED');
 for(const w of JSON.parse(fs.readFileSync(dir+'/workflows.json'))){const actual=json('SELECT json_build_object(\'active\',active,\'nodes\',nodes,\'connections\',connections) FROM workflow_entity WHERE id='+quote(w.id));assert.equal(actual.active,false);assert.deepEqual(actual.nodes,w.nodes);assert.deepEqual(actual.connections,w.connections);}
 const installed=json("SELECT json_agg(json_build_object('name',proname,'owner',pg_get_userbyid(proowner),'granted',has_function_privilege('n8n_user',oid,'EXECUTE'))) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ("+names.map(quote).join(',')+')');assert.equal(installed.length,6);assert(installed.every(f=>f.granted));
 docker(['exec','n8n','node','-e',"const fs=require('fs');for(const f of ['ManagedSender.node.js','ManagedWhatsApp.node.js','ManagedWhatsAppCheck.node.js']){if(!fs.existsSync('/home/node/.n8n/custom/'+f))process.exit(1);}console.log('files_present')"]);
 const result={migration:46,installed:true,workflows_inactive:ids,existing_state_preserved:true,messages_sent:0,callback_activated:false,dispatch_enabled:false,functions:installed,checked_at:new Date().toISOString()};fs.writeFileSync(dir+'/verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
if(process.argv[2]==='verify'){verify();process.exit(0);}
assert.equal(process.argv[2],'apply');assert(!fs.existsSync(dir)||fs.readdirSync(dir).length===0,'Existing deployment progress: inspect before repeating');
assert.equal(sql("SELECT count(*) FROM execution_entity WHERE status IN ('new','running','waiting')"),'0','EXECUTIONS_PRESENT_RESTART_BLOCKED');
assert.equal(sql('SELECT count(*) FROM workflow_entity WHERE id IN ('+ids.map(quote).join(',')+')'),'0');
assert.equal(sql("SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ("+names.map(quote).join(',')+')'),'0','EXISTING_FUNCTIONS_REVIEW_REQUIRED');
const manifest=JSON.parse(fs.readFileSync(pkg+'/manifest.json'));
for(const file of manifest.files){assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(pkg,'custom','lead-system',file.file))).digest('hex'),file.sha256,'PACKAGE_HASH_MISMATCH');}
const shared=pkg+'/custom/lead-system/scripts/lead-strategy/runtime.cjs';
const current=docker(['exec','n8n','node','-e',"const fs=require('fs'),c=require('crypto'),p='/home/node/.n8n/custom/lead-system/scripts/lead-strategy/runtime.cjs';console.log(fs.existsSync(p)?c.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):'absent')"]);
assert(current==='absent'||current===crypto.createHash('sha256').update(fs.readFileSync(shared)).digest('hex'),'SHARED_RUNTIME_DIFFERS');
const project=sql("SELECT \"projectId\" FROM shared_workflow WHERE \"workflowId\"='managedSmtpcheck' LIMIT 1");assert(/^[A-Za-z0-9]+$/.test(project),'PROJECT_REQUIRED');
fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/before.json',JSON.stringify(snapshot(),null,2));
const progress={backup_verified:false,migration_applied:false,files_copied:false,workflows_imported:false,restarted:false};const save=()=>fs.writeFileSync(dir+'/progress.json',JSON.stringify(progress,null,2));save();
const dump=docker(['exec','postgres_db','pg_dump','-U','n8n_user','-d','lead_db','-Fc'],undefined,true);assert(dump.length>1000);fs.writeFileSync(dir+'/before.dump',dump);assert(docker(['exec','-i','postgres_db','pg_restore','--list'],dump).includes('TABLE DATA public outreach_activities'));
docker(['cp','n8n:/home/node/.n8n/custom',path.resolve(dir+'/before-custom')]);progress.backup_verified=true;save();
fs.writeFileSync(dir+'/rollback-functions.sql','BEGIN;\n'+names.map(n=>'DROP FUNCTION IF EXISTS '+n+'(jsonb);').join('\n')+'\nCOMMIT;\n');
const workflows=[JSON.parse(fs.readFileSync(pkg+'/workflow.json')),JSON.parse(fs.readFileSync(pkg+'/dispatch-workflow.json')),JSON.parse(fs.readFileSync('workflows/09f_whatsapp_meta_callback.json'))];
workflows.forEach((w,i)=>{w.id=ids[i];w.active=false;delete w.versionId;delete w.activeVersionId;});
fs.writeFileSync(dir+'/workflows.json',JSON.stringify(workflows,null,2));
fs.copyFileSync('database/migrations/046_whatsapp_foundation.sql',dir+'/046.sql');sql(fs.readFileSync(dir+'/046.sql','utf8'));progress.migration_applied=true;save();
docker(['cp',pkg+'/custom/.','n8n:/home/node/.n8n/custom/']);progress.files_copied=true;save();
docker(['cp',dir+'/workflows.json','n8n:/tmp/whatsapp-046-workflows.json']);
docker(['exec','n8n','n8n','import:workflow','--input=/tmp/whatsapp-046-workflows.json','--projectId='+project]);progress.workflows_imported=true;save();
assert.equal(sql("SELECT count(*) FROM execution_entity WHERE status IN ('new','running','waiting')"),'0','EXECUTIONS_PRESENT_RESTART_BLOCKED');
docker(['restart','--time','60','n8n']);progress.restarted=true;save();verify();
