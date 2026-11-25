'use strict';
// Local-only DDL installation. No campaign approval, activation, schedule or provider access.
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const{localPool}=require('../dashboard/start-local-auth.cjs');
const existing=['strategy_context(integer,bigint,integer)','outreach_email_begin(jsonb)','outreach_email_step_begin(jsonb)','outreach_smtp_begin(jsonb)'];
const added=['email_campaign_authority_manage(integer,text,jsonb)','email_campaign_automation_control(integer,text,bigint,integer,integer,boolean)','email_campaign_renewal_claim(integer,bigint,text)','email_campaign_slice_publish(jsonb)','email_campaign_renewal_finish(jsonb)','email_campaign_dispatch_gate(jsonb)'];
async function main(){
 assert(process.argv.includes('--apply-local'),'LOCAL_INSTALL_SCOPE_REQUIRED');
 assert(process.env.EMAIL_CAMPAIGN_RENEWAL_ENABLED!=='true'&&process.env.EMAIL_BATCH_DASHBOARD_START_ENABLED!=='true','START_SWITCH_MUST_REMAIN_OFF');
 const evidence=JSON.parse(fs.readFileSync('.local/campaign-authority-20261110/renewal-scratch.json','utf8'));
 assert(evidence.passed&&evidence.rolled_back&&evidence.renewal_guards_tested&&!evidence.migration_live_applied,'SCRATCH_EVIDENCE_REQUIRED');
 const pool=localPool({registryWrite:true}),dir='.local/campaign-automation-install-'+Date.now();let db,transaction=false;
 try{db=await pool.connect();
  const definitions=async()=>(await db.query({text:'SELECT p.oid::regprocedure::text signature,pg_get_userbyid(p.proowner) owner,p.proacl::text acl,pg_get_functiondef(p.oid) definition FROM pg_proc p WHERE p.oid=ANY(SELECT to_regprocedure(x) FROM unnest($1::text[]) x) ORDER BY signature',values:[existing]})).rows;
  const state=async()=>(await db.query("SELECT jsonb_build_object('configs',(SELECT md5(coalesce(jsonb_agg(to_jsonb(v) ORDER BY org_id,campaign_id,version)::text,'')) FROM strategy_campaign_versions v),'plans',(SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY id)::text,'')) FROM strategy_plans p),'approvals',(SELECT md5(coalesce(jsonb_agg(to_jsonb(a) ORDER BY id)::text,'')) FROM strategy_approvals a),'activities',(SELECT count(*) FROM outreach_activities),'controls',(SELECT jsonb_agg(to_jsonb(c)) FROM strategy_controls c)) result")).rows[0].result;
  assert.equal((await db.query('SELECT current_database() name')).rows[0].name,'lead_db');
  assert.equal((await db.query('SELECT enabled FROM strategy_controls WHERE id')).rows[0].enabled,false,'PROCESSING_MUST_BE_PAUSED');
  assert.equal((await db.query("SELECT count(*)::integer n FROM strategy_jobs WHERE status='processing'")).rows[0].n,0,'ACTIVE_STRATEGY_JOB');
  assert.equal((await db.query("SELECT count(*)::integer n FROM strategy_campaign_versions WHERE config ? '_email_execution'")).rows[0].n,0,'EXISTING_AUTHORITY_REQUIRES_REVIEW');
  assert.equal((await db.query({text:'SELECT bool_and(to_regprocedure(x) IS NULL) absent FROM unnest($1::text[]) x',values:[added]})).rows[0].absent,true,'ALREADY_INSTALLED_DO_NOT_REPLAY');
  const before=await definitions();assert.equal(before.length,4);assert(before.every(x=>!x.definition.includes('email_campaign_dispatch_gate(p)')&&!x.definition.includes("cfg:=cfg-'_email_execution';")),'BASELINE_CHANGED');
  fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/before.json',JSON.stringify(before,null,2));
  fs.writeFileSync(dir+'/rollback.sql','-- Disable automation and stop renewal supervision before rollback.\nBEGIN;\n'+before.map(x=>x.definition).join('\n')+'\n'+[...added].reverse().map(x=>'DROP FUNCTION '+x+';').join('\n')+'\nCOMMIT;\n');
  assert.equal(cp.spawnSync('git',['check-ignore',dir+'/before.dump'],{stdio:'ignore'}).status,0,'BACKUP_MUST_BE_PRIVATE');
  const dump=cp.spawnSync('docker',['exec','postgres_db','pg_dump','-U','n8n_user','-d','lead_db','-Fc'],{timeout:120000,maxBuffer:100e6});assert.equal(dump.status,0,'BACKUP_FAILED');assert.equal(dump.stdout.subarray(0,5).toString(),'PGDMP');fs.writeFileSync(dir+'/before.dump',dump.stdout);
  await db.query('BEGIN');transaction=true;await db.query("SET LOCAL lock_timeout='5s'");const prior=await state();assert.deepEqual(await definitions(),before,'LIVE_DEFINITIONS_CHANGED');
  for(const file of ['056_email_campaign_authority.sql','057_email_campaign_renewal.sql'])await db.query(fs.readFileSync('database/migrations/'+file,'utf8').replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,''));
  const after=await definitions();for(const item of after){const old=before.find(x=>x.signature===item.signature);assert(old);assert.equal(item.owner,old.owner);assert.equal(item.acl,old.acl);assert(item.definition.includes(item.signature.startsWith('strategy_context(')?"cfg:=cfg-'_email_execution';":'email_campaign_dispatch_gate(p)'),'GUARD_NOT_INSTALLED');}
  const grants=(await db.query({text:"SELECT count(*)::integer n,bool_and(has_function_privilege('n8n_user',p.oid,'EXECUTE')) allowed,bool_and(NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')) private FROM pg_proc p WHERE p.oid=ANY(SELECT to_regprocedure(x) FROM unnest($1::text[]) x)",values:[added]})).rows[0];assert.equal(grants.n,6);assert.equal(grants.allowed,true);assert.equal(grants.private,true);
  assert.deepEqual(await state(),prior,'BUSINESS_STATE_CHANGED');await db.query('COMMIT');transaction=false;
  const result={installed:true,migrations:['056','057'],existing_owners_and_grants_preserved:true,business_state_unchanged:true,processing_paused:true,campaigns_approved:0,automation_enabled:false,schedules_created:0,provider_requests:0,emails_sent:0,backup:dir+'/before.dump',rollback:dir+'/rollback.sql',verified_at:new Date().toISOString()};fs.writeFileSync(dir+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }catch(e){if(transaction)await db.query('ROLLBACK').catch(()=>{});if(fs.existsSync(dir))fs.writeFileSync(dir+'/failure.json',JSON.stringify({error:e.message}));throw e;}finally{db?.release();await pool.end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
