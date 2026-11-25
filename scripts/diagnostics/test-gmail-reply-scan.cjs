'use strict';
const fs=require('fs'),cp=require('child_process'),assert=require('assert/strict');
const container='lead_diag_pg_20261011',db='scratch_v2_release_20261014';
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:60000,maxBuffer:2e6});if(r.status!==0)throw Error(String(r.stderr||r.error).slice(0,1600));return r.stdout.trim();}
assert.equal(JSON.parse(docker(['inspect',container]))[0].HostConfig.NetworkMode,'none');
const sql=q=>docker(['exec','-i',container,'psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',db],q);
sql(fs.readFileSync('database/migrations/025_gmail_reply_scan.sql','utf8'));
// Restore the latest step-check implementation after older fixture generators.
sql(fs.readFileSync('database/migrations/023_email_sequence_dispatch.sql','utf8'));
let fixture=fs.readFileSync('.local/followup-readiness-fixture.sql','utf8');
fixture=fixture.replace('END $test$;',`
 SELECT id INTO aid FROM outreach_activities WHERE org_id=1 AND dispatch_metadata->>'plan_id'=pid::text;
 UPDATE outreach_activities SET dispatch_metadata=dispatch_metadata||'{"state":"provider_accepted"}' WHERE id=aid;
 r:=jsonb_build_object('org_id',1,'activity_id',aid,'credential_ref','MOCK','sender_email','demo@example.org','external_id','1234abcdef','events','[]'::jsonb,'reviews','[]'::jsonb);
 ASSERT outreach_reply_scan_finish(r)->>'saved'='true';
 ASSERT outreach_reply_scan_finish(r||'{"org_id":999999}')->>'saved'='false';
 ASSERT outreach_reply_scan_finish(r||'{"credential_ref":"other"}')->>'saved'='false';
 ASSERT outreach_reply_scan_finish(r||'{"sender_email":"other@example.org"}')->>'saved'='false';
 ASSERT outreach_reply_scan_finish(r||'{"events":null}')->>'saved'='false';
 ASSERT outreach_reply_scan_finish(r||'{"events":{}}')->>'saved'='false';
 ASSERT outreach_reply_scan_finish('null')->>'saved'='false';
 b:=jsonb_build_object('stop_event',jsonb_build_object('org_id',1,'activity_id',aid,'kind','reply','event_id','gmail:abcdef1234','source_ref','gmail-thread:11112222'),
 'category','reply','body',repeat('x',3000),'subject','Hello','message_id','abcdef1234');
 ASSERT outreach_reply_scan_finish(r||jsonb_build_object('events',jsonb_build_array(jsonb_set(b,'{stop_event,org_id}','2'))))->>'reason'='event_scope_mismatch';
 ASSERT (SELECT replied_at IS NULL FROM outreach_activities WHERE id=aid);
 r:=r||jsonb_build_object('events',jsonb_build_array(b));
 ASSERT outreach_reply_scan_finish(r)->>'saved'='true';
 ASSERT outreach_reply_scan_finish(r)->>'saved'='true';
 ASSERT (SELECT replied_at IS NOT NULL FROM outreach_activities WHERE id=aid);
 ASSERT (SELECT jsonb_array_length(dispatch_metadata->'stop_events') FROM outreach_activities WHERE id=aid)=1;
 ASSERT (SELECT length(dispatch_metadata->'reply_scan'->'events'->0->>'body_excerpt') FROM outreach_activities WHERE id=aid)=2000;
 ASSERT outreach_email_step_check(second_arg||'{"step":2}')->>'ready'='false';
 b:=jsonb_set(jsonb_set(b,'{stop_event,kind}','"opt_out"'),'{stop_event,event_id}','"gmail:abcdef9999"');
 ASSERT outreach_reply_scan_finish(r||jsonb_build_object('events',jsonb_build_array(b)))->>'saved'='true';
 ASSERT (SELECT dispatch_metadata->>'stop_reason' FROM outreach_activities WHERE id=aid)='opt_out';
 b:=jsonb_set(jsonb_set(b,'{stop_event,kind}','"bounce"'),'{stop_event,event_id}','"gmail:abcdef8888"');
 ASSERT outreach_reply_scan_finish(r||jsonb_build_object('events',jsonb_build_array(b)))->>'saved'='true';
 ASSERT (SELECT bounced_at IS NOT NULL FROM outreach_activities WHERE id=aid);
 ASSERT outreach_email_step_check(second_arg||'{"step":2}')->>'ready'='false';
END $test$;`);
console.log(sql(fixture));
console.log('PASS: non-superuser scan persistence, mailbox/org isolation, malformed arrays, bounded excerpts, idempotent stops and blocked followups. Scratch only; fixture rolled back.');
