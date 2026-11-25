'use strict';
// Targeted in-place imports: empty-queue flag + consumer guard only.
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),path=require('node:path');
const {install,guard}=require('../workflow-queue-guards.cjs');
const ids=['7jPOsS56m3qNOkrI','uCZOwnPIZXN6UjQF','PnLPSceKs2Rzn4xw','PhPwFzvnz5uOmYQN','iCxcuTaXccj2SnEA'];
const dir=process.argv[2]?path.resolve(process.argv[2]):path.resolve('.local/queue-guards-'+Date.now());assert(dir.startsWith(path.resolve('.local')+path.sep)&&/^queue-guards-[0-9]+$/.test(path.basename(dir)));fs.mkdirSync(dir,{recursive:true});
function docker(args,input,binary=false){const r=cp.spawnSync('docker',args,{input,encoding:binary?undefined:'utf8',timeout:120000,maxBuffer:100000000});if(r.status!==0)throw Error('QUEUE_IMPORT_UNCONFIRMED');return r.stdout;}
const json=q=>JSON.parse(docker(['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],q));
const idList=ids.map(i=>"'"+i+"'").join(',');
const snapshot=()=>json(`SELECT jsonb_build_object('others',(SELECT md5(jsonb_agg(jsonb_build_object('id',id,'active',active,'nodes',nodes,'connections',connections,'settings',settings) ORDER BY id)::text) FROM workflow_entity WHERE id NOT IN (${idList})),'activity_count',(SELECT count(*) FROM outreach_activities),'ai_count',(SELECT count(*) FROM strategy_ai_requests),'ai_controls',(SELECT jsonb_agg(to_jsonb(c) ORDER BY org_id) FROM strategy_ai_controls c),'contact_controls',(SELECT jsonb_agg(to_jsonb(c)) FROM contact_controls c))`);
const state=fs.existsSync(dir+'/progress.json')?JSON.parse(fs.readFileSync(dir+'/progress.json')):{phase:'prepared',installed:[]};function save(){fs.writeFileSync(dir+'/progress.json',JSON.stringify(state,null,2));}
async function main(){
 const verificationOnly=process.argv.includes('--verify-only');
 if(!verificationOnly){assert.equal(json("SELECT count(*)::integer FROM execution_entity WHERE status IN ('new','running','waiting')"),0,'WAIT_FOR_IDLE_N8N');
 assert.equal(json("SELECT count(*)::integer FROM scraping_jobs WHERE status IN ('running','pending','queued') AND gathering_version=1"),0,'WAIT_FOR_GATHERING_JOBS');}
 const before=fs.existsSync(dir+'/before.json')?JSON.parse(fs.readFileSync(dir+'/before.json')):json(`SELECT json_agg(json_build_object('id',w.id,'name',w.name,'active',w.active,'nodes',w.nodes,'connections',w.connections,'settings',w.settings,'project',(SELECT "projectId" FROM shared_workflow WHERE "workflowId"=w.id LIMIT 1)) ORDER BY w.id) FROM workflow_entity w WHERE w.id IN (${idList})`);assert.equal(before.length,5);
 // Validate every target before importing the first one.
 for(const w of before)assert.equal(install(structuredClone(w.nodes)),1);
 const baseline=fs.existsSync(dir+'/baseline.json')?JSON.parse(fs.readFileSync(dir+'/baseline.json')):snapshot();assert.deepEqual(snapshot(),baseline);
 if(!fs.existsSync(dir+'/before.json')){fs.writeFileSync(dir+'/baseline.json',JSON.stringify(baseline,null,2));fs.writeFileSync(dir+'/before.json',JSON.stringify(before,null,2));}
 assert.equal(cp.spawnSync('git',['check-ignore',dir+'/backup.dump'],{stdio:'ignore'}).status,0);if(!fs.existsSync(dir+'/backup.dump'))fs.writeFileSync(dir+'/backup.dump',docker(['exec','postgres_db','pg_dump','-U','n8n_user','-d','lead_db','-Fc'],undefined,true));save();
 for(const old of before){assert(/^[A-Za-z0-9_-]{1,36}$/.test(old.project));const w=structuredClone(old);delete w.project;const wasActive=w.active;w.active=false;
  assert.equal(install(w.nodes),1);assert.deepEqual(w.connections,old.connections);
  if(state.installed.includes(w.id)){const current=json(`SELECT json_build_object('nodes',nodes,'connections',connections,'active',active,'settings',settings) FROM workflow_entity WHERE id='${w.id}'`);assert.deepEqual(current,{nodes:w.nodes,connections:w.connections,active:wasActive,settings:w.settings});continue;}
  const candidate=dir+'/'+w.id+'.json';fs.writeFileSync(candidate,JSON.stringify(w,null,2));
  docker(['cp',candidate,'n8n:/tmp/queue-guard-'+w.id+'.json']);docker(['exec','n8n','n8n','import:workflow','--input=/tmp/queue-guard-'+w.id+'.json','--projectId='+old.project]);
  docker(['exec','n8n','n8n','update:workflow','--id='+w.id,'--active='+wasActive]);
  const actual=json(`SELECT json_build_object('nodes',nodes,'connections',connections,'active',active,'settings',settings) FROM workflow_entity WHERE id='${w.id}'`);
  assert.deepEqual(actual,{nodes:w.nodes,connections:w.connections,active:wasActive,settings:w.settings});state.installed.push(w.id);save();
 }
 assert.deepEqual(snapshot(),baseline);state.phase='imported_restart_pending';save();
 if(!verificationOnly){assert.equal(json("SELECT count(*)::integer FROM execution_entity WHERE status IN ('new','running','waiting')"),0,'WAIT_FOR_IDLE_BEFORE_RESTART');
 docker(['restart','--time','60','n8n']);}
 let healthy=false;for(let i=0;i<40;i++){try{if((await fetch('http://127.0.0.1:5678/healthz',{signal:AbortSignal.timeout(2000)})).ok){healthy=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}assert(healthy,'N8N_HEALTH_UNCONFIRMED');
 assert.deepEqual(snapshot(),baseline);state.phase='installed_and_healthy';state.finished_at=new Date().toISOString();delete state.error;save();
 console.log(JSON.stringify({installed_workflows:5,connections_notes_sql_preserved:true,previous_activation_preserved:true,other_workflows_unchanged:true,ai_controls_activities_unchanged:true,healthy:true,provider_calls_by_installer:0,report_directory:dir}));
}
main().catch(e=>{state.error=e.message;save();console.error(e.message+'; inspect '+dir+'/progress.json before retry');process.exitCode=1;});
