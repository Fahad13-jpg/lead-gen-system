'use strict';
// Read-only counts and fixed schema checks. Never selects credential data or tokens.
const {localPool}=require('../dashboard/start-local-auth.cjs');
async function main(){const pool=localPool();try{
 const credentials=await pool.query(`SELECT count(*)::int AS total,count(*) FILTER (WHERE name LIKE 'Quarantined Gmail %')::int AS quarantined FROM credentials_entity WHERE type='gmailOAuth2' AND (name LIKE 'Managed Gmail gmail_%' OR name LIKE 'Quarantined Gmail gmail_%')`);
 const senders=await pool.query(`SELECT provider,state,count(*)::int AS count FROM sender_connections WHERE org_id=1 GROUP BY provider,state`);
 const projects=await pool.query(`SELECT count(*)::int AS count FROM shared_workflow WHERE "workflowId"='managedSmtpcheck'`);
 const schema=await pool.query(`SELECT table_name,column_name,data_type,character_maximum_length,is_nullable,column_default FROM information_schema.columns WHERE table_name IN ('credentials_entity','shared_credentials') ORDER BY table_name,ordinal_position`);
 console.log(JSON.stringify({credential_counts:credentials.rows[0],sender_states:senders.rows,operator_project_bindings:projects.rows[0].count,credential_schema:schema.rows,read_only:true}));
}finally{await pool.end();}}
main().catch(()=>{console.error('GMAIL_READ_ONLY_DIAGNOSTIC_FAILED');process.exitCode=1;});
