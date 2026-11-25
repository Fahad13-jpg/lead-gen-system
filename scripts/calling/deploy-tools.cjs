'use strict';
// Explicitly approved 2026-10-28: one tool ingress + functions, no dialer import.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto'),os=require('node:os');
const dir=path.resolve('.local/calling-tools-20261028'),id='retellCallToolsV1';
function docker(args,input,binary=false){const r=cp.spawnSync('docker',args,{input,encoding:binary?undefined:'utf8',timeout:180000,maxBuffer:150e6});if(r.status!==0){fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'docker-error.txt'),String(r.stderr||'').replace(/key_[A-Za-z0-9_-]+/g,'[REDACTED]'));throw Error('DOCKER_STEP_FAILED:'+args.slice(0,3).join(' '));}return binary?r.stdout:r.stdout.trim();}
const sql=q=>docker(['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],q);
function snapshot(){return JSON.parse(sql(`SELECT json_build_object('activities',(SELECT md5(jsonb_agg(to_jsonb(a) ORDER BY id)::text) FROM outreach_activities a),'plans',(SELECT md5(jsonb_agg(to_jsonb(a) ORDER BY id)::text) FROM strategy_plans a),'ai_requests',(SELECT count(*) FROM strategy_ai_requests),'workflows',(SELECT md5(jsonb_agg(jsonb_build_object('id',id,'active',active,'nodes',nodes,'connections',connections) ORDER BY id)::text) FROM workflow_entity WHERE id<>'${id}'));`));}
function build(){
 assert(!fs.existsSync(dir),'EXISTING_RELEASE_INSPECT_PROGRESS');fs.mkdirSync(dir,{recursive:true});
 const seen=new Set();function copy(f){f=path.normalize(f);if(seen.has(f))return;seen.add(f);const text=fs.readFileSync(f,'utf8'),dest=path.join(dir,'custom/lead-system',f);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,text);for(const m of text.matchAll(/require\(['"](\.[^'"]+)['"]\)/g))copy(path.join(path.dirname(f),m[1]));}copy('scripts/calling/tool-worker.cjs');
 fs.copyFileSync('scripts/calling/n8n/ManagedCallTools.node.js',path.join(dir,'custom/ManagedCallTools.node.js'));
 fs.writeFileSync(path.join(dir,'workflow.json'),JSON.stringify(require('./build-tool-workflow.cjs').build(),null,2));
 const files=fs.readdirSync('database/migrations').filter(f=>/^0(3[7-9]|4[0-4])_/.test(f)).sort();assert.equal(files.length,8);
 const combined='BEGIN;\n'+files.map(f=>fs.readFileSync('database/migrations/'+f,'utf8').replace(/^BEGIN;\s*$/mg,'').replace(/^COMMIT;\s*$/mg,'')).join('\n')+'\nCOMMIT;\n';fs.writeFileSync(path.join(dir,'functions.sql'),combined);
 fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({files:[...seen],migrations:files,workflow:id,phone_schedules_imported:false},null,2));
 console.log('LOCAL_RELEASE_PREPARED');
}
function apply(){
 assert(fs.existsSync(path.join(dir,'manifest.json')));assert(!fs.existsSync(path.join(dir,'progress.json')),'INSPECT_EXISTING_PROGRESS');
 // Old persisted running records can survive a prior interrupted process. Do not
 // cancel/delete them; n8n's graceful stop and existing job leases handle recovery.
 assert.equal(sql("SELECT count(*) FROM execution_entity WHERE status IN ('new','running') AND \"startedAt\">now()-interval '1 hour'"),'0','RECENT_ACTIVE_EXECUTIONS_BLOCK_RESTART');
 assert.equal(sql("SELECT count(*) FROM strategy_jobs WHERE status='processing'"),'0');
 assert.equal(sql("SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'outreach_call_%'"),'0','EXISTING_CALL_FUNCTIONS_REQUIRE_REVIEW');
 assert.equal(sql(`SELECT count(*) FROM workflow_entity WHERE id='${id}'`),'0');
 fs.writeFileSync(path.join(dir,'before.json'),JSON.stringify(snapshot()));
 const dump=docker(['exec','postgres_db','pg_dump','-U','n8n_user','-d','lead_db','-Fc'],undefined,true);assert(dump.length>1000);fs.writeFileSync(path.join(dir,'before.dump'),dump);assert(docker(['exec','-i','postgres_db','pg_restore','--list'],dump).includes('TABLE DATA public outreach_activities'));
 const progress={backup_verified:true,migration_applied:false,imported:false,activated:false};const save=()=>fs.writeFileSync(path.join(dir,'progress.json'),JSON.stringify(progress,null,2));save();
 sql(fs.readFileSync(path.join(dir,'functions.sql'),'utf8'));progress.migration_applied=true;save();
 const rollback=sql("SELECT 'DROP FUNCTION '||oid::regprocedure||';' FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'outreach_call_%' ORDER BY oid DESC");fs.writeFileSync(path.join(dir,'rollback-functions.sql'),'BEGIN;\n'+rollback+'\nCOMMIT;\n');
 let key=fs.readFileSync(path.join(os.homedir(),'Desktop/retell.txt'),'utf8').replace(/^\uFEFF/,'').trim();const assigned=/^(?:RETELL_API_KEY|API_KEY)\s*=\s*["']?([^\s"']+)["']?$/i.exec(key);if(assigned)key=assigned[1];assert(key&&!/\s/.test(key));
 const privateConfig={token:crypto.randomBytes(32).toString('hex'),retell_key:key,org_id:1,agent_id:'agent_8ad1ab3a505d9b818a8035558e',agent_version:0,connection_ref:'retell-initial-org1'};
 fs.writeFileSync(path.join(dir,'private.json'),JSON.stringify(privateConfig),{mode:0o600,flag:'wx'});
 docker(['cp',path.join(dir,'custom/.'),'n8n:/home/node/.n8n/custom/']);docker(['cp',path.join(dir,'private.json'),'n8n:/home/node/.n8n/calling-tools-private.json']);docker(['exec','-u','root','n8n','sh','-c','chown node:node /home/node/.n8n/calling-tools-private.json && chmod 600 /home/node/.n8n/calling-tools-private.json']);
 const project=sql("SELECT \"projectId\" FROM shared_workflow ORDER BY \"workflowId\" LIMIT 1");assert(/^[A-Za-z0-9]+$/.test(project));
 docker(['cp',path.join(dir,'workflow.json'),'n8n:/tmp/retell-call-tools.json']);docker(['exec','n8n','n8n','import:workflow','--input=/tmp/retell-call-tools.json','--projectId='+project]);progress.imported=true;save();
 docker(['exec','n8n','n8n','update:workflow','--id='+id,'--active=true']);progress.activated=true;save();
 docker(['restart','--time','60','n8n']);progress.restarted=true;save();verify();
}
function verify(){assert.deepEqual(snapshot(),JSON.parse(fs.readFileSync(path.join(dir,'before.json'))));assert.equal(sql(`SELECT active FROM workflow_entity WHERE id='${id}'`),'t');assert.equal(sql("SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'outreach_call_%'"),'20');console.log('FUNCTIONS_INSTALLED_TOOL_ONLY_ACTIVE_EXISTING_STATE_PRESERVED');}
if(require.main===module){try{({build,apply,verify})[process.argv[2]]();}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={dir,docker,sql,snapshot};
