'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),cp=require('node:child_process');
const dir='.local/calling-lifecycle-install-20261116';
async function main(){
 fs.mkdirSync(dir,{recursive:true});assert(!fs.existsSync(dir+'/attempt.json'),'RECONCILE_EXISTING_INSTALL');const pool=require('../dashboard/start-local-auth.cjs').localPool({registryWrite:true});
 try{
  assert.equal((await pool.query("SELECT to_regclass('calling_account_changes') name")).rows[0].name,null,'ALREADY_INSTALLED');
  const before=(await pool.query('SELECT count(*)::int n FROM calling_accounts')).rows[0].n;
  const backup=cp.spawnSync('docker',['exec','postgres_db','pg_dump','-U','n8n_user','-d','lead_db','-Fc'],{timeout:60000,maxBuffer:128*1024*1024});assert.equal(backup.status,0,'BACKUP_FAILED');assert(backup.stdout.length>1000);fs.writeFileSync(dir+'/before.dump',backup.stdout);
  fs.writeFileSync(dir+'/rollback.sql',`-- Stop account changes first. If used, preserve receipts and reconcile customer state before restoring schema.\nBEGIN;\nDO $$ BEGIN IF EXISTS(SELECT 1 FROM calling_account_changes) OR EXISTS(SELECT 1 FROM calling_accounts WHERE version<>1 OR state<>'pending_setup') THEN RAISE EXCEPTION 'RECONCILE_USED_LIFECYCLE_BEFORE_ROLLBACK'; END IF; END $$;\nDROP TABLE calling_account_changes;\nALTER TABLE calling_accounts DROP CONSTRAINT calling_accounts_secret_state_check;\nALTER TABLE calling_accounts DROP CONSTRAINT calling_accounts_state_check;\nALTER TABLE calling_accounts ADD CONSTRAINT calling_accounts_state_check CHECK(state='pending_setup');\nALTER TABLE calling_accounts ALTER COLUMN key_fingerprint SET NOT NULL;\nALTER TABLE calling_accounts ALTER COLUMN secrets SET NOT NULL;\nALTER TABLE calling_accounts DROP COLUMN version;\nCOMMIT;\n`);
  fs.writeFileSync(dir+'/attempt.json',JSON.stringify({at:new Date().toISOString()}),{flag:'wx'});await pool.query(fs.readFileSync('database/migrations/066_calling_account_lifecycle.sql','utf8'));
  assert.equal((await pool.query('SELECT count(*)::int n FROM calling_accounts')).rows[0].n,before);assert.equal((await pool.query('SELECT count(*)::int n FROM calling_account_changes')).rows[0].n,0);
  const result={installed:true,migration:66,existing_accounts_preserved:before,campaigns_modified:0,provider_requests:0,calls_placed:0,funds_added:0};fs.writeFileSync(dir+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await pool.end();}
}
if(require.main===module)main().catch(e=>{console.error((e.code||'INSTALL_FAILED')+': '+e.message?.slice(0,120));process.exitCode=1;});
