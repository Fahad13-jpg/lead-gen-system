-- Scratch only. Context double and fixture rows are rolled back.
BEGIN;
SET LOCAL ROLE v2_scratch_runtime;
CREATE OR REPLACE FUNCTION strategy_context(p_org integer,p_campaign bigint,p_lead integer) RETURNS jsonb
LANGUAGE sql STABLE AS $$ SELECT '{"fingerprint":"fixture","suppressed":false,"replied":false,"lead":{"email":"test@example.org"},"report":{"trust":{"fields":{"emails":[{"value":"test@example.org","status":"provider_verified"}]}}}}'::jsonb $$;
DO $test$
DECLARE c bigint;j bigint;pid bigint;b jsonb;p jsonb;r jsonb;aid integer;second_arg jsonb;
BEGIN
 ASSERT NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user);
 INSERT INTO strategy_campaigns(org_id) VALUES(1) RETURNING id INTO c;
 INSERT INTO strategy_campaign_versions(org_id,campaign_id,version,config) VALUES(1,c,1,
 '{"email_dispatch":{"enabled":true,"credential_ref":"MOCK","sender_email":"demo@example.org","daily_limit":1}}');
 INSERT INTO strategy_jobs(org_id,campaign_id,campaign_version,lead_id,request_id,status,fingerprint)
 VALUES(1,c,1,167,'email-lifecycle-'||c,'completed','fixture') RETURNING id INTO j;
 b:='{"version":"strategy_v2","state":"template_completed","execution_authorized":false,"validation_errors":[],"blocking_reasons":[],"strategy":{"step1":{"channel":"email"}},"artifacts":{"email_draft":{"subject":"Demo","body":"Approved demo"}}}';
 UPDATE cleaned_leads SET email='test@example.org' WHERE id=167 AND org_id=1;
 INSERT INTO strategy_plans(org_id,job_id,campaign_id,campaign_version,lead_id,body,fingerprint,content_hash,expires_at)
 VALUES(1,j,c,1,167,b,'fixture',md5(b::text),now()+interval '1 day') RETURNING id INTO pid;
 INSERT INTO strategy_approvals(org_id,plan_id,action,actor,content_hash) VALUES(1,pid,'approve','SCRATCH',md5(b::text));
 p:=jsonb_build_object('org_id',1,'plan_id',pid,'step',1,'content_hash',md5(b::text));
 r:=outreach_dispatch_reserve(p);p:=p||jsonb_build_object('lease',r->>'lease','credential_ref','MOCK','sender_email','demo@example.org','to_email','test@example.org','subject','Demo','body','Approved demo');aid:=(r->>'activity_id')::integer;
 ASSERT outreach_email_begin(p)->>'reason'='plan_transport_not_authorized';
 -- Scratch-only approved release fixture. No production plan is modified.
 b:=jsonb_set(b,'{execution_authorized}','true');
 UPDATE strategy_plans SET body=b,content_hash=md5(b::text) WHERE id=pid;
 UPDATE strategy_approvals SET content_hash=md5(b::text) WHERE plan_id=pid;
 UPDATE outreach_activities SET dispatch_metadata=jsonb_set(dispatch_metadata,'{content_hash}',to_jsonb(md5(b::text))) WHERE id=aid;
 p:=p||jsonb_build_object('content_hash',md5(b::text));
 ASSERT outreach_email_begin(p||'{"to_email":"other@example.org"}')->>'reason'='approved_message_or_recipient_mismatch';
 ASSERT outreach_email_begin(p||'{"body":"altered"}')->>'reason'='approved_message_or_recipient_mismatch';
 ASSERT outreach_email_begin(p||'{"credential_ref":"other"}')->>'reason'='sender_policy_missing_or_mismatched';
 ASSERT outreach_email_begin(p||'{"sender_email":"other@example.org"}')->>'reason'='sender_policy_missing_or_mismatched';
 ASSERT outreach_email_finish(p||'{"outcome":"provider_accepted","external_id":"1234abcdef"}')->>'saved'='false','receipt before attempt';
 r:=outreach_email_begin(p);ASSERT r->>'execution_authorized'='true','fixture begin';
 ASSERT outreach_email_begin(p)->>'ready'='false','double begin';
 ASSERT (SELECT dispatch_metadata->>'attempts' FROM outreach_activities WHERE id=aid)='1';
 ASSERT outreach_email_finish(p||'{"org_id":999999}')->>'saved'='false';
 -- Unknown outcome consumes capacity and is not reset for retry.
 ASSERT outreach_email_finish(p||'{"outcome":"timeout"}')->>'state'='ambiguous';
 ASSERT outreach_email_finish(p||'{"outcome":"timeout"}')->>'idempotent'='true';
 ASSERT outreach_email_finish(p||'{"outcome":"provider_accepted","external_id":"1234abcdef"}')->>'reason'='reconciliation_required';
 ASSERT (SELECT sent_at IS NULL FROM outreach_activities WHERE id=aid);
 -- Different plan, same org quota; fixture identity is independently reserved.
 INSERT INTO strategy_jobs(org_id,campaign_id,campaign_version,lead_id,request_id,status,fingerprint)
 VALUES(1,c,1,167,'email-lifecycle-second-'||c,'completed','fixture') RETURNING id INTO j;
 INSERT INTO strategy_plans(org_id,job_id,campaign_id,campaign_version,lead_id,body,fingerprint,content_hash,expires_at)
 VALUES(1,j,c,1,167,b,'fixture',md5(b::text),now()+interval '1 day') RETURNING id INTO pid;
 INSERT INTO strategy_approvals(org_id,plan_id,action,actor,content_hash) VALUES(1,pid,'approve','SCRATCH',md5(b::text));
 second_arg:=p||jsonb_build_object('plan_id',pid);r:=outreach_dispatch_reserve(second_arg);
 second_arg:=second_arg||jsonb_build_object('lease',r->>'lease');
 ASSERT outreach_email_begin(second_arg)->>'reason'='daily_quota_reached';
 -- Raising only the fixture policy permits testing receipt persistence.
 UPDATE strategy_campaign_versions SET config=jsonb_set(config,'{email_dispatch,daily_limit}','2') WHERE campaign_id=c;
 ASSERT outreach_email_begin(second_arg)->>'execution_authorized'='true';
 UPDATE outreach_activities SET dispatch_metadata=jsonb_set(dispatch_metadata,'{lease_until}',to_jsonb((now()-interval '1 day')::text)) WHERE id=(r->>'activity_id')::integer;
 ASSERT outreach_email_finish(second_arg||'{"outcome":"provider_accepted","external_id":"1234abcdef"}')->>'state'='provider_accepted';
 ASSERT outreach_email_finish(second_arg||'{"outcome":"provider_accepted","external_id":"1234abcdef"}')->>'idempotent'='true';
 ASSERT outreach_email_finish(second_arg||'{"outcome":"provider_accepted","external_id":"9876abcdef"}')->>'saved'='false';
 ASSERT outreach_email_finish('null')->>'saved'='false';
 ASSERT outreach_email_finish('{"org_id":"9999999999","plan_id":"1","step":1,"lease":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","content_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}')->>'saved'='false';
END $test$;
SELECT 'PASS: non-superuser, disabled plan, mapping, begin once, org quota, ambiguous retention, idempotent receipts, late receipt, tenant isolation; scratch context double';
ROLLBACK;
