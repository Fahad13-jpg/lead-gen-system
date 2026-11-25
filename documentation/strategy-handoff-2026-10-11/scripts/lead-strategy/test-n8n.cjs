'use strict';
// Isolated n8n instance and test database only. No provider calls or sending nodes.
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {Client}=require(require.resolve('pg',{paths:['/usr/local/lib/node_modules/n8n']}));
const rt=require('/tmp/strategy-runtime.cjs'),dir='/tmp/strategy-isolated-20261010';fs.mkdirSync(dir,{recursive:true,mode:0o700});
const env={...process.env,DB_TYPE:'sqlite',N8N_USER_FOLDER:dir,N8N_PORT:'5686',N8N_DIAGNOSTICS_ENABLED:'false',N8N_VERSION_NOTIFICATIONS_ENABLED:'false',N8N_RUNNERS_ENABLED:'false'};
const quote=s=>"'"+String(s).replace(/'/g,"''")+"'";
function cli(args,e=env){const r=cp.spawnSync('n8n',args,{env:e,encoding:'utf8',timeout:180000,maxBuffer:5*1024*1024});if(r.status!==0){fs.writeFileSync(dir+'/failure.log',(r.stdout||'')+(r.stderr||''),{mode:0o600});throw Error('n8n '+args[0]+' failed');}console.log('Isolated n8n '+args[0]+' passed');}
(async()=>{let server;const db=new Client({host:process.env.DB_POSTGRESDB_HOST,user:process.env.DB_POSTGRESDB_USER,password:process.env.DB_POSTGRESDB_PASSWORD,database:'lead_gathering_test_20260926'});await db.connect();let controls;
try{
 controls=(await db.query('SELECT enabled FROM strategy_controls WHERE id')).rows[0];
 let auth;
 for(const id of ['gatheringTestPg','leadGatheringAuth']){
  const file=dir+'/'+id+'.json';cli(['export:credentials','--id='+id,'--decrypted','--output='+file],process.env);fs.chmodSync(file,0o600);
  const value=JSON.parse(fs.readFileSync(file))[0];if(id==='gatheringTestPg')assert.equal(value.data.database,'lead_gathering_test_20260926');else auth=value.data;
  cli(['import:credentials','--input='+file]);fs.unlinkSync(file);
 }
 await db.query("INSERT INTO organizations(id,org_name,status) VALUES(940071,'Strategy n8n fixture','active') ON CONFLICT DO NOTHING");
 await db.query("UPDATE strategy_jobs SET status='cancelled' WHERE org_id=940071 AND status IN ('pending','processing')");
 const sid=(await db.query("INSERT INTO staging_leads(org_id,company_name,source,cleaning_status,raw_data) VALUES(940071,'O''Brien Dental','google_maps','cleaned','{}') RETURNING id")).rows[0].id;
 const lid=(await db.query("INSERT INTO cleaned_leads(org_id,staging_id,company_name,category,city) VALUES(940071,"+sid+",'O''Brien Dental','Dental clinic','Islamabad') RETURNING id")).rows[0].id;
 await db.query('INSERT INTO cleaning_links(staging_id,org_id,cleaned_id) VALUES('+sid+',940071,'+lid+')');
 const campaign=rt.campaign({org_id:940071,config:{name:'Demo campaign',channels:['email','call'],mode:'hybrid',timezone:'Asia/Karachi',sender:{name:'Alex',company:'Demo Studio'},offer:{name:'Website demo',description:'We build clinic websites.'},cta:{text:'May I send a demo?'},templates:{email:{subject:'Demo for {{company_name}}',body:'Hello {{company_name}},\nA "website" demo.\nReply STOP to opt out.'}}}});
 const c=(await db.query('SELECT strategy_campaign_save('+quote(JSON.stringify(campaign))+'::jsonb) AS result')).rows[0].result;
 const request={org_id:940071,campaign_id:c.campaign_id,lead_id:lid,request_id:'native-'+sid};
 const j=(await db.query('SELECT strategy_enqueue('+quote(JSON.stringify(request))+'::jsonb) AS result')).rows[0].result;
 await db.query('UPDATE strategy_controls SET enabled=true WHERE id');
 const base=JSON.parse(fs.readFileSync('/tmp/06C_outreach_strategy_generator.json'));base.id='strategyPlannerTest';base.active=false;delete base.settings.errorWorkflow;
 for(const n of base.nodes)if(n.type.endsWith('.postgres'))n.credentials={postgres:{id:'gatheringTestPg',name:'Gathering test database'}};
 const manual=structuredClone(base),keep=['Manual Planner Test','Claim Strategy Jobs','Expand Claimed Jobs','Prepare Strategy','Reserve Strategy AI','AI Allowed?','Compose With Groq','Validate and Assemble Draft','Save Versioned Strategy'];manual.nodes=manual.nodes.filter(n=>keep.includes(n.name));manual.connections=Object.fromEntries(Object.entries(manual.connections).filter(([name])=>keep.includes(name)));
 fs.writeFileSync(dir+'/manual.json',JSON.stringify(manual));cli(['import:workflow','--input='+dir+'/manual.json']);cli(['execute','--id='+manual.id]);
 const r=(await db.query('SELECT strategy_report(940071,'+j.job_id+') AS report')).rows[0].report;
 assert.equal(r.job_status,'completed');assert(r.plan.messages[0].body.includes('O\'Brien'));assert(r.plan.messages[0].body.includes('"website"'));assert.equal(r.execution_authorized,false);assert.equal(r.plan.generation.method,'deterministic_template');
 assert.equal(r.plan.scores.version,'lead_scores_v1');assert.equal(r.plan.scores.outreach_readiness.score,0);assert.equal(r.plan.scores.automatic_prioritization,false);
 await db.query('UPDATE strategy_controls SET enabled=false WHERE id');
 base.id='strategyApiTest';base.nodes=base.nodes.filter(n=>!['Every Minute','Manual Planner Test','Error Trigger'].includes(n.name));delete base.connections['Every Minute'];delete base.connections['Manual Planner Test'];delete base.connections['Error Trigger'];
 fs.writeFileSync(dir+'/api.json',JSON.stringify(base));cli(['import:workflow','--input='+dir+'/api.json']);cli(['update:workflow','--id='+base.id,'--active=true']);
 const log=fs.openSync(dir+'/server.log','a',0o600);server=cp.spawn('n8n',['start'],{env,stdio:['ignore',log,log]});fs.closeSync(log);
 const call=async(path,body,authorized=true)=>{const res=await fetch('http://127.0.0.1:5686/webhook/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(authorized?{[auth.name]:auth.value}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(5000)});let value;try{value=await res.json();}catch{}return {status:res.status,value};};
 let ready;for(let i=0;i<60;i++){try{ready=await call('strategy-report?org_id=940071&job_id='+j.job_id);if(ready.status===200&&ready.value?.job_id===j.job_id)break;}catch{}await new Promise(r=>setTimeout(r,1000));}
 assert.equal(ready?.value?.job_id,j.job_id);
 assert([401,403].includes((await call('strategy-report?org_id=940071&job_id='+j.job_id,null,false)).status));
 assert.equal((await call('strategy-report?org_id=1&job_id='+j.job_id)).status,404);
 assert.equal((await call('strategy-campaign',{org_id:940071,config:{}})).status,400);
 assert.equal((await call('strategy-preview',{org_id:940071,campaign_id:c.campaign_id,lead_id:lid})).value.preview,true);
 const accepted=await call('strategy-request',{...request,request_id:'strategy-api-'+sid});assert.equal(accepted.status,202);assert.equal(accepted.value.status,'pending');
 const batch=await call('strategy-batch',{org_id:940071,campaign_id:c.campaign_id,lead_ids:[lid],request_id:'strategy-batch-'+sid});assert.equal(batch.status,202);assert.equal(batch.value.results[0].http_status,202);
 const approved=await call('strategy-approval',{org_id:940071,plan_id:r.plan_id,content_hash:r.content_hash,actor:'fixture-reviewer',action:'approve'});assert.equal(approved.value.approved_content,true);assert.equal(approved.value.execution_authorized,false);
 assert.equal((await db.query('SELECT count(*)::int n FROM strategy_ai_requests WHERE org_id=940071')).rows[0].n,0);
 console.log('PASS real n8n planner and HTTP APIs: template fallback, quote-safe SQL, preview, immediate 202, approval, authentication, tenant isolation, zero AI calls.');
}finally{if(server)server.kill('SIGTERM');await db.query("UPDATE strategy_jobs SET status='cancelled' WHERE org_id=940071 AND status='pending'");if(controls)await db.query('UPDATE strategy_controls SET enabled='+(controls.enabled?'true':'false')+' WHERE id');await db.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
