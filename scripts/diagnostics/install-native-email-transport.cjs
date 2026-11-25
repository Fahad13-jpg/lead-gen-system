'use strict';
// Local function compatibility install only. Never authorizes/releases/sends a plan.
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const{localPool}=require('../dashboard/start-local-auth.cjs');
async function main(){
 assert(process.argv.includes('--apply-local'),'LOCAL_INSTALL_SCOPE_REQUIRED');
 const evidence=JSON.parse(fs.readFileSync('.local/native-email-transport-20261109/result.json','utf8'));assert(evidence.passed&&evidence.rolled_back&&!evidence.live_applied);
 const pool=localPool({registryWrite:true}),dir='.local/native-email-055-install-'+Date.now();let db,transaction=false;
 const names=['outreach_email_begin','outreach_email_step_begin','outreach_smtp_begin'],guard="IF v.body->>'execution_authorized' IS DISTINCT FROM 'true' THEN";
 try{db=await pool.connect();
  const definitions=async()=>(await db.query("SELECT p.proname name,pg_get_userbyid(p.proowner) owner,p.proacl::text acl,pg_get_functiondef(p.oid) definition FROM pg_proc p WHERE p.oid IN ('outreach_email_begin(jsonb)'::regprocedure,'outreach_email_step_begin(jsonb)'::regprocedure,'outreach_smtp_begin(jsonb)'::regprocedure) ORDER BY p.proname")).rows;
  const state=async()=>(await db.query(`SELECT jsonb_build_object('controls',(SELECT jsonb_agg(to_jsonb(c)) FROM strategy_controls c),'requests',(SELECT md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY lease)::text,'')) FROM strategy_ai_requests r),'plans',(SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY id)::text,'')) FROM strategy_plans p),'approvals',(SELECT md5(coalesce(jsonb_agg(to_jsonb(a) ORDER BY id)::text,'')) FROM strategy_approvals a),'activities',(SELECT count(*) FROM outreach_activities)) result`)).rows[0].result;
  assert.equal((await db.query('SELECT enabled FROM strategy_controls WHERE id')).rows[0].enabled,false);
  assert.equal((await db.query("SELECT count(*)::integer n FROM strategy_jobs WHERE status='processing'")).rows[0].n,0);
  const before=await definitions();assert.equal(before.length,3);for(const item of before)assert.equal(item.definition.split(guard).length,2,'LIVE_GUARD_CHANGED_REVIEW_REQUIRED');
  assert.equal((await db.query("SELECT to_regprocedure('outreach_email_transport_marker_allowed(jsonb)') IS NULL absent")).rows[0].absent,true,'ALREADY_INSTALLED_DO_NOT_REPLAY');
  fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/before.json',JSON.stringify(before,null,2));fs.writeFileSync(dir+'/rollback.sql','BEGIN;\n'+before.map(x=>x.definition).join('\n')+'\nDROP FUNCTION outreach_email_transport_marker_allowed(jsonb);\nCOMMIT;\n');
  assert.equal(cp.spawnSync('git',['check-ignore',dir+'/before.dump'],{stdio:'ignore'}).status,0);
  const dump=cp.spawnSync('docker',['exec','postgres_db','pg_dump','-U','n8n_user','-d','lead_db','-Fc'],{timeout:120000,maxBuffer:100e6});assert.equal(dump.status,0,'BACKUP_FAILED');fs.writeFileSync(dir+'/before.dump',dump.stdout);
  const migration=fs.readFileSync('database/migrations/055_email_native_transport_gate.sql','utf8');
  await db.query('BEGIN');transaction=true;const prior=await state();assert.deepEqual(await definitions(),before,'LIVE_DEFINITIONS_CHANGED');
  await db.query(migration.replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,''));
  const after=await definitions();for(const item of after){assert(names.includes(item.name));const old=before.find(x=>x.name===item.name);assert.equal(item.owner,old.owner);assert.equal(item.acl,old.acl);assert.equal(item.definition,old.definition.replace(guard,'IF NOT outreach_email_transport_marker_allowed(v.body) THEN'));}
  await db.query(fs.readFileSync('tests/lead-strategy/native-email-transport.sql','utf8'));
  assert.deepEqual(await state(),prior,'BUSINESS_STATE_CHANGED');await db.query('COMMIT');transaction=false;
  const result={installed:true,migration:'055_email_native_transport_gate.sql',three_guard_changes_only:true,owners_and_grants_preserved:true,processing_paused:true,plans_and_approvals_unchanged:true,model_calls:0,outreach_sent:0,backup:dir+'/before.dump',rollback:dir+'/rollback.sql',verified_at:new Date().toISOString()};fs.writeFileSync(dir+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }catch(e){if(transaction)await db.query('ROLLBACK');if(fs.existsSync(dir))fs.writeFileSync(dir+'/failure.json',JSON.stringify({error:e.message}));throw e;}finally{db?.release();await pool.end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
