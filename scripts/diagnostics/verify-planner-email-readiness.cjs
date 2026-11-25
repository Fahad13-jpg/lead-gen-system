'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const {localPool}=require('../dashboard/start-local-auth.cjs'),{snapshot}=require('../lead-strategy/v2/email-readiness-sql.cjs');
async function main(){const pool=localPool();try{
 const w=JSON.parse(fs.readFileSync('workflows/06C_outreach_strategy_generator.json')),lead=process.argv.includes('--lead=449')?449:446;
 const controls=async()=>(await pool.query(`SELECT jsonb_build_object('control',(SELECT to_jsonb(c) FROM strategy_ai_controls c WHERE org_id=1),'requests',(SELECT count(*) FROM strategy_ai_requests),'plans',(SELECT count(*) FROM strategy_plans)) AS value`)).rows[0].value;
 const before=await controls();
 const volatility=(await pool.query(`SELECT provolatile FROM pg_proc WHERE oid='strategy_claim(text,integer)'::regprocedure`)).rows[0].provolatile;assert.equal(volatility,'v');
 const claim=w.nodes.find(n=>n.name==='Claim Strategy Jobs').parameters.query.replace(/\{\{[\s\S]*?\}\}/g,'readonly_explain');await pool.query('EXPLAIN '+claim);
 const preview=w.nodes.find(n=>n.name==='preview Database').parameters.query.replace(/\{\{[\s\S]*?\}\}/g,text=>text.includes('JSON.stringify')?'{}':text.includes('$json.error')?'false':text.includes('lead_id')?String(lead):'1');
 const row=(await pool.query(preview)).rows[0];assert(row.email_sender_snapshot?.email_workflow_installed);assert(row.email_sender_snapshot?.reply_workflow_installed);
 const env={STRATEGY_CONTRACT_VERSION:'strategy_v2'},run=(name,json)=>JSON.parse(JSON.stringify(vm.runInNewContext('(function(){'+w.nodes.find(n=>n.name===name).parameters.jsCode+'})()',{$json:json,$env:env,Buffer,require:id=>{assert.equal(id,'crypto');return require('node:crypto');}},{timeout:5000})));
 const result=run('Build Preview',row).result;assert.equal(result.provider_requests,0);assert.equal(result.execution_authorized,false);assert(result.brief.blocked_channels.find(c=>c.channel==='email').reason_codes.includes('email_missing'));assert(!result.brief.blocked_channels.find(c=>c.channel==='email').reason_codes.includes('executor_not_integrated'));
 const prepared=run('Prepare Strategy',{id:0,org_id:1,lease:'offline-only-not-a-job',input:row.result,email_sender_snapshot:row.email_sender_snapshot});assert.equal(prepared.wants_ai,false);assert.equal(prepared.input.fingerprint,row.result.fingerprint);if(lead===449){assert(prepared.prepared.brief.facts.length>0);assert.equal(prepared.input.report.trust.website_presence,'present');assert.equal(prepared.input.report.trust.fully_verified,false);}
 assert.deepEqual(await controls(),before);
 const evidence={lead_id:lead,legacy_excerpts_restored:lead===449,claim_sql_explain_passed:true,preview_sql_passed:true,embedded_prepare_passed:true,embedded_preview_passed:true,obsolete_integration_flag_removed:true,missing_email_still_blocks:true,fingerprint_unchanged:true,ai_controls_ledger_plans_unchanged:true,model_calls:0,emails_sent:0,checked_at:new Date().toISOString()};
 fs.writeFileSync(lead===449?'.local/planner-legacy-evidence-verification.json':'.local/planner-email-readiness-verification.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{await pool.end();}}
main().catch(()=>{console.error('PLANNER_EMAIL_READINESS_VERIFICATION_UNCONFIRMED');process.exitCode=1;});
