'use strict';
// Read-only completion inventory. No provider access or workflow execution.
const fs=require('node:fs'),{localPool}=require('../dashboard/start-local-auth.cjs');
async function main(){const pool=localPool();try{
 const read=async q=>{try{return (await pool.query(q)).rows;}catch(e){console.error(JSON.stringify({query_table:q.match(/FROM\s+([a-z_]+)/i)?.[1],sql_code:e.code,position:e.position}));throw e;}};
 const result={checked_at:new Date().toISOString(),read_only:true,provider_calls:0};
 result.workflows=await read('SELECT id,name,active FROM workflow_entity ORDER BY name');
 result.enrichment=await read(`SELECT count(*)::integer profiles,count(*) FILTER(WHERE basic->>'input_fingerprint'=enrichment_fingerprint(org_id,lead_id,'basic'))::integer fresh_basic FROM enrichment_profiles`);
 result.enrichment_tasks=await read('SELECT kind,status,count(*)::integer count FROM enrichment_tasks GROUP BY kind,status ORDER BY kind,status');
 result.contact_tasks=await read('SELECT kind,status,count(*)::integer count FROM contact_tasks GROUP BY kind,status ORDER BY kind,status');
 result.sender_states=await read('SELECT provider,state,count(*)::integer count FROM sender_connections GROUP BY provider,state ORDER BY provider,state');
 result.functions=await read(`SELECT p.proname name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.proname LIKE 'outreach_call_%' OR p.proname LIKE 'outreach_linkedin_%' OR p.proname LIKE 'outreach_whatsapp_%' OR p.proname LIKE 'organization_policy%') ORDER BY p.proname`);
 result.control_columns=await read(`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('strategy_ai_controls','enrichment_ai_controls','enrichment_linkedin_controls','sender_connections','strategy_plans','campaigns','organization_policies') ORDER BY table_name,ordinal_position`);
 fs.mkdirSync('.local',{recursive:true});fs.writeFileSync('.local/system-completion-inventory.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
 }finally{await pool.end();}}
main().catch(()=>{console.error('SYSTEM_INVENTORY_UNCONFIRMED');process.exitCode=1;});
