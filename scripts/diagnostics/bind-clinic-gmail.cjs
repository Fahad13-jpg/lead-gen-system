'use strict';
// Operator-local binding through the existing versioned SQL function. No approval or sending.
const fs=require('node:fs'),assert=require('node:assert/strict'),{localPool}=require('../dashboard/start-local-auth.cjs');
async function main(){const pool=localPool({registryWrite:true});try{
 const ledger=async()=>(await pool.query(`SELECT count(*)::integer AS count FROM strategy_ai_requests`)).rows[0].count;
 const before=await ledger();
 // The installed planner supersedes queued jobs for an older campaign version
 // before claiming work. Preserve that mechanism; never rewrite jobs or leases.
 const definition=(await pool.query(`SELECT pg_get_functiondef('strategy_claim(text,integer)'::regprocedure) AS definition`)).rows[0].definition;
 assert(definition.includes("status='superseded'")&&definition.includes('campaign_version'),'PLANNER_SUPERSESSION_UNCONFIRMED');
 const saved=(await pool.query(`SELECT sender_connection_bind(s.org_id,s.owner_subject,s.connection_id,1,2) AS result FROM sender_connections s WHERE s.org_id=1 AND s.provider='gmail' AND s.state='ready' AND s.version=4 AND NOT EXISTS(SELECT 1 FROM strategy_plans WHERE org_id=1 AND campaign_id=1) AND NOT EXISTS(SELECT 1 FROM strategy_jobs WHERE org_id=1 AND campaign_id=1 AND status='processing')`)).rows;
 assert.equal(saved.length,1,'BINDING_PRECONDITIONS_CHANGED');const result=saved[0].result;assert(!result?.error&&result.org_id===1&&Number(result.campaign_id)===1&&result.version===3,'CAMPAIGN_BINDING_UNCONFIRMED');
 const current=(await pool.query(`SELECT c.version,v.config->>'mode' AS mode,v.config->'sender_connection'->>'provider' AS provider,v.config->'email_dispatch'->>'enabled' AS sending_enabled FROM strategy_campaigns c JOIN strategy_campaign_versions v ON v.org_id=c.org_id AND v.campaign_id=c.id AND v.version=c.version WHERE c.org_id=1 AND c.id=1`)).rows[0];assert.equal(current.sending_enabled,'false');assert.equal(current.provider,'gmail');assert.equal(current.mode,'ai');assert.equal(await ledger(),before);
 const evidence={campaign_id:1,campaign_version:3,provider:'gmail',mode:'ai',sending_enabled:false,existing_plans:0,ai_ledger_unchanged:true,model_calls:0,emails_sent:0,bound_at:new Date().toISOString()};
 fs.writeFileSync('.local/clinic-gmail-binding.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{await pool.end();}}
main().catch(()=>{console.error('CLINIC_GMAIL_BINDING_UNCONFIRMED; inspect campaign version before retry');process.exitCode=1;});
