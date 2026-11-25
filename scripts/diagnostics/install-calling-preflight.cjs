'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const dir='.local/calling-preflight-install-20261116';
async function main(){
 fs.mkdirSync(dir,{recursive:true});assert(!fs.existsSync(dir+'/attempt.json'),'RECONCILE_EXISTING_INSTALL');const pool=require('../dashboard/start-local-auth.cjs').localPool({registryWrite:true});
 try{
  assert.equal((await pool.query("SELECT to_regclass('calling_account_preflights') name")).rows[0].name,null,'ALREADY_INSTALLED');
  const backup=cp.spawnSync('docker',['exec','postgres_db','pg_dump','-U','n8n_user','-d','lead_db','-Fc'],{timeout:60000,maxBuffer:128*1024*1024});assert.equal(backup.status,0,'BACKUP_FAILED');assert(backup.stdout.length>1000);fs.writeFileSync(dir+'/before.dump',backup.stdout);
  fs.writeFileSync(dir+'/rollback.sql','-- Read-only check history only; archive it if needed before reverting.\nBEGIN;\nDROP TABLE calling_account_preflights;\nCOMMIT;\n');fs.writeFileSync(dir+'/attempt.json',JSON.stringify({at:new Date().toISOString()}),{flag:'wx'});
  await pool.query(fs.readFileSync('database/migrations/067_calling_account_preflight.sql','utf8'));
  const db=await pool.connect();try{
   await db.query('BEGIN');const org=(await db.query("INSERT INTO organizations(org_name,subscription_tier,max_users,monthly_credit_limit,credits_used,status) VALUES('Rollback preflight','freemium',1,0,0,'active') RETURNING id")).rows[0].id,subject=crypto.randomBytes(32).toString('hex');await db.query("INSERT INTO org_sender_memberships(org_id,subject,role,active) VALUES($1,$2,'owner',true)",[org,subject]);
   await db.query("INSERT INTO calling_accounts(org_id,request_id,key_fingerprint,agent_id,agent_version,secrets) VALUES($1,$2,$3,$4,1,'{}')",[org,crypto.randomUUID(),crypto.randomBytes(32).toString('hex'),'rollback_check_'+org]);
   const service=require('../dashboard/calling-preflight.cjs').service({identity:{principal:async()=>({org_id:org,role:'owner',active:true,subject})},pool:db,transaction:fn=>fn(db),vault:{open:()=>({api_key:'fixture'})},provider:{inspect:async()=>{throw Error('fixture offline');}}});
   const r=await service.check('fixture',{org_id:org,expected_account_version:1});assert.equal(r.provider_checks_passed,false);assert.equal((await service.status('fixture',{org_id:org})).latest.checks.provider_lookup,false);assert.equal((await db.query('SELECT state FROM calling_accounts WHERE org_id=$1',[org])).rows[0].state,'pending_setup');
   await db.query('UPDATE calling_accounts SET version=version+1 WHERE org_id=$1',[org]);assert.equal((await service.status('fixture',{org_id:org})).latest,null);
  }finally{await db.query('ROLLBACK');db.release();}
  const configDir='.local/calling-transport';fs.mkdirSync(configDir,{recursive:true});if(!fs.existsSync(configDir+'/config.json'))fs.writeFileSync(configDir+'/config.json',JSON.stringify({enabled:false,org_id:null}),{flag:'wx'});if(!fs.existsSync(configDir+'/tool-bindings.json'))fs.writeFileSync(configDir+'/tool-bindings.json','[]\n',{flag:'wx'});
  const result={installed:true,migration:67,real_sql_check_passed:true,fixtures_rolled_back:true,provider_requests:0,calls_placed:0,schedules_created:0,send_enabled:false};fs.writeFileSync(dir+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await pool.end();}
}
if(require.main===module)main().catch(e=>{console.error((e.code||'INSTALL_FAILED')+': '+e.message?.slice(0,120));process.exitCode=1;});
