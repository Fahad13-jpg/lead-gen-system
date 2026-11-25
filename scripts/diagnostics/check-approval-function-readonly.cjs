'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),{localPool}=require('../dashboard/start-local-auth.cjs');
async function main(){const db=localPool();try{
 const r=(await db.query("SELECT pg_get_functiondef(p.oid) definition,pg_get_userbyid(p.proowner) owner FROM pg_proc p WHERE p.oid='strategy_approval(jsonb)'::regprocedure")).rows[0];
 const report={read_only:true,owner:r.owner,definition_sha256:crypto.createHash('sha256').update(r.definition).digest('hex'),digest_rechecked:/md5\(v\.body::text\)/i.test(r.definition),v2_state_allowlist:/NOT IN \('ai_completed','template_completed','template_fallback','ai_failed'\)/.test(r.definition),typed_fallback_ack:/p->'acknowledge_fallback' IS DISTINCT FROM 'true'::jsonb/.test(r.definition),model_calls:0};
 fs.mkdirSync('.local/approval-journey-20261109',{recursive:true});fs.writeFileSync('.local/approval-journey-20261109/live-before.sql',r.definition);fs.writeFileSync('.local/approval-journey-20261109/live-baseline.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await db.end();}}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
