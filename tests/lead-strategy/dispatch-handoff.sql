-- ISOLATED SCRATCH ONLY. Context is an explicit test double; all function/data changes roll back.
BEGIN;
SET LOCAL ROLE v2_scratch_runtime;
CREATE OR REPLACE FUNCTION strategy_context(p_org integer,p_campaign bigint,p_lead integer) RETURNS jsonb
LANGUAGE sql STABLE AS $$ SELECT current_setting('lead_test.context')::jsonb $$;
SELECT set_config('lead_test.context','{"fingerprint":"fixture","suppressed":false,"replied":false,"lead":{"email":"test@example.org"},"report":{"trust":{"fields":{"emails":[{"value":"test@example.org","status":"provider_verified"}]}}}}',true);
DO $test$
DECLARE campaign bigint;job bigint;pid bigint;body jsonb;arg jsonb;r jsonb;lease text;ctx jsonb;cnt bigint;
BEGIN
 ASSERT NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user);
 INSERT INTO strategy_campaigns(org_id) VALUES(1) RETURNING id INTO campaign;
 INSERT INTO strategy_campaign_versions(org_id,campaign_id,version,config) VALUES(1,campaign,1,'{}');
 INSERT INTO strategy_jobs(org_id,campaign_id,campaign_version,lead_id,request_id,status,fingerprint)
 VALUES(1,campaign,1,167,'dispatch-fixture-'||campaign,'completed','fixture') RETURNING id INTO job;
 body:='{"version":"strategy_v2","state":"template_completed","execution_authorized":false,"validation_errors":[],"blocking_reasons":["v2_offline_only"],"strategy":{"step1":{"channel":"email"}}}';
 INSERT INTO strategy_plans(org_id,job_id,campaign_id,campaign_version,lead_id,body,fingerprint,content_hash,expires_at)
 VALUES(1,job,campaign,1,167,body,'fixture',md5(body::text),now()+interval '1 day') RETURNING id INTO pid;
 arg:=jsonb_build_object('org_id',1,'plan_id',pid,'step',1,'content_hash',md5(body::text));
 ASSERT outreach_dispatch_reserve(arg)->>'reason'='plan_blocked','offline blocker bypass';
 -- Fixture-only unblocked plan; production blocker is never removed.
 body:=jsonb_set(body,'{blocking_reasons}','[]');
 UPDATE strategy_plans v SET body=jsonb_set(v.body,'{blocking_reasons}','[]'),content_hash=md5(jsonb_set(v.body,'{blocking_reasons}','[]')::text) WHERE id=pid;
 arg:=arg||jsonb_build_object('content_hash',md5(body::text));
 ASSERT outreach_dispatch_check(arg)->>'reason'='approval_required';
 INSERT INTO strategy_approvals(org_id,plan_id,action,actor,content_hash) VALUES(1,pid,'approve','SCRATCH',md5(body::text));
 ASSERT outreach_dispatch_check(arg||'{"org_id":999999}')->>'reason'='not_found';
 ASSERT outreach_dispatch_check(arg||'{"step":2}')->>'reason'='invalid_request_or_unreviewed_followup';
 ASSERT outreach_dispatch_check(arg||'{"content_hash":"changed"}')->>'reason'='content_changed';
 r:=outreach_dispatch_reserve(arg);ASSERT r->>'reserved'='true','valid fixture not reserved';ASSERT r->>'execution_authorized'='false';lease:=r->>'lease';
 ASSERT outreach_dispatch_reserve(arg)->>'reason'='dispatch_already_reserved_or_recorded';
 SELECT count(*) INTO cnt FROM outreach_activities WHERE org_id=1 AND dispatch_metadata->>'plan_id'=pid::text;ASSERT cnt=1;
 arg:=arg||jsonb_build_object('lease',lease);ASSERT outreach_dispatch_recheck(arg)->>'ready'='true';
 ASSERT outreach_dispatch_recheck(arg||'{"lease":"wrong"}')->>'reason'='dispatch_requires_reconciliation';
 UPDATE outreach_activities SET dispatch_metadata=dispatch_metadata-'lease_until' WHERE dispatch_metadata->>'plan_id'=pid::text;
 ASSERT outreach_dispatch_recheck(arg)->>'reason'='dispatch_requires_reconciliation';
 UPDATE outreach_activities SET dispatch_metadata=dispatch_metadata||jsonb_build_object('lease_until',now()+interval '5 minutes','state','ambiguous') WHERE dispatch_metadata->>'plan_id'=pid::text;
 ASSERT outreach_dispatch_recheck(arg)->>'reason'='dispatch_requires_reconciliation';
 INSERT INTO strategy_approvals(org_id,plan_id,action,actor,content_hash) VALUES(1,pid,'revoke','SCRATCH',md5(body::text));
 ASSERT outreach_dispatch_check(arg)->>'reason'='approval_required';
 INSERT INTO strategy_approvals(org_id,plan_id,action,actor,content_hash) VALUES(1,pid,'approve','SCRATCH',md5(body::text));
 ctx:=current_setting('lead_test.context')::jsonb;
 PERFORM set_config('lead_test.context',(ctx||'{"replied":true}')::text,true);
 ASSERT outreach_dispatch_check(arg)->>'reason'='suppressed_replied_or_bounced';
 PERFORM set_config('lead_test.context',jsonb_set(ctx,'{report,trust,fields,emails}','null')::text,true);
 ASSERT outreach_dispatch_check(arg)->>'reason'='email_not_freshly_verified';
 PERFORM set_config('lead_test.context',(ctx||'{"fingerprint":"new"}')::text,true);
 ASSERT outreach_dispatch_check(arg)->>'reason'='stale_plan';
 ASSERT outreach_dispatch_check('null')->>'ready'='false';
 ASSERT outreach_dispatch_check('{"org_id":"9999999999","plan_id":"9999999999999999999","step":1}')->>'ready'='false';
END $test$;
SELECT 'PASS: scratch context double; offline blocker, approval/hash/tenant, first-step-only, one reservation, lease/reconciliation, revocation, reply, malformed verification, stale input, invalid IDs; no sending authority';
ROLLBACK;
