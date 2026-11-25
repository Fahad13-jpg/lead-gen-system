'use strict';
const assert=require('node:assert/strict'),cp=require('node:child_process'),{localPool}=require('../dashboard/start-local-auth.cjs');
async function main(){const pool=localPool({registryWrite:true});try{
 const before=(await pool.query('SELECT count(*)::integer AS count FROM outreach_activities')).rows[0].count;
 // Do not invalidate a campaign's version-bound sender binding for this test.
 const request=(await pool.query(`SELECT sender_connection_manage(s.org_id,s.owner_subject,jsonb_build_object('action','recheck','connection_id',s.connection_id,'expected_version',s.version)) AS result FROM sender_connections s WHERE s.org_id=1 AND s.provider='gmail' AND s.state='ready' AND NOT EXISTS(SELECT 1 FROM strategy_campaigns c JOIN strategy_campaign_versions v ON v.org_id=c.org_id AND v.campaign_id=c.id AND v.version=c.version WHERE c.org_id=s.org_id AND v.config->'sender_connection'->>'connection_id'=s.connection_id)`)).rows;
 assert.equal(request.length,1,'TEST_REQUIRES_ONE_UNBOUND_READY_GMAIL');assert.equal(request[0].result?.state,'pending_check','RECHECK_REQUEST_UNCONFIRMED');
 const run=cp.spawnSync(process.execPath,['scripts/diagnostics/run-gmail-recheck.cjs'],{encoding:'utf8',timeout:150000});assert.equal(run.status,0,'CHECK_EXECUTION_UNCONFIRMED');
 const output=JSON.parse(run.stdout.trim());const states=(await pool.query(`SELECT state,send_capable,reply_capable FROM sender_connections WHERE org_id=1 AND provider='gmail'`)).rows;
 const after=(await pool.query('SELECT count(*)::integer AS count FROM outreach_activities')).rows[0].count;assert.equal(before,after,'ACTIVITY_COUNT_CHANGED');
 console.log(JSON.stringify({check:output,registry_states:states,activities_unchanged:true,sent:false}));
}finally{await pool.end();}}
main().catch(()=>{console.error('GMAIL_RECHECK_TEST_UNCONFIRMED; inspect registry before retry');process.exitCode=1;});
