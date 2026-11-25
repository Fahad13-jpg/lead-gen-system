'use strict';
const fs=require('fs'),cp=require('child_process'),assert=require('assert/strict');
const container='lead_diag_pg_20261011',db='scratch_v2_release_20261014';
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:60000,maxBuffer:2e6});if(r.status!==0)throw Error(String(r.stderr||r.error).slice(0,1600));return r.stdout.trim();}
assert.equal(JSON.parse(docker(['inspect',container]))[0].HostConfig.NetworkMode,'none');
const sql=q=>docker(['exec','-i',container,'psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',db],q);
sql(fs.readFileSync('database/migrations/026_mailbox_capacity.sql','utf8'));
let fixture=fs.readFileSync('.local/followup-readiness-fixture.sql','utf8');
fixture=fixture.replace('END $test$;',`
 -- All changes below are synthetic and rolled back with the fixture.
 UPDATE outreach_activities SET dispatch_metadata=dispatch_metadata||'{"sender_email":"unrelated@example.org"}' WHERE org_id=1;
 UPDATE strategy_campaign_versions SET config=jsonb_set(config,'{email_dispatch}',
 '{"enabled":true,"credential_ref":"MOCK","sender_email":"capacity@example.org","daily_limit":100,"mailbox_rolling_limit":1,"min_interval_seconds":60}') WHERE campaign_id=c;
 b:='{"enabled":true,"credential_ref":"MOCK","sender_email":"capacity@example.org","mailbox_rolling_limit":1,"min_interval_seconds":60}';
 ASSERT outreach_mailbox_capacity(1,b)->>'allowed'='true';
 ASSERT outreach_mailbox_capacity(1,b-'mailbox_rolling_limit')->>'reason'='mailbox_policy_required';
 ASSERT outreach_mailbox_capacity(1,'null')->>'allowed'='false';
 UPDATE outreach_activities SET dispatch_metadata=dispatch_metadata||jsonb_build_object('sender_email','capacity@example.org','state','ambiguous','started_at',clock_timestamp()-interval '1 hour') WHERE id=aid;
 ASSERT outreach_mailbox_capacity(1,b)->>'reason'='mailbox_rolling_limit_reached';
 ASSERT outreach_mailbox_capacity(1,b||'{"sender_email":"CAPACITY@example.org","credential_ref":"OTHER","mailbox_rolling_limit":100}')->>'reason'='mailbox_rolling_limit_reached';
 UPDATE outreach_activities SET dispatch_metadata=dispatch_metadata||jsonb_build_object('started_at',clock_timestamp()-interval '25 hours') WHERE id=aid;
 ASSERT outreach_mailbox_capacity(1,b)->>'allowed'='true';
 UPDATE strategy_campaign_versions SET config=jsonb_set(config,'{email_dispatch,mailbox_rolling_limit}','100') WHERE campaign_id=c;
 b:=b||'{"mailbox_rolling_limit":100}';
 UPDATE outreach_activities SET dispatch_metadata=dispatch_metadata||jsonb_build_object('started_at',clock_timestamp()-interval '1 second') WHERE id=aid;
 ASSERT outreach_mailbox_capacity(1,b)->>'reason'='mailbox_spacing_required';
 UPDATE outreach_activities SET dispatch_metadata=dispatch_metadata||'{"started_at":"not-a-date"}' WHERE id=aid;
 ASSERT outreach_mailbox_capacity(1,b)->>'reason'='mailbox_history_requires_review';
 UPDATE outreach_activities SET dispatch_metadata=dispatch_metadata||jsonb_build_object('started_at',clock_timestamp()+interval '1 hour') WHERE id=aid;
 ASSERT outreach_mailbox_capacity(1,b)->>'reason'='mailbox_history_requires_review';
 ASSERT position('outreach_mailbox_capacity' in pg_get_functiondef('outreach_email_step_begin(jsonb)'::regprocedure))>0;
END $test$;`);
console.log(sql(fixture));console.log('PASS: rolling mailbox quota, credential alias sharing, conservative campaign cap, spacing, ambiguous attempts and malformed/future history; non-superuser scratch, rollback.');
