\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE prior_jobs jsonb;prior_plans integer;prior_requests integer;claims integer;j strategy_jobs%ROWTYPE;gate jsonb;
BEGIN
 ASSERT current_database()='scratch_contact_refresh_20261108';
 UPDATE strategy_controls SET enabled=false WHERE id;
 UPDATE strategy_ai_controls SET enabled=false,monthly_limit=0;
 SELECT jsonb_agg(to_jsonb(t) ORDER BY id) INTO prior_jobs FROM strategy_jobs t;
 SELECT count(*) INTO prior_plans FROM strategy_plans;SELECT count(*) INTO prior_requests FROM strategy_ai_requests;
 SELECT count(*) INTO claims FROM strategy_claim('paused-management-fixture',2);ASSERT claims=0,'Paused scheduler claimed work';
 ASSERT (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM strategy_jobs t) IS NOT DISTINCT FROM prior_jobs,'Paused claim changed jobs';
 SELECT * INTO j FROM strategy_jobs ORDER BY id LIMIT 1;ASSERT FOUND,'Existing job fixture required';
 UPDATE strategy_jobs SET status='processing',lease=md5('paused-management-fixture'),lease_until=now()+interval '5 minutes' WHERE id=j.id;
 gate:=strategy_ai_gate(jsonb_build_object('id',j.id,'org_id',j.org_id,'lease',md5('paused-management-fixture'),'wants_ai',true));
 ASSERT gate->>'allowed'='false' AND gate->>'reason'='ai_disabled','Zero allowance did not block a valid leased request';
 ASSERT (SELECT count(*) FROM strategy_ai_requests)=prior_requests,'Disabled AI reserved a request';
 ASSERT (SELECT count(*) FROM strategy_plans)=prior_plans,'Paused management generated a plan';
 RAISE NOTICE 'PASS: paused claims unchanged, valid leased AI request denied at zero allowance, no new requests/plans';
END $$;
ROLLBACK;
