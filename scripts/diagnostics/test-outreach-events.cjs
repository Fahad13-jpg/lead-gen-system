'use strict';
const fs=require('fs'),cp=require('child_process'),assert=require('assert/strict');
const container='lead_diag_pg_20261011',db='scratch_v2_release_20261014';
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:60000,maxBuffer:2e6});if(r.status!==0)throw Error(String(r.stderr||r.error).slice(0,1600));return r.stdout.trim();}
assert.equal(JSON.parse(docker(['inspect',container]))[0].HostConfig.NetworkMode,'none');
const sql=q=>docker(['exec','-i',container,'psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',db],q);
sql(fs.readFileSync('database/migrations/024_outreach_review_events.sql','utf8'));
// Readiness fixture is generated from source by test-followup-readiness.cjs.
const base=cp.spawnSync(process.execPath,['scripts/diagnostics/test-followup-readiness.cjs'],{encoding:'utf8',timeout:60000});if(base.status)throw Error(base.stderr.slice(0,1000));
let fixture=fs.readFileSync('.local/followup-readiness-fixture.sql','utf8');
fixture=fixture.replace('END $test$;',`
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(outreach_review_queue(1)) item WHERE item->>'activity_id'=aid::text);
 ASSERT outreach_review_queue(999999)='[]'::jsonb;
 r:=p||jsonb_build_object('activity_id',aid,'external_id','112233aabb','reviewer','SCRATCH REVIEWER','source_ref','fixture receipt','accepted_at',clock_timestamp());
 ASSERT outreach_reconcile_receipt(r||'{"org_id":999999}')->>'saved'='false';
 ASSERT outreach_reconcile_receipt(r||'{"lease":"wrong"}')->>'saved'='false';
 ASSERT outreach_reconcile_receipt(r||'{"accepted_at":"2099-01-01"}')->>'saved'='false';
 ASSERT outreach_reconcile_receipt(r)->>'saved'='true';
 ASSERT outreach_reconcile_receipt(r)->>'idempotent'='true';
 ASSERT outreach_reconcile_receipt(r||'{"external_id":"another_id"}')->>'saved'='false';
 ASSERT (SELECT dispatch_metadata->>'attempts' FROM outreach_activities WHERE id=aid)='1';
 ASSERT (SELECT dispatch_metadata ? 'quota_day' FROM outreach_activities WHERE id=aid);
 r:=jsonb_build_object('org_id',1,'activity_id',aid,'event_id','reply-fixture','kind','reply','source_ref','fixture reply');
 ASSERT outreach_record_stop(r||'{"org_id":999999}')->>'saved'='false';
 ASSERT outreach_record_stop(r)->>'saved'='true';
 ASSERT outreach_record_stop(r)->>'idempotent'='true';
 ASSERT outreach_record_stop(r||'{"kind":"opt_out"}')->>'reason'='event_id_conflict';
 ASSERT outreach_email_step_check(p)->>'ready'='false';
 ASSERT outreach_record_stop(r||'{"event_id":"optout-fixture","kind":"opt_out"}')->>'saved'='true';
 ASSERT (SELECT jsonb_array_length(dispatch_metadata->'stop_events') FROM outreach_activities WHERE id=aid)=2;
 ASSERT outreach_record_stop('null')->>'saved'='false';
 ASSERT outreach_reconcile_receipt('null')->>'saved'='false';
END $test$;`);
console.log(sql(fixture));console.log('PASS: scoped review queue, reviewed receipt identity/time, no retry/quota reset, idempotent stop events, conflicting event IDs and immediate blocking; scratch only.');
