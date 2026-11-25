'use strict';
// Installs inactive templates only. Never creates credentials, approves plans or sends.
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const dir='.local/smtp-deployment-036',pkg='.local/smtp-integration-036-20261025';
const ids=['managedSmtpsend','managedSmtppoll','managedSmtpcheck'];
function docker(args,input,binary=false){const r=cp.spawnSync('docker',args,{input,encoding:binary?undefined:'utf8',timeout:120000,maxBuffer:100e6});assert.equal(r.status,0,'Docker operation failed: '+args.slice(0,3).join(' ')+'; private output suppressed');return binary?r.stdout:r.stdout.trim();}
const sql=q=>docker(['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],q),json=q=>JSON.parse(sql(q));
const funcs=s=>[...s.matchAll(/CREATE OR REPLACE FUNCTION\s+(\w+)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/g)].map(m=>({name:m[1],body:m[2].trim()}));
function snapshot(){return json("SELECT json_build_object('campaigns',(SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM strategy_campaigns t),'contacts',(SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM lead_contacts t),'activities',(SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM outreach_activities t),'plans',(SELECT count(*) FROM strategy_plans),'ai_requests',(SELECT count(*) FROM strategy_ai_requests),'workflows',(SELECT md5(jsonb_agg(jsonb_build_object('id',id,'active',active,'nodes',nodes,'connections',connections) ORDER BY id)::text) FROM workflow_entity WHERE id NOT IN ('managedSmtpsend','managedSmtppoll','managedSmtpcheck')));");}
function verify(){
 for(const f of funcs(fs.readFileSync(dir+'/036.sql','utf8')))assert.equal(sql("SELECT prosrc FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='"+f.name+"'").trim(),f.body,'SQL mismatch: '+f.name);
 assert.deepEqual(snapshot(),JSON.parse(fs.readFileSync(dir+'/before.json')));
 for(const w of JSON.parse(fs.readFileSync(pkg+'/workflows.json'))){const actual=json("SELECT json_build_object('active',active,'nodes',nodes,'connections',connections) FROM workflow_entity WHERE id='"+w.id+"'");assert.equal(actual.active,false);assert.deepEqual(actual.nodes,w.nodes);assert.deepEqual(actual.connections,w.connections);}
 assert.equal(sql("SELECT count(*) FROM sender_connections"),'0');
 const result={checked_at:new Date().toISOString(),migration:36,sql_verified:true,existing_state_preserved:true,inactive_workflows:ids,emails_sent:0,customer_api_exposed:false,credentials_configured:false};
 fs.writeFileSync('documentation/strategy-contract-v2/smtp-036-deployment.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
try{
 if(process.argv[2]==='verify')verify();
 else{
  assert.equal(process.argv[2],'apply');assert(!fs.existsSync(dir),'Deployment directory exists; inspect progress before continuing');
  assert.equal(sql("SELECT count(*) FROM execution_entity WHERE status IN ('new','running','waiting')"),'0','Executions present; restart blocked');
  assert.equal(sql("SELECT count(*) FROM strategy_jobs WHERE status IN ('pending','processing')"),'0');
  assert.equal(sql('SELECT enabled FROM strategy_controls WHERE id'),'f');
  assert.equal(sql("SELECT count(*) FROM workflow_entity WHERE id IN ('managedSmtpsend','managedSmtppoll','managedSmtpcheck')"),'0');
  assert.equal(sql("SELECT count(*) FROM pg_proc WHERE proname='outreach_smtp_begin'"),'0');
  const baseline=funcs(fs.readFileSync('database/migrations/035_sender_connections.sql','utf8')).find(f=>f.name==='sender_connection_bind');
  assert.equal(sql("SELECT prosrc FROM pg_proc WHERE oid='sender_connection_bind(integer,text,text,bigint,integer)'::regprocedure").trim(),baseline.body);
  assert.equal(docker(['exec','n8n','node','-e',"console.log(require('fs').existsSync('/home/node/.n8n/custom/ManagedSender.node.js'))"]),'false');
  const project=sql("SELECT \"projectId\" FROM shared_workflow WHERE \"workflowId\"='gTjsUEP8VLlxKfWf' LIMIT 1");assert(/^[A-Za-z0-9]+$/.test(project));
  fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/before.json',JSON.stringify(snapshot()));
  fs.writeFileSync(dir+'/rollback.sql','BEGIN;\n'+sql("SELECT pg_get_functiondef('sender_connection_bind(integer,text,text,bigint,integer)'::regprocedure)")+'\nDROP FUNCTION outreach_smtp_begin(jsonb),sender_connection_smtp_gate(integer,jsonb),outreach_smtp_finish(jsonb),outreach_imap_scan_finish(jsonb);\nCOMMIT;\n');
  const dump=docker(['exec','postgres_db','pg_dump','-U','n8n_user','-d','lead_db','-Fc'],undefined,true);assert(dump.length>1000);fs.writeFileSync(dir+'/before.dump',dump);assert(docker(['exec','-i','postgres_db','pg_restore','--list'],dump).includes('TABLE DATA public lead_contacts'));
  const progress={backup_verified:true,migration_applied:false,runtime_copied:false,imported:false,restarted:false};const save=()=>fs.writeFileSync(dir+'/progress.json',JSON.stringify(progress,null,2));save();
  fs.copyFileSync('database/migrations/036_smtp_receipts.sql',dir+'/036.sql');sql(fs.readFileSync(dir+'/036.sql','utf8'));progress.migration_applied=true;save();
  docker(['exec','n8n','mkdir','-p','/home/node/.n8n/custom']);docker(['cp',pkg+'/custom/.','n8n:/home/node/.n8n/custom/']);progress.runtime_copied=true;save();
  docker(['cp',pkg+'/workflows.json','n8n:/tmp/smtp-036-workflows.json']);docker(['exec','n8n','n8n','import:workflow','--input=/tmp/smtp-036-workflows.json','--projectId='+project]);progress.imported=true;save();
  docker(['restart','--time','60','n8n']);progress.restarted=true;save();verify();
 }
}catch(e){console.error(e.message);process.exitCode=1;}
