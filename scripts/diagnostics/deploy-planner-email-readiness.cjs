'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:90000,maxBuffer:12000000});assert.equal(r.status,0,'PLANNER_IMPORT_UNCONFIRMED');return r.stdout.trim();}
const sql=q=>JSON.parse(docker(['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],q));
function main(){const dir=path.resolve(process.argv[2]||'');assert(dir.startsWith(path.resolve('.local')+path.sep),'LOCAL_BUNDLE_REQUIRED');
 const before=JSON.parse(fs.readFileSync(dir+'/before.json')),candidate=JSON.parse(fs.readFileSync(dir+'/workflow.json')),manifest=JSON.parse(fs.readFileSync(dir+'/manifest.json'));
 assert(/^[A-Za-z0-9_-]{1,36}$/.test(manifest.workflow_id)&&/^[A-Za-z0-9_-]{1,36}$/.test(manifest.project_id));assert.equal(manifest.previous_active,false,'ACTIVE_PLANNER_REQUIRES_SEPARATE_ROLLOUT');assert.equal(candidate.active,false);
 const id=manifest.workflow_id,load=()=>sql(`SELECT json_build_object('id',id,'name',name,'active',active,'nodes',nodes,'connections',connections,'settings',settings) FROM workflow_entity WHERE id='${id}'`);
 assert.deepEqual(load(),before,'LIVE_PLANNER_CHANGED');
 const stripped=w=>{w=structuredClone(w);for(const n of w.nodes)if(manifest.changed_nodes.includes(n.name)){delete n.parameters.jsCode;delete n.parameters.query;}return w;};assert.deepEqual(stripped(before),stripped(candidate));
 const snap=()=>sql(`SELECT jsonb_build_object('others',(SELECT md5(jsonb_agg(jsonb_build_object('id',id,'active',active,'nodes',nodes,'connections',connections) ORDER BY id)::text) FROM workflow_entity WHERE id<>'${id}'),'activities',(SELECT count(*) FROM outreach_activities),'requests',(SELECT count(*) FROM strategy_ai_requests),'plans',(SELECT count(*) FROM strategy_plans),'controls',(SELECT jsonb_agg(to_jsonb(c) ORDER BY org_id) FROM strategy_ai_controls c))`);
 const baseline=snap();fs.writeFileSync(dir+'/baseline.json',JSON.stringify(baseline,null,2));
 docker(['cp',dir+'/workflow.json','n8n:/tmp/planner-email-readiness.json']);docker(['exec','n8n','n8n','import:workflow','--input=/tmp/planner-email-readiness.json','--projectId='+manifest.project_id]);
 assert.deepEqual(load(),candidate,'IMPORTED_PLANNER_MISMATCH');assert.deepEqual(snap(),baseline,'UNRELATED_STATE_CHANGED');
 const result={imported:true,active:false,changed_nodes:manifest.changed_nodes.length,graph_notes_credentials_settings_preserved:true,other_workflows_unchanged:true,ai_controls_ledger_plans_unchanged:true,activities_unchanged:true,migrations_applied:0,model_calls:0,emails_sent:0,imported_at:new Date().toISOString()};fs.writeFileSync(dir+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
try{main();}catch{console.error('PLANNER_READINESS_IMPORT_UNCONFIRMED; inspect live state before retry');process.exitCode=1;}
