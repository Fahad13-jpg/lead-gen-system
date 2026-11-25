'use strict';
const {localPool}=require('../dashboard/start-local-auth.cjs');
async function main(){const pool=localPool();try{
 const campaigns=(await pool.query(`SELECT c.id,c.version,v.config->>'name' AS name,v.config->>'mode' AS mode,v.config->'channels' AS channels,v.config->'offer'->>'description' AS offer,v.config->'sender_connection'->>'connection_id' AS saved_sender,coalesce((v.config->'email_dispatch'->>'enabled')::boolean,false) AS sending_enabled,(SELECT count(*)::integer FROM strategy_plans p WHERE p.org_id=c.org_id AND p.campaign_id=c.id) AS plans,(SELECT count(*)::integer FROM strategy_plans p WHERE p.org_id=c.org_id AND p.campaign_id=c.id AND p.campaign_version=c.version AND p.expires_at>now()) AS unexpired_current_version_plans FROM strategy_campaigns c JOIN strategy_campaign_versions v ON v.org_id=c.org_id AND v.campaign_id=c.id AND v.version=c.version WHERE c.org_id=1 ORDER BY c.id`)).rows;
 const sender=(await pool.query(`SELECT connection_id,version,state,checked_at,email,daily_limit,mailbox_rolling_limit,min_interval_seconds FROM sender_connections WHERE org_id=1 AND provider='gmail'`)).rows;
 const controls=(await pool.query(`SELECT enabled,monthly_limit,(SELECT count(*)::integer FROM strategy_ai_requests WHERE org_id=1 AND reserved_at>=date_trunc('month',now())) AS used_this_month FROM strategy_ai_controls WHERE org_id=1`)).rows;
 const functions=(await pool.query(`SELECT pg_get_functiondef('sender_connection_bind(integer,text,text,bigint,integer)'::regprocedure) AS bind,pg_get_functiondef('sender_connection_gate(integer,jsonb)'::regprocedure) AS gate`)).rows[0];
 const fs=require('node:fs');fs.writeFileSync('.local/gmail-bind-function-definitions.json',JSON.stringify(functions,null,2));
 const jobs=(await pool.query(`SELECT campaign_id,status,count(*)::integer AS count FROM strategy_jobs WHERE org_id=1 GROUP BY campaign_id,status`)).rows;
 console.log(JSON.stringify({campaigns,sender,ai_controls:controls,jobs,read_only:true}));
}finally{await pool.end();}}
main().catch(()=>{console.error('GMAIL_CAMPAIGN_READINESS_UNCONFIRMED');process.exitCode=1;});
