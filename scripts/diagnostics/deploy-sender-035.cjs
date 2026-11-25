'use strict';
// Authorized local registry deployment only. No credentials, membership or sender enabled.
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const dir='.local/sender-registry-035';
function docker(args,input,binary=false){const r=cp.spawnSync('docker',args,{input,encoding:binary?undefined:'utf8',timeout:120000,maxBuffer:100e6});assert.equal(r.status,0,'Docker operation failed; private output suppressed');return binary?r.stdout:r.stdout.trim();}
const sql=q=>docker(['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],q);
const json=q=>JSON.parse(sql(q));
function snapshot(){return json("SELECT json_build_object('contacts',(SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM lead_contacts t),'campaigns',(SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM strategy_campaigns t),'plans',(SELECT count(*) FROM strategy_plans),'activities',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) FROM outreach_activities t),'workflows',(SELECT md5(jsonb_agg(jsonb_build_object('id',id,'active',active,'nodes',nodes,'connections',connections) ORDER BY id)::text) FROM workflow_entity),'ai_requests',(SELECT count(*) FROM strategy_ai_requests));");}
function functions(text){return [...text.matchAll(/CREATE OR REPLACE FUNCTION\s+(\w+)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/g)].map(m=>({name:m[1],body:m[2].trim()}));}
function verify(){
 for(const f of functions(fs.readFileSync(dir+'/035.sql','utf8'))){assert.equal(sql("SELECT prosrc FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='"+f.name+"'").trim(),f.body,'Function differs: '+f.name);}
 assert.deepEqual(snapshot(),JSON.parse(fs.readFileSync(dir+'/before.json')),'Existing state changed');
 assert.equal(sql('SELECT (SELECT count(*) FROM sender_connections)+(SELECT count(*) FROM org_sender_memberships)'),'0');
 assert.equal(json("SELECT sender_connection_gate(1,'{}'::jsonb)").allowed,true);
 const result={checked_at:new Date().toISOString(),migration:35,sql_verified:true,existing_data_preserved:true,connections_created:0,workflows_imported:0,emails_sent:0,smtp_enabled:false,customer_api_exposed:false};
 fs.writeFileSync('documentation/strategy-contract-v2/sender-035-deployment.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
try{
 if(process.argv[2]==='verify')verify();
 else{
  assert.equal(process.argv[2],'apply');assert(!fs.existsSync(dir),'Existing deployment directory: inspect before continuing');
  assert.equal(sql("SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('sender_connections','org_sender_memberships')"),'0');
  const old=functions(fs.readFileSync('database/migrations/028_email_contact_gate.sql','utf8')).find(f=>f.name==='outreach_email_step_begin');
  assert(old,'Expected baseline function absent');
  assert.equal(sql("SELECT prosrc FROM pg_proc WHERE oid='outreach_email_step_begin(jsonb)'::regprocedure").trim(),old.body,'Begin baseline changed');
  assert.equal(sql('SELECT enabled FROM strategy_controls WHERE id'),'f');
  assert.equal(sql("SELECT count(*) FROM strategy_jobs WHERE status IN ('pending','processing')"),'0');
  assert.equal(sql("SELECT count(*) FROM workflow_entity WHERE id IN ('27W04lgTGdgFMWUx','gTjsUEP8VLlxKfWf','TrgeZrs4ILZnrXuJ') AND active"),'0');
  fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/before.json',JSON.stringify(snapshot()));
  const rollback='BEGIN;\n'+sql("SELECT pg_get_functiondef('outreach_email_step_begin(jsonb)'::regprocedure)")+ '\nDROP FUNCTION sender_connection_bind(integer,text,text,bigint,integer),sender_connection_gate(integer,jsonb),sender_connection_checked(integer,text,integer,jsonb),sender_connection_manage(integer,text,jsonb);\nDROP TABLE sender_connections;\nDROP TABLE org_sender_memberships;\nCOMMIT;\n';
  fs.writeFileSync(dir+'/rollback.sql',rollback);
  const dump=docker(['exec','postgres_db','pg_dump','-U','n8n_user','-d','lead_db','-Fc'],undefined,true);assert(dump.length>1000);fs.writeFileSync(dir+'/before.dump',dump);
  assert(docker(['exec','-i','postgres_db','pg_restore','--list'],dump).includes('TABLE DATA public lead_contacts'));
  fs.copyFileSync('database/migrations/035_sender_connections.sql',dir+'/035.sql');sql(fs.readFileSync(dir+'/035.sql','utf8'));verify();
 }
}catch(e){console.error(e.message);process.exitCode=1;}
