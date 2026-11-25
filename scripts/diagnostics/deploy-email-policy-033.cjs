'use strict';
// Local deployment of tested policy only. No activation or provider calls.
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const dir='.local/email-policy-033',id='27W04lgTGdgFMWUx';
const file='workflows/06C_outreach_strategy_generator.json',migration='database/migrations/033_optional_email_verification.sql';
const quote=s=>"'"+s.replace(/'/g,"''")+"'";
function docker(args,input,binary=false){const r=cp.spawnSync('docker',args,{input,encoding:binary?undefined:'utf8',timeout:180000,maxBuffer:100e6});if(r.status!==0)throw Error('Docker operation failed (details suppressed to protect credentials)');return binary?r.stdout:r.stdout.trim();}
const sql=q=>docker(['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],q);
const json=q=>JSON.parse(sql(q));
function bodies(s){return [...s.matchAll(/CREATE OR REPLACE FUNCTION\s+(\w+)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/g)].map(m=>({name:m[1],body:m[2].trim()}));}
function snapshot(){return json(`SELECT json_build_object('plans',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) FROM strategy_plans t),'activities',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) FROM outreach_activities t),'approvals',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) FROM strategy_approvals t),'ai_requests',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY lease)::text,'[]')) FROM strategy_ai_requests t),'ai_controls',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY org_id)::text,'[]')) FROM strategy_ai_controls t));`);}
function live(){return json(`SELECT row_to_json(w) FROM workflow_entity w WHERE id='${id}'`);}
function health(){return JSON.parse(docker(['exec','n8n','node','-e',"fetch('http://127.0.0.1:5678/healthz',{signal:AbortSignal.timeout(10000)}).then(r=>console.log(JSON.stringify({status:r.status}))).catch(()=>process.exit(1))"]));}
function inspect(){
 const w=live();assert.equal(w.active,false);assert.equal(sql('SELECT enabled FROM strategy_controls WHERE id'),'f');
 assert.equal(sql("SELECT count(*) FROM strategy_jobs WHERE status IN ('pending','processing')"),'0');
 assert.equal(sql("SELECT count(*) FROM execution_entity WHERE status IN ('new','running','waiting')"),'0');
 const candidate=JSON.parse(fs.readFileSync(file));const strip=w=>({...w,nodes:w.nodes.map(n=>{const c=structuredClone(n);if(c.type==='n8n-nodes-base.code')delete c.parameters.jsCode;return c;})});
 assert.deepEqual(strip({nodes:w.nodes,connections:w.connections}),strip({nodes:candidate.nodes,connections:candidate.connections}),'Workflow graph/non-code drift');
 const baseline=bodies(fs.readFileSync('database/migrations/015_outreach_strategy.sql','utf8')).filter(f=>f.name==='strategy_context').concat(bodies(fs.readFileSync('database/migrations/019_outreach_dispatch_handoff.sql','utf8')).filter(f=>f.name==='outreach_dispatch_check'));
 for(const f of baseline)assert.equal(sql('SELECT prosrc FROM pg_proc WHERE pronamespace=\'public\'::regnamespace AND proname='+quote(f.name)).trim(),f.body,'Baseline drift '+f.name);
 assert.equal(sql("SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='outreach_email_eligibility'"),'0');
 assert.equal(health().status,200);
 return {w,candidate};
}
function verify(){
 const before=JSON.parse(fs.readFileSync(dir+'/before.json'));
 const expected=JSON.parse(fs.readFileSync(dir+'/workflow.json'));
 const w=live();assert.equal(w.active,false);assert.deepEqual(w.nodes,expected.nodes);assert.deepEqual(w.connections,expected.connections);
 for(const f of bodies(fs.readFileSync(dir+'/033.sql','utf8'))){assert.equal(sql('SELECT prosrc FROM pg_proc WHERE pronamespace=\'public\'::regnamespace AND proname='+quote(f.name)).trim(),f.body);assert.equal(sql('SELECT bool_and(has_function_privilege(\'n8n_user\',oid,\'EXECUTE\')) FROM pg_proc WHERE pronamespace=\'public\'::regnamespace AND proname='+quote(f.name)),'t');}
 assert.deepEqual(snapshot(),before.snapshot);assert.equal(health().status,200);
 const eligibility=json(`SELECT coalesce(json_agg(t),'[]'::json) FROM (SELECT x->>'reason' AS reason,x->>'classification' AS classification,count(*) AS leads FROM cleaned_leads l CROSS JOIN LATERAL (SELECT outreach_email_eligibility(jsonb_build_object('org_id',l.org_id,'lead',jsonb_build_object('id',l.id,'email',l.email),'campaign',jsonb_build_object('config',jsonb_build_object('email_verification_policy','basic')),'report',jsonb_build_object('trust',lead_trust_report(l.org_id,l.id)))) x) c WHERE l.org_id=1 GROUP BY 1,2) t`);
 const result={completed_at:new Date().toISOString(),migration:33,sql_verified:true,workflow_imported:true,workflow_active:false,business_state_unchanged:true,provider_calls:0,emails_sent:0,basic_policy_preview:eligibility};
 fs.writeFileSync('documentation/strategy-contract-v2/email-policy-033-deployment.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
try{
 const mode=process.argv[2];if(mode==='verify'){verify();}else{
  assert(['inspect','apply'].includes(mode));const {w,candidate}=inspect();
  if(mode==='inspect')console.log('PASS baseline functions, paused workflow/planner, empty queues, graph preservation and n8n health');
  else{
   assert(!fs.existsSync(dir),'Existing deployment directory; inspect progress, do not replay');fs.mkdirSync(dir,{recursive:true});
   fs.writeFileSync(dir+'/before.json',JSON.stringify({workflow:w,snapshot:snapshot()}));
   fs.writeFileSync(dir+'/rollback.sql',"BEGIN;\n"+sql("SELECT pg_get_functiondef('strategy_context(integer,bigint,integer)'::regprocedure)||E'\\n'||pg_get_functiondef('outreach_dispatch_check(jsonb)'::regprocedure)")+"\nDROP FUNCTION outreach_email_eligibility(jsonb);\nCOMMIT;\n");
   const dump=docker(['exec','postgres_db','pg_dump','-U','n8n_user','-d','lead_db','-Fc'],undefined,true);assert(dump.length>1000);fs.writeFileSync(dir+'/before.dump',dump);assert(docker(['exec','-i','postgres_db','pg_restore','--list'],dump).includes('TABLE DATA public strategy_plans'));
   fs.copyFileSync(migration,dir+'/033.sql');fs.writeFileSync(dir+'/workflow.json',JSON.stringify({...w,...candidate,id,active:false}));
   sql(fs.readFileSync(dir+'/033.sql','utf8'));fs.writeFileSync(dir+'/progress.json',JSON.stringify({migration_applied:true,imported:false}));
   const project=sql(`SELECT "projectId" FROM shared_workflow WHERE "workflowId"='${id}' AND role='workflow:owner'`);assert(/^[A-Za-z0-9_-]+$/.test(project));
   docker(['cp',dir+'/workflow.json','n8n:/tmp/email-policy-033.json']);docker(['exec','n8n','n8n','import:workflow','--input=/tmp/email-policy-033.json','--projectId='+project]);
   fs.writeFileSync(dir+'/progress.json',JSON.stringify({migration_applied:true,imported:true}));verify();
  }
 }
}catch(e){console.error(e.message);process.exitCode=1;}
