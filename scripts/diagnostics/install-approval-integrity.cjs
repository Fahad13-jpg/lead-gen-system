'use strict';
// Explicit local migration approval required. No plans/approvals are created.
const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {localPool}=require('../dashboard/start-local-auth.cjs');
assert(process.argv.includes('--apply-approved'),'EXPLICIT_APPROVAL_REQUIRED');
const dir='.local/approval-054-install-'+Date.now();fs.mkdirSync(dir,{recursive:true});
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
async function main(){const pool=localPool({registryWrite:true});let db,transaction=false;try{db=await pool.connect();
 const definition=async()=>{const r=(await db.query("SELECT pg_get_functiondef(p.oid) definition,pg_get_userbyid(p.proowner) owner,p.proacl::text acl FROM pg_proc p WHERE p.oid='strategy_approval(jsonb)'::regprocedure")).rows[0];return r;};
 const snapshot=async()=>(await db.query(`SELECT jsonb_build_object('controls',(SELECT jsonb_agg(to_jsonb(c)) FROM strategy_controls c),'ai_controls',(SELECT jsonb_agg(to_jsonb(c) ORDER BY org_id) FROM strategy_ai_controls c),'requests',(SELECT md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY lease)::text,'')) FROM strategy_ai_requests r),'jobs',(SELECT md5(coalesce(jsonb_agg(to_jsonb(j) ORDER BY id)::text,'')) FROM strategy_jobs j),'plans',(SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY id)::text,'')) FROM strategy_plans p),'approvals',(SELECT md5(coalesce(jsonb_agg(to_jsonb(a) ORDER BY id)::text,'')) FROM strategy_approvals a),'activities',(SELECT count(*) FROM outreach_activities)) state`)).rows[0].state;
 assert.equal((await db.query('SELECT enabled FROM strategy_controls WHERE id')).rows[0].enabled,false);
 assert.equal((await db.query("SELECT count(*)::integer n FROM strategy_jobs WHERE status='processing'")).rows[0].n,0);
 const baseline=JSON.parse(fs.readFileSync('.local/approval-journey-20261109/live-baseline.json'));
 const scratch=JSON.parse(fs.readFileSync('.local/approval-journey-20261109/result.json'));assert(scratch.passed&&scratch.rolled_back&&scratch.model_calls===0);
 const before=await definition();assert.equal(hash(before.definition),baseline.definition_sha256,'LIVE_DEFINITION_CHANGED_REVIEW_AGAIN');
 fs.writeFileSync(dir+'/before.json',JSON.stringify(before,null,2));fs.writeFileSync(dir+'/rollback.sql','BEGIN;\n'+before.definition+'\nCOMMIT;\n');
 assert.equal(cp.spawnSync('git',['check-ignore',dir+'/before.dump'],{stdio:'ignore'}).status,0);
 const dump=cp.spawnSync('docker',['exec','postgres_db','pg_dump','-U','n8n_user','-d','lead_db','-Fc'],{timeout:120000,maxBuffer:100e6});assert.equal(dump.status,0,'FRESH_BACKUP_REQUIRED');fs.writeFileSync(dir+'/before.dump',dump.stdout);
 const migration=fs.readFileSync('database/migrations/054_strategy_approval_integrity.sql','utf8');assert.equal((migration.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,1);assert(migration.includes('FUNCTION strategy_approval(p jsonb)'));
 await db.query('BEGIN');transaction=true;const state=await snapshot();assert.equal(hash((await definition()).definition),baseline.definition_sha256);
 await db.query(migration.replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,''));
 const after=await definition();assert.equal(after.owner,before.owner);assert.equal(after.acl,before.acl);assert(after.definition.includes('md5(v.body::text)'));assert(after.definition.includes("p->'acknowledge_fallback' IS DISTINCT FROM 'true'::jsonb"));
 const invalid=(await db.query(`SELECT strategy_approval('{"actor":"installation-readiness-check"}'::jsonb) result`)).rows[0].result;assert.equal(invalid.error,'INVALID_APPROVAL');
 assert.deepEqual(await snapshot(),state,'BUSINESS_OR_GATE_STATE_CHANGED');await db.query('COMMIT');transaction=false;
 const result={installed:true,migration:'054_strategy_approval_integrity.sql',owner_unchanged:true,grants_unchanged:true,processing_paused:true,plan_and_approval_records_unchanged:true,model_calls:0,outreach_sent:0,after_sha256:hash(after.definition),rollback:dir+'/rollback.sql',backup:dir+'/before.dump',verified_at:new Date().toISOString()};fs.writeFileSync(dir+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }catch(e){if(transaction)await db.query('ROLLBACK');fs.writeFileSync(dir+'/failure.json',JSON.stringify({error:e.message}));throw e;}finally{db?.release();await pool.end();}}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
