'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),cp=require('node:child_process');
const dir='.local/messenger-strategy-20261116',id='27W04lgTGdgFMWUx';
async function main(){
 fs.mkdirSync(dir,{recursive:true});assert(!fs.existsSync(dir+'/attempt.json'),'RECONCILE_EXISTING_INSTALL');
 const pool=require('../dashboard/start-local-auth.cjs').localPool({registryWrite:true});
 try{
  assert.equal((await pool.query("SELECT count(*)::int n FROM strategy_jobs WHERE status IN ('pending','processing')")).rows[0].n,0,'STRATEGY_WORK_IN_PROGRESS');
  const old=(await pool.query("SELECT pg_get_functiondef('strategy_context(integer,bigint,integer)'::regprocedure) AS definition,proacl::text AS grants FROM pg_proc WHERE oid='strategy_context(integer,bigint,integer)'::regprocedure")).rows[0];
  const migration=fs.readFileSync('database/migrations/062_messenger_manual_strategy_context.sql','utf8');
  const body=migration.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');
  await pool.query('BEGIN');try{
   const before=(await pool.query('SELECT strategy_context(1,1,493) AS context')).rows[0].context;
   await pool.query(body);
   assert.deepEqual((await pool.query('SELECT strategy_context(1,1,493) AS context')).rows[0].context,before,'EXISTING_CONTEXT_CHANGED');
   const config=require('../lead-strategy/runtime.cjs').campaign({org_id:1,config:{name:'Rollback-only Messenger check',mode:'ai',channels:['messenger'],sequence:[{channel:'messenger',delay_days:0}],timezone:'Asia/Karachi',sender:{name:'Test',company:'Test'},offer:{name:'Demo',description:'A demonstration.',approved_points:['Services are presented online.']},cta:{text:'Would a demo be useful?'}}}).config;
   const campaign=(await pool.query('INSERT INTO strategy_campaigns(org_id) VALUES(1) RETURNING id')).rows[0].id;
   await pool.query('INSERT INTO strategy_campaign_versions(org_id,campaign_id,version,config) VALUES(1,$1,1,$2)',[campaign,config]);
   const current=(await pool.query('SELECT strategy_context(1,$1,493) AS context',[campaign])).rows[0].context;
   assert(current?.facebook_pages?.length);assert.equal(require('../lead-strategy/v2/messenger.cjs').readiness(current).status,'ready');
   assert.equal((await pool.query('SELECT strategy_context(999999,$1,493) AS context',[campaign])).rows[0].context,null);
   const grants=(await pool.query("SELECT proacl::text AS grants FROM pg_proc WHERE oid='strategy_context(integer,bigint,integer)'::regprocedure")).rows[0].grants;assert.equal(grants,old.grants);
  }finally{await pool.query('ROLLBACK');}
  const backup=cp.spawnSync('docker',['exec','postgres_db','pg_dump','-U','n8n_user','-d','lead_db','-Fc'],{maxBuffer:128*1024*1024,timeout:60000});assert.equal(backup.status,0,'BACKUP_FAILED');assert(backup.stdout.length>1000);fs.writeFileSync(dir+'/before.dump',backup.stdout);
  fs.writeFileSync(dir+'/rollback.sql','BEGIN;\n'+old.definition+';\nDROP FUNCTION strategy_context_pre062(integer,bigint,integer);\nCOMMIT;\n');
  const key=fs.readFileSync(['.local/n8n-api-key','.local/n8n-api-key.txt'].find(f=>fs.existsSync(f)),'utf8').trim();
  const api=async(method='GET',body)=>{const r=await fetch('http://127.0.0.1:5678/api/v1/workflows/'+id,{method,headers:{'X-N8N-API-KEY':key,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});assert(r.ok,'WORKFLOW_OPERATION_UNCONFIRMED');return r.json();};
  const before=await api(),next=structuredClone(before),source=JSON.parse(fs.readFileSync('workflows/06C_outreach_strategy_generator.json','utf8')),names=[];
  for(const node of next.nodes){if(!node.parameters?.jsCode?.startsWith('const rt=('))continue;const wanted=source.nodes.find(n=>n.name===node.name);assert(wanted?.parameters?.jsCode?.startsWith('const rt=('));
   const oldTail=node.parameters.jsCode.match(/LEGACY_TAIL_BASE64:([A-Za-z0-9+/=]+)/)?.[1],newTail=wanted.parameters.jsCode.match(/LEGACY_TAIL_BASE64:([A-Za-z0-9+/=]+)/)?.[1];
   if(oldTail||newTail)assert.equal(oldTail,newTail,'LEGACY_ROUTING_TAIL_CHANGED');else assert.equal(node.parameters.jsCode.slice(node.parameters.jsCode.indexOf('})();')+5),wanted.parameters.jsCode.slice(wanted.parameters.jsCode.indexOf('})();')+5),'ROUTING_TAIL_CHANGED');
   if(node.parameters.jsCode!==wanted.parameters.jsCode){node.parameters.jsCode=wanted.parameters.jsCode;names.push(node.name);}
  }
  assert.equal(names.length,9,'EXPECTED_NINE_SHARED_RUNTIME_NODES');const payload=w=>({name:w.name,nodes:w.nodes,connections:w.connections,settings:w.settings,staticData:w.staticData??null});
  fs.writeFileSync(dir+'/workflow-rollback.json',JSON.stringify(payload(before)));fs.writeFileSync(dir+'/attempt.json',JSON.stringify({at:new Date().toISOString(),phase:'apply_context_and_runtime'}),{flag:'wx'});
  await pool.query(migration);
  try{await api('PUT',payload(next));}catch{}
  const installed=await api();assert.equal(installed.active,before.active);assert.deepEqual(payload(installed),payload(next),'WORKFLOW_READBACK_MISMATCH');
  const result={installed:true,migration:62,changed_nodes:names,existing_contexts_preserved:true,scratch_changes_rolled_back:true,model_calls:0,messages_sent:0};fs.writeFileSync(dir+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await pool.end();}
}
main().catch(e=>{console.error(e.code||e.message?.slice(0,150)||'MESSENGER_INSTALL_UNCONFIRMED');process.exitCode=1;});
