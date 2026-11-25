'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),cp=require('node:child_process');
const dir='.local/workspace-enrollment-20261116';
async function main(){fs.mkdirSync(dir,{recursive:true});assert(!fs.existsSync(dir+'/attempt.json'),'RECONCILE_EXISTING_INSTALL');const pool=require('../dashboard/start-local-auth.cjs').localPool({registryWrite:true});try{
 assert.equal((await pool.query("SELECT to_regclass('workspace_enrollments') AS name")).rows[0].name,null,'ALREADY_INSTALLED');
 const before=(await pool.query('SELECT count(*)::int organizations FROM organizations')).rows[0];
 const backup=cp.spawnSync('docker',['exec','postgres_db','pg_dump','-U','n8n_user','-d','lead_db','-Fc'],{timeout:60000,maxBuffer:128*1024*1024});assert.equal(backup.status,0,'BACKUP_FAILED');assert(backup.stdout.length>1000);fs.writeFileSync(dir+'/before.dump',backup.stdout);
 fs.writeFileSync(dir+'/rollback.sql','-- Reconcile any real enrollments before rollback; preserve customer organizations and memberships.\nBEGIN;\nDROP TABLE workspace_enrollments;\nCOMMIT;\n');fs.writeFileSync(dir+'/attempt.json',JSON.stringify({at:new Date().toISOString()}),{flag:'wx'});
 await pool.query(fs.readFileSync('database/migrations/064_workspace_enrollment.sql','utf8'));assert.equal((await pool.query('SELECT count(*)::int organizations FROM organizations')).rows[0].organizations,before.organizations);assert.equal((await pool.query('SELECT count(*)::int n FROM workspace_enrollments')).rows[0].n,0);
 const result={installed:true,migration:64,customer_workspaces_created:0,credits_granted:0,ai_requests_granted:0,provider_calls:0,messages_sent:0};fs.writeFileSync(dir+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await pool.end();}}
if(require.main===module)main().catch(e=>{console.error((e.code||'INSTALL_FAILED')+': '+e.message?.slice(0,150));process.exitCode=1;});
