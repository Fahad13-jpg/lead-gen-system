'use strict';
const fs=require('fs'),cp=require('child_process'),assert=require('assert/strict');
const container='lead_diag_pg_20261011',db='scratch_v2_release_20261014';
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:60000,maxBuffer:2e6});if(r.status!==0)throw Error(String(r.stderr||r.error).slice(0,1600));return r.stdout.trim();}
assert.equal(JSON.parse(docker(['inspect',container]))[0].HostConfig.NetworkMode,'none');
const sql=q=>docker(['exec','-i',container,'psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',db],q);
sql(fs.readFileSync('database/migrations/029_delivery_scan_checkpoint.sql','utf8'));
sql(fs.readFileSync('database/migrations/030_delivery_scan_recovery.sql','utf8'));
let fixture=fs.readFileSync('.local/followup-readiness-fixture.sql','utf8');
// Test-only grant, inside fixture transaction, rolled back afterwards.
fixture=fixture.replace('SET LOCAL ROLE v2_scratch_runtime;', 'GRANT EXECUTE ON FUNCTION outreach_delivery_scan_restart(jsonb) TO v2_scratch_runtime;\nSET LOCAL ROLE v2_scratch_runtime;');
fixture=fixture.replace('END $test$;',`
 SELECT id INTO aid FROM outreach_activities WHERE org_id=1 AND dispatch_metadata->>'plan_id'=pid::text;
 UPDATE outreach_activities SET dispatch_metadata=dispatch_metadata||'{"state":"provider_accepted"}' WHERE id=aid;
 b:=jsonb_build_object('window_start',1700000000000,'window_end',floor(extract(epoch FROM now()-interval '1 second')*1000)::bigint,
 'complete',false,'next_page_token','page2','checked_through',NULL,'review_required',false);
 r:=jsonb_build_object('org_id',1,'activity_id',aid,'credential_ref','MOCK','sender_email','demo@example.org','external_id','1234abcdef',
 'events','[]'::jsonb,'reviews','[]'::jsonb,'delivery_scan_previous','{}'::jsonb,'delivery_scan_next',b);
 ASSERT outreach_reply_scan_finish(r)->>'saved'='true';
 ASSERT outreach_email_contact_gate(1,167,'test@example.org','demo@example.org')->>'reason'='reply_check_stale';
 ASSERT outreach_reply_scan_finish(r)->>'reason'='delivery_scan_stale_or_missing';
 r:=r||jsonb_build_object('delivery_scan_previous',b,'delivery_scan_next',b||jsonb_build_object('complete',true,'next_page_token',NULL,'checked_through',b->'window_end'));
 ASSERT outreach_reply_scan_finish(jsonb_set(r,'{delivery_scan_next,window_start}','1800000000000'))->>'saved'='false';
 ASSERT outreach_reply_scan_finish(r)->>'saved'='true';
 -- A single DO statement has a fixed statement_timestamp; production checks run
 -- in later statements. Simulate that ordering for the persisted scan timestamp.
 UPDATE outreach_activities SET dispatch_metadata=jsonb_set(dispatch_metadata,'{reply_scan,checked_at}',to_jsonb(statement_timestamp())) WHERE id=aid;
 ASSERT outreach_email_contact_gate(1,167,'test@example.org','demo@example.org')->>'allowed'='true';
 SELECT dispatch_metadata->'delivery_scan' INTO b FROM outreach_activities WHERE id=aid;
 r:=r||jsonb_build_object('delivery_scan_previous',b,'delivery_scan_next',b||jsonb_build_object('window_start',b->'checked_through','review_required',true));
 ASSERT outreach_reply_scan_finish(r)->>'saved'='true';
 ASSERT outreach_email_contact_gate(1,167,'test@example.org','demo@example.org')->>'reason'='conversation_review_required';
 ASSERT outreach_reply_scan_finish(r-'delivery_scan_next')->>'saved'='false';
 -- Explicit operator recovery preserves the fixed window and review flag.
 b:=b||'{"complete":false,"next_page_token":"expired","review_required":true}';
 UPDATE outreach_activities SET dispatch_metadata=jsonb_set(dispatch_metadata,'{delivery_scan}',b) WHERE id=aid;
 r:=jsonb_build_object('org_id',1,'activity_id',aid,'credential_ref','MOCK','sender_email','demo@example.org',
 'expected_scan',b,'actor','SCRATCH_OPERATOR','reason','page_token_rejected');
 ASSERT outreach_delivery_scan_restart(r||'{"org_id":999999}')->>'saved'='false';
 ASSERT outreach_delivery_scan_restart(r||'{"credential_ref":"other"}')->>'saved'='false';
 ASSERT outreach_delivery_scan_restart(r-'actor')->>'saved'='false';
 ASSERT outreach_delivery_scan_restart(r)->>'saved'='true';
 ASSERT outreach_delivery_scan_restart(r)->>'reason'='recovery_stale';
 SELECT dispatch_metadata->'delivery_scan' INTO p FROM outreach_activities WHERE id=aid;
 ASSERT p->'window_start'=b->'window_start' AND p->'window_end'=b->'window_end';
 ASSERT p->'checked_through'=b->'checked_through' AND p->>'review_required'='true';
 ASSERT p->>'restart_pending'='true' AND NOT p ? 'next_page_token';
 ASSERT outreach_email_contact_gate(1,167,'test@example.org','demo@example.org')->>'allowed'='false';
 ASSERT outreach_delivery_scan_restart(r||jsonb_build_object('expected_scan',p))->>'reason'='scan_not_restartable';
 -- A failed replay can receive only one further explicit restart.
 UPDATE outreach_activities SET dispatch_metadata=jsonb_set(dispatch_metadata,'{delivery_scan}',b) WHERE id=aid;
 ASSERT outreach_delivery_scan_restart(r)->>'saved'='true';
 UPDATE outreach_activities SET dispatch_metadata=jsonb_set(dispatch_metadata,'{delivery_scan}',b) WHERE id=aid;
 ASSERT outreach_delivery_scan_restart(r)->>'reason'='recovery_limit_reached';
END $test$;`);
console.log(sql(fixture));console.log('PASS: page checkpoint CAS, incomplete scan holds send, stale writer refused, fixed-window continuity, completed scan permits, review blocks. Scratch only.');
