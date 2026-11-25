'use strict';
// User-authorized inactive deployment. No workflow execution or activation.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const dir=path.resolve('.local/linkedin-manual-deployment-20261028');
const ids={helper:'SYZYgAbCrJSbVCwa',strategy:'27W04lgTGdgFMWUx'};
const functions=['outreach_linkedin_gate','outreach_linkedin_prepare','outreach_linkedin_event','outreach_linkedin_queue'];
function docker(args,input,binary=false){const r=cp.spawnSync('docker',args,{input,encoding:binary?undefined:'utf8',timeout:180000,maxBuffer:150e6});if(r.status!==0){fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'private-command-error.log'),String(r.stdout||'')+String(r.stderr||''));throw Error('DOCKER_OPERATION_FAILED:'+args.slice(0,3).join(' ')+'; private diagnostic saved');}return binary?r.stdout:r.stdout.trim();}
const sql=q=>docker(['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],q);
const json=q=>JSON.parse(sql(q));
const quote=s=>"'"+String(s).replace(/'/g,"''")+"'";
function live(id){return json('SELECT row_to_json(w) FROM workflow_entity w WHERE id='+quote(id));}
function snapshot(){return json(`SELECT json_build_object(
 'plans',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) FROM strategy_plans t),
 'campaigns',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) FROM strategy_campaigns t),
 'approvals',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) FROM strategy_approvals t),
 'activities',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) FROM outreach_activities t),
 'ai_requests',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY lease)::text,'[]')) FROM strategy_ai_requests t),
 'ai_controls',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY org_id)::text,'[]')) FROM strategy_ai_controls t),
 'strategy_controls',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t))::text,'[]')) FROM strategy_controls t),
 'other_workflows',(SELECT md5(coalesce(jsonb_agg(jsonb_build_object('id',id,'active',active,'nodes',nodes,'connections',connections) ORDER BY id)::text,'[]')) FROM workflow_entity WHERE id NOT IN ('${ids.helper}','${ids.strategy}')));`);}
function inspect(){
 const before={helper:live(ids.helper),strategy:live(ids.strategy)};
 assert.equal(before.helper.name,'7B - LinkedIn Outreach Helper');assert.equal(before.strategy.name,'6C - Campaign Outreach Strategy Planner');
 for(const w of Object.values(before))assert.equal(w.active,false,'TARGET_ALREADY_ACTIVE_REQUIRES_REVIEW');
 assert.equal(sql("SELECT count(*) FROM strategy_jobs WHERE status='processing'"),'0');
 const helper=JSON.parse(fs.readFileSync('workflows/07B_linkedIn_outreach_helper.json','utf8'));
 const strategy=JSON.parse(fs.readFileSync('workflows/06C_outreach_strategy_generator.json','utf8'));
 assert.equal(helper.active,false);assert(!strategy.active);
 assert.deepEqual(helper.connections,before.helper.connections,'HELPER_GRAPH_DRIFT');
 for(const note of before.helper.nodes.filter(n=>n.type==='n8n-nodes-base.stickyNote'))assert.deepEqual(helper.nodes.find(n=>n.id===note.id),note,'EXISTING_NOTE_DRIFT');
 const strip=nodes=>nodes.map(n=>{n=structuredClone(n);if(n.type==='n8n-nodes-base.code')delete n.parameters.jsCode;return n;});
 assert.deepEqual(strip(strategy.nodes),strip(before.strategy.nodes),'STRATEGY_NON_CODE_DRIFT');assert.deepEqual(strategy.connections,before.strategy.connections,'STRATEGY_GRAPH_DRIFT');
 return {before,desired:{helper:{...before.helper,...helper,id:ids.helper,name:before.helper.name,active:false},strategy:{...before.strategy,...strategy,id:ids.strategy,active:false}}};
}
function bodies(text){return [...text.matchAll(/CREATE OR REPLACE FUNCTION\s+(\w+)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/g)].map(m=>({name:m[1],body:m[2].trim()}));}
function apply(){
 const staged=inspect();assert(!fs.existsSync(dir),'EXISTING_RELEASE_INSPECT_PROGRESS');
 assert.equal(sql("SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'outreach_linkedin_%'"),'0','MIGRATION_EXISTS_INSPECT_BEFORE_REPLAY');
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'before.json'),JSON.stringify({...staged.before,snapshot:snapshot()},null,2));
 fs.writeFileSync(path.join(dir,'rollback-workflows.json'),JSON.stringify(Object.values(staged.before).map(w=>({...w,active:false})),null,2));
 fs.writeFileSync(path.join(dir,'workflows.json'),JSON.stringify(Object.values(staged.desired),null,2));
 fs.copyFileSync('database/migrations/045_linkedin_manual.sql',path.join(dir,'045.sql'));
 const dump=docker(['exec','postgres_db','pg_dump','-U','n8n_user','-d','lead_db','-Fc'],undefined,true);assert(dump.length>1000);fs.writeFileSync(path.join(dir,'before.dump'),dump);
 assert(docker(['exec','-i','postgres_db','pg_restore','--list'],dump).includes('TABLE DATA public outreach_activities'));
 fs.writeFileSync(path.join(dir,'rollback-functions.sql'),'BEGIN;\nDROP FUNCTION outreach_linkedin_queue(jsonb),outreach_linkedin_event(jsonb),outreach_linkedin_prepare(jsonb),outreach_linkedin_gate(integer,bigint,integer);\nCOMMIT;\n');
 const progress={started_at:new Date().toISOString(),backup_verified:true,backup_sha256:crypto.createHash('sha256').update(dump).digest('hex'),migration_applied:false,workflows_imported:false,activation_requested:false};const save=()=>fs.writeFileSync(path.join(dir,'progress.json'),JSON.stringify(progress,null,2));save();
 sql(fs.readFileSync(path.join(dir,'045.sql'),'utf8'));progress.migration_applied=true;save();
 const projects=json(`SELECT json_agg(json_build_object('workflow_id',"workflowId",'project_id',"projectId")) FROM shared_workflow WHERE "workflowId" IN ('${ids.helper}','${ids.strategy}')`);
 assert(Array.isArray(projects)&&projects.length===2&&projects[0].project_id===projects[1].project_id,'SHARED_PROJECT_REQUIRED');const project=projects[0].project_id;assert(/^[A-Za-z0-9]+$/.test(project));
 docker(['cp',path.join(dir,'workflows.json'),'n8n:/tmp/linkedin-manual-045-workflows.json']);
 docker(['exec','n8n','n8n','import:workflow','--input=/tmp/linkedin-manual-045-workflows.json','--projectId='+project]);progress.workflows_imported=true;save();
 verify();
}
function verify(){
 const before=JSON.parse(fs.readFileSync(path.join(dir,'before.json'),'utf8')),desired=JSON.parse(fs.readFileSync(path.join(dir,'workflows.json'),'utf8'));
 for(const expected of desired){const w=live(expected.id);assert.equal(w.active,false);assert.deepEqual(w.nodes,expected.nodes);assert.deepEqual(w.connections,expected.connections);assert.deepEqual(w.settings,expected.settings);}
 const parsed=bodies(fs.readFileSync(path.join(dir,'045.sql'),'utf8'));assert.equal(parsed.length,4);
 for(const f of parsed){assert(functions.includes(f.name));assert.equal(sql("SELECT prosrc FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname="+quote(f.name)).trim(),f.body);assert.equal(sql("SELECT bool_and(has_function_privilege('n8n_user',oid,'EXECUTE') AND NOT coalesce(array_to_string(proacl,',') ~ '(^|,)=[^,]*X',false)) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname="+quote(f.name)),'t');}
 assert.deepEqual(snapshot(),before.snapshot,'UNEXPECTED_BUSINESS_OR_WORKFLOW_CHANGE');
 assert.equal(json("SELECT outreach_linkedin_gate(1,-1,1)").allowed,false);
 const queue=json("SELECT outreach_linkedin_queue('{\"org_id\":1}'::jsonb)");assert.equal(queue.manual_only,true);assert.equal(queue.execution_authorized,false);
 const flag=docker(['exec','n8n','node','-e',"console.log(process.env.LINKEDIN_MANUAL_ENABLED==='true')"]);assert.equal(flag,'false','FEATURE_FLAG_MUST_REMAIN_DISABLED');
 const report={verified_at:new Date().toISOString(),migration:45,migration_applied:true,functions_verified:parsed.map(f=>f.name),workflow_ids:ids,helper_active:false,strategy_active:false,linkedin_manual_feature_enabled:false,other_workflows_and_business_state_preserved:true,models_called:0,apify_runs:0,messages_sent:0,restart_required:false};
 fs.writeFileSync(path.join(dir,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
try{const mode=process.argv[2];if(mode==='inspect'){const r=inspect();console.log(JSON.stringify({ready:true,target_workflows:Object.values(r.before).map(w=>({id:w.id,name:w.name,active:w.active})),strategy_code_nodes_changed:r.desired.strategy.nodes.filter(n=>n.type==='n8n-nodes-base.code'&&n.parameters.jsCode!==r.before.strategy.nodes.find(x=>x.id===n.id)?.parameters.jsCode).map(n=>n.name),graphs_preserved:true}));}else if(mode==='apply')apply();else if(mode==='verify')verify();else throw Error('INSPECT_APPLY_OR_VERIFY_REQUIRED');}catch(e){console.error(e.code==='ERR_ASSERTION'?'DEPLOYMENT_VERIFICATION_FAILED:'+e.message.split('\n')[0]:'DEPLOYMENT_FAILED:'+e.message);process.exitCode=1;}
