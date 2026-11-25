'use strict';
// Read installed function bodies, not lead payloads. No SQL mutation or provider I/O.
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const names={outreach_call_stop:'042_calling_tools.sql',outreach_call_booking:'042_calling_tools.sql',outreach_call_tool_context:'043_calling_results.sql',outreach_call_result:'043_calling_results.sql',outreach_call_ingest:'043_calling_results.sql'};
const normalize=s=>s.replace(/\r\n/g,'\n').trim();
async function main(){
 const query="SELECT json_agg(json_build_object('name',p.proname,'body',p.prosrc)) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN("+Object.keys(names).map(n=>"'"+n+"'").join(',')+");";
 const r=cp.spawnSync('docker',['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],{input:query,encoding:'utf8',timeout:20000});assert.equal(r.status,0,'CALL_STORAGE_READ_FAILED');const rows=JSON.parse(r.stdout);assert.equal(rows.length,5);
 const checks=rows.map(r=>{const source=fs.readFileSync('database/migrations/'+names[r.name],'utf8'),start=source.indexOf('FUNCTION '+r.name+'(');assert.ok(start>=0);const opening=source.indexOf('AS $$',start)+5,end=source.indexOf('$$;',opening);assert.ok(end>opening);return{name:r.name,matches_reviewed_source:normalize(source.slice(opening,end))===normalize(r.body)};});
 const report={verified_at:new Date().toISOString(),installed_storage_verified:checks.every(c=>c.matches_reviewed_source),checks,lead_writes:0,provider_requests:0};fs.mkdirSync('.local/calling-production-20261115',{recursive:true});fs.writeFileSync('.local/calling-production-20261115/storage-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));assert.equal(report.installed_storage_verified,true);
}
main().catch(e=>{console.error(e.message==='CALL_STORAGE_READ_FAILED'?e.message:'CALL_STORAGE_SOURCE_MISMATCH');process.exitCode=1;});
