'use strict';
const fs=require('fs'),cp=require('child_process'),assert=require('assert/strict');
const container='lead_diag_pg_20261011',db='scratch_v2_release_20261014';
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:60000,maxBuffer:2e6});if(r.status!==0)throw Error(String(r.stderr||r.error).slice(0,1600));return r.stdout.trim();}
assert.equal(JSON.parse(docker(['inspect',container]))[0].HostConfig.NetworkMode,'none');
const sql=q=>docker(['exec','-i',container,'psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',db],q);
sql(fs.readFileSync('database/migrations/027_email_safe_deferral.sql','utf8'));
let fixture=fs.readFileSync('.local/followup-readiness-fixture.sql','utf8');
const cut=fixture.indexOf(' ASSERT outreach_email_begin(p||');assert(cut>0);fixture=fixture.slice(0,cut)+`
 UPDATE strategy_campaign_versions SET config=jsonb_set(config,'{email_dispatch}',config->'email_dispatch'||'{"daily_limit":100,"mailbox_rolling_limit":1,"min_interval_seconds":60}') WHERE campaign_id=c;
 ASSERT outreach_email_step_begin(p)->>'execution_authorized'='true';
 ASSERT outreach_email_defer(p,'daily_quota_reached',clock_timestamp()+interval '1 hour')->>'reason'='attempt_not_safe_to_defer';
 INSERT INTO strategy_jobs(org_id,campaign_id,campaign_version,lead_id,request_id,status,fingerprint)
 VALUES(1,c,1,167,'deferral-second-'||c,'completed','fixture') RETURNING id INTO j;
 INSERT INTO strategy_plans(org_id,job_id,campaign_id,campaign_version,lead_id,body,fingerprint,content_hash,expires_at)
 VALUES(1,j,c,1,167,b,'fixture',md5(b::text),now()+interval '1 day') RETURNING id INTO pid;
 INSERT INTO strategy_approvals(org_id,plan_id,action,actor,content_hash) VALUES(1,pid,'approve','SCRATCH',md5(b::text));
 second_arg:=p||jsonb_build_object('plan_id',pid);
 r:=outreach_email_step_reserve(second_arg);ASSERT r->>'reserved'='true';
 second_arg:=second_arg||jsonb_build_object('lease',r->>'lease');
 r:=outreach_email_step_begin(second_arg);ASSERT r->>'queued'='true';ASSERT r->>'reason'='mailbox_rolling_limit_reached';
 ASSERT outreach_email_step_reserve(second_arg)->>'reserved' IS DISTINCT FROM 'true';
 ASSERT outreach_email_step_begin(second_arg)->>'execution_authorized' IS DISTINCT FROM 'true';
 ASSERT (SELECT dispatch_metadata->>'attempts' FROM outreach_activities WHERE org_id=1 AND dispatch_metadata->>'plan_id'=pid::text)='0';
 UPDATE outreach_activities SET dispatch_metadata=jsonb_set(dispatch_metadata,'{deferred_until}',to_jsonb((now()-interval '1 second')::text)) WHERE org_id=1 AND dispatch_metadata->>'plan_id'=pid::text;
 r:=outreach_email_step_reserve(second_arg);ASSERT r->>'reserved'='true';ASSERT r->>'lease'<>second_arg->>'lease';
 ASSERT outreach_email_step_begin(second_arg)->>'execution_authorized' IS DISTINCT FROM 'true','revoked lease cannot send';
 second_arg:=second_arg||jsonb_build_object('lease',r->>'lease');
 UPDATE outreach_activities SET dispatch_metadata=jsonb_set(dispatch_metadata,'{started_at}',to_jsonb((clock_timestamp()-interval '25 hours')::text)) WHERE id=aid;
 ASSERT outreach_email_step_begin(second_arg)->>'execution_authorized'='true';
 ASSERT outreach_email_step_begin(second_arg)->>'execution_authorized' IS DISTINCT FROM 'true';
 ASSERT outreach_email_defer(second_arg,'mailbox_spacing_required',now()+interval '1 hour')->>'reason'='attempt_not_safe_to_defer';
 ASSERT NOT outreach_email_can_resume('{"state":"ambiguous","attempts":0,"deferred_until":"2000-01-01"}');
 ASSERT NOT outreach_email_can_resume('{"state":"reserved","attempts":0,"deferred_until":"bad"}');
 ASSERT NOT outreach_email_can_resume('{"state":"reserved","attempts":0,"started_at":null,"deferred_until":"2000-01-01"}');
 ASSERT NOT outreach_email_can_resume('{"state":"reserved","attempts":0,"lease":"active","deferred_until":"2000-01-01"}');
 ASSERT outreach_email_defer('null','daily_quota_reached',now())->>'ready'='false';
END $test$;
ROLLBACK;
`;
console.log(sql(fixture));console.log('PASS: quota denial queues without attempting, early resume denied, due reservation rotates lease, old lease blocked, one send authorization, attempted/ambiguous/malformed rows never recycled. Scratch only.');
