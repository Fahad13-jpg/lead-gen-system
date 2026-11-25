'use strict';
// Explicit local deployment of one check-only schedule. No email/reply executor changes.
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {build}=require('../sender-connections/build-gmail-check.cjs');
const id='managedGmailcheck',dir='.local/gmail-recheck-'+Date.now();
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:90000,maxBuffer:3000000});assert.equal(r.status,0,'DOCKER_CHECK_DEPLOYMENT_UNCONFIRMED');return r.stdout.trim();}
const sql=q=>JSON.parse(docker(['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],q));
const snapshot=()=>sql(`SELECT json_build_object('activities',(SELECT count(*) FROM outreach_activities),'workflows',(SELECT md5(jsonb_agg(jsonb_build_object('id',id,'active',active,'nodes',nodes,'connections',connections) ORDER BY id)::text) FROM workflow_entity WHERE id<>'${id}'))`);
async function main(){
 assert.equal(process.argv[2],'--apply','EXPLICIT_APPLY_REQUIRED');
 assert.equal(sql(`SELECT count(*)::integer FROM workflow_entity WHERE id='${id}'`),0,'EXISTING_CHECKER_REQUIRES_REVIEW');
 assert.equal(sql(`SELECT count(*)::integer FROM execution_entity WHERE status IN ('new','running','waiting')`),0,'ACTIVE_EXECUTIONS_NO_RESTART');
 const bindings=sql(`SELECT coalesce(json_agg(json_build_object('org_id',org_id,'connection_id',connection_id,'credential_ref',credential_ref)),'[]'::json) FROM sender_connections WHERE org_id=1 AND provider='gmail' AND state='ready'`);assert.equal(bindings.length,1,'ONE_READY_GMAIL_REQUIRED');
 const existing=sql(`SELECT json_build_object('project',(SELECT "projectId" FROM shared_workflow WHERE "workflowId"='managedSmtpcheck' LIMIT 1),'postgres',(SELECT n->'credentials'->'postgres'->>'id' FROM workflow_entity w CROSS JOIN LATERAL jsonb_array_elements(w.nodes::jsonb) n WHERE w.id='managedSmtpcheck' AND n->'credentials' ? 'postgres' LIMIT 1))`);
 assert(/^[A-Za-z0-9_-]{1,36}$/.test(existing.project));
 const workflow=build({...bindings[0],postgres_ref:existing.postgres});
 fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/workflow.json',JSON.stringify(workflow,null,2));const before=snapshot();fs.writeFileSync(dir+'/before.json',JSON.stringify(before));
 const progress={node_copied:false,runtime_copied:false,imported:false,activated:false,restarted:false};const save=()=>fs.writeFileSync(dir+'/progress.json',JSON.stringify(progress));save();
 docker(['cp','scripts/sender-connections/gmail-check.cjs','n8n:/home/node/.n8n/custom/lead-system/scripts/sender-connections/gmail-check.cjs']);progress.runtime_copied=true;save();
 docker(['cp','scripts/sender-connections/n8n/ManagedGmailCheck.node.js','n8n:/home/node/.n8n/custom/ManagedGmailCheck.node.js']);progress.node_copied=true;save();
 docker(['cp',dir+'/workflow.json','n8n:/tmp/gmail-check-import.json']);
 docker(['exec','n8n','n8n','import:workflow','--input=/tmp/gmail-check-import.json','--projectId='+existing.project]);progress.imported=true;save();
 docker(['exec','n8n','n8n','update:workflow','--id='+id,'--active=true']);progress.activated=true;save();
 docker(['restart','--time','30','n8n']);progress.restarted=true;save();
 let healthy=false;for(let i=0;i<40;i++){try{if((await fetch('http://127.0.0.1:5678/healthz',{signal:AbortSignal.timeout(2000)})).ok){healthy=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}assert(healthy,'N8N_HEALTH_UNCONFIRMED');
 assert.deepEqual(snapshot(),before,'UNRELATED_STATE_CHANGED');assert.equal(sql(`SELECT to_json(active) FROM workflow_entity WHERE id='${id}'`),true);
 // The editor's node-types endpoint requires login. A check-only idle execution
 // proves the installed node actually loads, without bypassing that authentication.
 const execution=cp.spawnSync(process.execPath,['scripts/diagnostics/run-gmail-recheck.cjs'],{encoding:'utf8',timeout:150000});assert.equal(execution.status,0,'CUSTOM_CHECK_NODE_NOT_LOADED');
 const result={deployed_at:new Date().toISOString(),check_schedule_active:true,interval_minutes:5,custom_node_loaded:true,other_workflows_unchanged:true,activities_unchanged:true,emails_sent:0};fs.writeFileSync(dir+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
main().catch(()=>{console.error('GMAIL_CHECK_DEPLOYMENT_UNCONFIRMED; inspect local progress file before retry');process.exitCode=1;});
