'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),cp=require('node:child_process'),crypto=require('node:crypto');
const dir='.local/sms-gate-install-20261116',id='27W04lgTGdgFMWUx';
async function main(){
 fs.mkdirSync(dir,{recursive:true});assert(!fs.existsSync(dir+'/attempt.json'),'RECONCILE_EXISTING_INSTALL');
 const pool=require('../dashboard/start-local-auth.cjs').localPool({registryWrite:true});
 try{
  assert.equal((await pool.query("SELECT to_regclass('sms_connections') AS table_name")).rows[0].table_name,null,'SMS_TABLES_ALREADY_PRESENT');
  assert.equal((await pool.query("SELECT count(*)::int n FROM strategy_jobs WHERE status IN('pending','processing')")).rows[0].n,0,'STRATEGY_WORK_IN_PROGRESS');
  const legacy=(await pool.query("SELECT id,active FROM workflow_entity WHERE name ILIKE '%SMS%' AND nodes::text LIKE '%enriched_leads%'")).rows;assert(legacy.every(w=>w.active===false),'LEGACY_SMS_MUST_REMAIN_INACTIVE');
  const backup=cp.spawnSync('docker',['exec','postgres_db','pg_dump','-U','n8n_user','-d','lead_db','-Fc'],{timeout:60000,maxBuffer:128*1024*1024});assert.equal(backup.status,0,'BACKUP_FAILED');assert(backup.stdout.length>1000);fs.writeFileSync(dir+'/before.dump',backup.stdout);
  const key=fs.readFileSync(['.local/n8n-api-key','.local/n8n-api-key.txt'].find(f=>fs.existsSync(f)),'utf8').trim();
  const api=async(method='GET',body)=>{const r=await fetch('http://127.0.0.1:5678/api/v1/workflows/'+id,{method,headers:{'X-N8N-API-KEY':key,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});assert(r.ok,'WORKFLOW_OPERATION_UNCONFIRMED');return r.json();};
  const before=await api(),next=structuredClone(before),source=JSON.parse(fs.readFileSync('workflows/06C_outreach_strategy_generator.json','utf8')),names=['Prepare Strategy','Validate and Assemble Draft','Build Preview'];
  for(const name of names){const node=next.nodes.find(n=>n.name===name),wanted=source.nodes.find(n=>n.name===name);assert.equal(node.parameters.jsCode.match(/LEGACY_TAIL_BASE64:([A-Za-z0-9+/=]+)/)?.[1],wanted.parameters.jsCode.match(/LEGACY_TAIL_BASE64:([A-Za-z0-9+/=]+)/)?.[1],'ROUTING_TAIL_CHANGED');node.parameters.jsCode=wanted.parameters.jsCode;}
  const payload=w=>({name:w.name,nodes:w.nodes,connections:w.connections,settings:w.settings,staticData:w.staticData??null});
  fs.writeFileSync(dir+'/workflow-rollback.json',JSON.stringify(payload(before)));fs.writeFileSync(dir+'/rollback.sql','-- Only before real SMS connections/releases exist; otherwise reconcile first.\nBEGIN;\nDROP TABLE sms_events,sms_stops,sms_dispatches,sms_connections;\nCOMMIT;\n');
  fs.writeFileSync(dir+'/attempt.json',JSON.stringify({at:new Date().toISOString(),scope:'local SMS foundation'}),{flag:'wx'});
  await pool.query(fs.readFileSync('database/migrations/063_android_sms.sql','utf8'));
  fs.mkdirSync('.local/sms-gate',{recursive:true});if(!fs.existsSync('.local/sms-gate/encryption.key'))fs.writeFileSync('.local/sms-gate/encryption.key',crypto.randomBytes(32),{flag:'wx',mode:0o600});
  if(!fs.existsSync('.local/sms-gate/config.json'))fs.writeFileSync('.local/sms-gate/config.json',JSON.stringify({callback_base:null},null,2),{flag:'wx'});
  try{await api('PUT',payload(next));}catch{}
  const installed=await api();assert.equal(installed.active,before.active);assert.deepEqual(payload(installed),payload(next),'WORKFLOW_UPDATE_UNCONFIRMED');
  const counts=(await pool.query('SELECT (SELECT count(*)::int FROM sms_connections) connections,(SELECT count(*)::int FROM sms_dispatches) dispatches')).rows[0];assert.equal(counts.connections,0);assert.equal(counts.dispatches,0);
  const result={installed:true,migration:63,planner_nodes_updated:names,legacy_sms_unchanged:true,phones_connected:0,sms_queued:0,model_calls:0,provider_calls:0,public_reply_endpoint_pending:true};fs.writeFileSync(dir+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await pool.end();}
}
if(require.main===module)main().catch(e=>{console.error((e.code||'INSTALL_FAILED')+': '+e.message?.slice(0,180));process.exitCode=1;});
