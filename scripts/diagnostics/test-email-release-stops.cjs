'use strict';
const fs=require('fs'),assert=require('assert/strict'),{docker}=require('./gmail-test-client.cjs');
const pg='lead_diag_pg_20261011',db='scratch_email_release_20261019';
assert.equal(JSON.parse(docker(['inspect',pg]))[0].HostConfig.NetworkMode,'none');
const sql=q=>{
 const r=require('child_process').spawnSync('docker',['exec','-i',pg,'psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',db],{input:q,encoding:'utf8',timeout:60000});
 if(r.status!==0)throw Error((r.stderr||'Scratch SQL command failed').slice(0,3000));
 return r.stdout.trim();
};
const role=q=>q.replace('SET LOCAL ROLE v2_scratch_runtime;','SET LOCAL ROLE email_release_owner_20261019;');
console.log(sql(role(fs.readFileSync('tests/lead-strategy/sending-window.sql','utf8'))));
let fixture=role(fs.readFileSync('.local/followup-readiness-fixture.sql','utf8'));
fixture=fixture.replace('END $test$;',`
 SELECT id INTO aid FROM outreach_activities WHERE org_id=1 AND dispatch_metadata->>'plan_id'=pid::text;
 UPDATE outreach_activities SET dispatch_metadata=dispatch_metadata||'{"state":"provider_accepted"}' WHERE id=aid;
 b:=jsonb_build_object('stop_event',jsonb_build_object('org_id',1,'activity_id',aid,'kind','reply','event_id','gmail:abcdef1234','source_ref','gmail-thread:11112222'),'category','reply','body','Interested, please tell me more','subject','Hello','message_id','abcdef1234');
 r:=jsonb_build_object('org_id',1,'activity_id',aid,'credential_ref','MOCK','sender_email','demo@example.org','external_id','1234abcdef','events',jsonb_build_array(b),'reviews','[]'::jsonb,
 'delivery_scan_previous','{}'::jsonb,'delivery_scan_next',jsonb_build_object('complete',true,'review_required',false,'window_start',1700000000000,'window_end',floor(extract(epoch FROM now()-interval '1 second')*1000)::bigint,'checked_through',floor(extract(epoch FROM now()-interval '1 second')*1000)::bigint));
 ASSERT outreach_reply_scan_finish(r||'{"org_id":999999}')->>'saved'='false';
 ASSERT outreach_reply_scan_finish(r)->>'saved'='true';
 ASSERT outreach_reply_scan_finish(r)->>'reason'='delivery_scan_stale_or_missing';
 ASSERT outreach_record_stop(b->'stop_event')->>'idempotent'='true';
 ASSERT (SELECT jsonb_array_length(dispatch_metadata->'stop_events') FROM outreach_activities WHERE id=aid)=1;
 ASSERT outreach_email_step_check(second_arg||'{"step":2}')->>'ready'='false';
 ASSERT outreach_email_step_reserve(second_arg||'{"step":2}')->>'reserved' IS DISTINCT FROM 'true';
 ASSERT outreach_email_step_begin(second_arg||'{"step":2}')->>'execution_authorized' IS DISTINCT FROM 'true';
 ASSERT outreach_email_contact_gate(1,167,'test@example.org','demo@example.org')->>'allowed'='false';
 b:=jsonb_set(jsonb_set(b,'{stop_event,kind}','"opt_out"'),'{stop_event,event_id}','"gmail:abcdef9999"');
 ASSERT outreach_record_stop(b->'stop_event')->>'saved'='true';
 -- An older ambiguous attempt may be encountered before this suppression.
 -- Both must deny contact; row ordering must not determine test success.
 ASSERT outreach_email_contact_gate(1,167,'test@example.org','demo@example.org')->>'allowed'='false';
 ASSERT (SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(dispatch_metadata->'stop_events') e WHERE e->>'kind'='opt_out') FROM outreach_activities WHERE id=aid);
 b:=jsonb_set(jsonb_set(b,'{stop_event,kind}','"bounce"'),'{stop_event,event_id}','"gmail:abcdef8888"');
 ASSERT outreach_record_stop(b->'stop_event')->>'saved'='true';
 ASSERT (SELECT bounced_at IS NOT NULL FROM outreach_activities WHERE id=aid);
 ASSERT outreach_email_step_check(second_arg||'{"step":2}')->>'ready'='false';
END $test$;`);
fs.writeFileSync('.local/email-release-stop-fixture.sql',fixture);
console.log(sql(fixture));
console.log('PASS: latest release, non-superuser, reply persistence and replay protection, opt-out/bounce suppression, follow-up reserve/begin blocks, timezone/weekend/DST checks. All fixture changes rolled back.');
