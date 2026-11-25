'use strict';
// Explicit local deployment: one check-only workflow, no send/poll activation or migrations.
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const dir='.local/sender-recheck-20261108',runtime='/home/node/.n8n/custom/lead-system/scripts/sender-connections/worker.cjs';
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:90000,maxBuffer:2000000});assert.equal(r.status,0,'Docker operation failed; private output suppressed');return r.stdout.trim();}
const sql=q=>JSON.parse(docker(['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],q));
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const snapshot=()=>sql("SELECT json_build_object('activities',(SELECT count(*) FROM outreach_activities),'other_workflows',(SELECT md5(jsonb_agg(jsonb_build_object('id',id,'active',active,'nodes',nodes,'connections',connections) ORDER BY id)::text) FROM workflow_entity WHERE id<>'managedSmtpcheck'))");
(async()=>{
 assert.equal(process.argv[2],'--apply','Explicit --apply required');assert(!fs.existsSync(dir+'/deployed.json'),'Already deployed; inspect saved result');
 const before=JSON.parse(fs.readFileSync(dir+'/before-workflow.json')),candidate=JSON.parse(fs.readFileSync(dir+'/workflow.json'));
 const current=sql("SELECT json_build_object('id',id,'name',name,'active',active,'nodes',nodes,'connections',connections,'settings',settings) FROM workflow_entity WHERE id='managedSmtpcheck'");assert.deepEqual(current,before,'Workflow changed since preparation');
 assert.equal(sql("SELECT count(*)::integer FROM execution_entity WHERE status IN ('new','running','waiting')"),0,'Executions present; no restart performed');
 assert.equal(sql("SELECT count(*)::integer FROM workflow_entity WHERE id IN ('managedSmtpsend','managedSmtppoll') AND active"),0,'Send/poll must remain inactive');
 assert(candidate.nodes.filter(n=>n.type==='CUSTOM.managedSender').every(n=>n.parameters.operation==='check'&&n.parameters.release==='null'));
 const project=sql("SELECT to_json(\"projectId\") FROM shared_workflow WHERE \"workflowId\"='managedSmtpcheck' LIMIT 1");assert(/^[A-Za-z0-9]+$/.test(project));
 const baseline=snapshot();fs.writeFileSync(dir+'/baseline.json',JSON.stringify(baseline));
 const progress={runtime_copied:false,imported:false,activated:false,restarted:false};const save=()=>fs.writeFileSync(dir+'/progress.json',JSON.stringify(progress));save();
 docker(['cp','scripts/sender-connections/worker.cjs','n8n:'+runtime]);progress.runtime_copied=true;save();
 docker(['cp',dir+'/workflow.json','n8n:/tmp/sender-recheck-import.json']);
 docker(['exec','n8n','n8n','import:workflow','--input=/tmp/sender-recheck-import.json','--projectId='+project]);progress.imported=true;save();
 docker(['exec','n8n','n8n','update:workflow','--id=managedSmtpcheck','--active=true']);progress.activated=true;save();
 docker(['restart','--time','30','n8n']);progress.restarted=true;save();
 let healthy=false;for(let i=0;i<40;i++){try{if((await fetch('http://127.0.0.1:5678/healthz',{signal:AbortSignal.timeout(2000)})).ok){healthy=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}assert(healthy,'n8n health unconfirmed');
 assert.deepEqual(snapshot(),baseline,'Other workflows/activity changed; inspect before further work');
 assert.equal(sql("SELECT to_json(active) FROM workflow_entity WHERE id='managedSmtpcheck'"),true);
 assert.equal(hash(docker(['exec','n8n','cat',runtime])),hash(fs.readFileSync('scripts/sender-connections/worker.cjs','utf8').trim()));
 const result={deployed_at:new Date().toISOString(),check_schedule_active:true,interval_minutes:1,n8n_healthy:true,other_workflows_unchanged:true,activities_unchanged:true,send_poll_inactive:true,provider_check_requested:false};
 fs.writeFileSync(dir+'/deployed.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
