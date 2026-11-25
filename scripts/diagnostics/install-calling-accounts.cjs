'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict'),cp=require('node:child_process');
const dir='.local/calling-accounts-install-20261116';
async function main(){
 fs.mkdirSync(dir,{recursive:true});assert(!fs.existsSync(dir+'/attempt.json'),'RECONCILE_EXISTING_INSTALL');
 const pool=require('../dashboard/start-local-auth.cjs').localPool({registryWrite:true});
 try{
  assert.equal((await pool.query("SELECT to_regclass('calling_accounts') AS name")).rows[0].name,null,'ALREADY_INSTALLED');
  const backup=cp.spawnSync('docker',['exec','postgres_db','pg_dump','-U','n8n_user','-d','lead_db','-Fc'],{timeout:60000,maxBuffer:128*1024*1024});assert.equal(backup.status,0,'BACKUP_FAILED');assert(backup.stdout.length>1000);fs.writeFileSync(dir+'/before.dump',backup.stdout);
  fs.writeFileSync(dir+'/rollback.sql','-- Preserve/reconcile any real enrolled credentials before rollback.\nBEGIN;\nDROP TABLE calling_accounts;\nCOMMIT;\n');
  fs.mkdirSync('.local/calling-accounts',{recursive:true});const keyfile='.local/calling-accounts/encryption.key';if(!fs.existsSync(keyfile))fs.writeFileSync(keyfile,crypto.randomBytes(32),{flag:'wx'});assert.equal(fs.readFileSync(keyfile).length,32);
  fs.writeFileSync(dir+'/attempt.json',JSON.stringify({at:new Date().toISOString()}),{flag:'wx'});
  await pool.query(fs.readFileSync('database/migrations/065_calling_accounts.sql','utf8'));
  const client=await pool.connect();try{
   await client.query('BEGIN');
   const org=(await client.query('SELECT id FROM organizations ORDER BY id LIMIT 1')).rows[0].id;
   await client.query("INSERT INTO calling_accounts(org_id,request_id,key_fingerprint,agent_id,agent_version,secrets) VALUES($1,$2,$3,$4,1,'{}')",[org,crypto.randomUUID(),'a'.repeat(64),'test-rollback-only']);
   assert.equal((await client.query('SELECT state FROM calling_accounts WHERE org_id=$1',[org])).rows[0].state,'pending_setup');
   await client.query('SAVEPOINT invalid_state');await assert.rejects(client.query("UPDATE calling_accounts SET state='ready' WHERE org_id=$1",[org]),e=>e.code==='23514');await client.query('ROLLBACK TO SAVEPOINT invalid_state');
  }finally{await client.query('ROLLBACK');client.release();}
  assert.equal((await pool.query('SELECT count(*)::int n FROM calling_accounts')).rows[0].n,0);
  const result={installed:true,migration:65,credential_rows:0,campaigns_modified:0,wallet_credit_granted:0,provider_requests:0,calls_placed:0};fs.writeFileSync(dir+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await pool.end();}
}
if(require.main===module)main().catch(e=>{console.error((e.code||'INSTALL_FAILED')+': '+e.message?.slice(0,120));process.exitCode=1;});
