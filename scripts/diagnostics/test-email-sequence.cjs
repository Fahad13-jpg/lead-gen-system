'use strict';
const fs=require('fs'),cp=require('child_process'),assert=require('assert/strict');
const container='lead_diag_pg_20261011',db='scratch_v2_release_20261014';
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:60000,maxBuffer:2e6});if(r.status!==0)throw Error(String(r.stderr||r.error).slice(0,1800));return r.stdout.trim();}
const info=JSON.parse(docker(['inspect',container]))[0];assert.equal(info.HostConfig.NetworkMode,'none');assert(info.State.Running);
const sql=q=>docker(['exec','-i',container,'psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',db],q);
// Generate/test the source-controlled readiness fixture before extending it.
const base=cp.spawnSync(process.execPath,['scripts/diagnostics/test-followup-readiness.cjs'],{encoding:'utf8',timeout:60000});if(base.status)throw Error(base.stderr.slice(0,1800));
sql(fs.readFileSync('database/migrations/023_email_sequence_dispatch.sql','utf8'));
let fixture=fs.readFileSync('.local/followup-readiness-fixture.sql','utf8');
fixture=fixture.replaceAll('outreach_dispatch_reserve','outreach_email_step_reserve').replaceAll('outreach_email_begin','outreach_email_step_begin').replaceAll('outreach_email_finish','outreach_email_step_finish');
fixture=fixture.replace('END $test$;',`
 UPDATE outreach_activities SET dispatch_metadata=dispatch_metadata||'{"state":"provider_accepted"}' WHERE org_id=1 AND dispatch_metadata->>'plan_id'=pid::text;
 second_arg:=second_arg||'{"step":2}';r:=outreach_email_step_reserve(second_arg);
 ASSERT r->>'reserved'='true','due followup reservation';
 second_arg:=second_arg||jsonb_build_object('lease',r->>'lease','subject','Demo','body','Approved followup');
 ASSERT outreach_email_step_reserve(second_arg)->>'ready'='false','duplicate followup';
 ASSERT outreach_email_step_begin(second_arg||'{"body":"changed"}')->>'reason'='approved_message_or_recipient_mismatch';
 ASSERT outreach_email_step_begin(second_arg)->>'reason'='daily_quota_reached','quota shared by initial and followup';
 UPDATE strategy_campaign_versions SET config=jsonb_set(config,'{email_dispatch,daily_limit}','3') WHERE campaign_id=c;
 ASSERT outreach_email_step_begin(second_arg)->>'execution_authorized'='true','followup authorized';
 ASSERT outreach_email_step_begin(second_arg)->>'ready'='false','attempt cannot repeat';
 ASSERT outreach_email_step_finish(second_arg||'{"outcome":"provider_accepted","external_id":"9876abcdef"}')->>'saved'='true';
 ASSERT outreach_email_step_finish(second_arg||'{"outcome":"provider_accepted","external_id":"9876abcdef"}')->>'idempotent'='true';
 ASSERT outreach_followup_check(second_arg)->>'reason'='step_already_recorded';
 ASSERT outreach_email_step_check(second_arg||'{"step":3}')->>'ready'='false';
END $test$;`);
console.log(sql(fixture));
const workflow=JSON.parse(fs.readFileSync('workflows/07a_email_outreach_executor.json','utf8'));sql('BEGIN;SET LOCAL ROLE v2_scratch_runtime;'+workflow.nodes.find(n=>n.name==='Get Email-Ready Leads').parameters.query+';ROLLBACK;');
console.log('PASS: step 2 reserve/begin/finish, shared quota, duplicate and body mismatch gates, idempotent receipt, bounds and candidate SQL; scratch only.');
