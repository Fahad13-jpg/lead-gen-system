-- Scratch only. Run after proposed 018. Test records roll back.
BEGIN;
SET LOCAL ROLE v2_scratch_runtime;
DO $test$
DECLARE first_id integer; second_id integer; payload jsonb;
BEGIN
 ASSERT NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user);
 INSERT INTO outreach_activities(org_id,lead_id,channel,status,dispatch_metadata)
 VALUES(1,167,'email','pending','{"plan_id":"987654321","step":"1"}') RETURNING id INTO first_id;
 INSERT INTO outreach_activities(org_id,lead_id,channel,status,dispatch_metadata)
 VALUES(1,167,'email','pending','{"plan_id":"987654321","step":"1"}') ON CONFLICT DO NOTHING RETURNING id INTO second_id;
 ASSERT second_id IS NULL,'duplicate plan step admitted';
 INSERT INTO outreach_activities(org_id,lead_id,channel,status,dispatch_metadata)
 VALUES(1,167,'email','pending','{"plan_id":"987654321","step":"2"}') RETURNING id INTO second_id;
 ASSERT second_id IS NOT NULL,'distinct step rejected';
 FOR payload IN SELECT value FROM jsonb_array_elements('[null,[],"text",{"step":"1"},{"plan_id":"1"},{"plan_id":"01","step":"1"},{"plan_id":1,"step":"1"}]') LOOP
  BEGIN
   INSERT INTO outreach_activities(org_id,lead_id,channel,status,dispatch_metadata) VALUES(1,167,'email','pending',payload);
   RAISE EXCEPTION 'Invalid metadata accepted: %',payload;
  EXCEPTION WHEN check_violation THEN NULL;
  END;
 END LOOP;
 BEGIN
  INSERT INTO outreach_activities(lead_id,channel,status,dispatch_metadata) VALUES(167,'email','pending','{"plan_id":"987654321","step":"3"}');
  RAISE EXCEPTION 'Unscoped dispatch accepted';
 EXCEPTION WHEN check_violation OR not_null_violation THEN NULL;
 END;
 INSERT INTO outreach_activities(org_id,lead_id,channel,status) VALUES(1,167,'email','pending');
END $test$;
SELECT 'PASS: non-superuser, duplicate dispatch identity, distinct step, malformed/null metadata, org requirement and legacy default';
ROLLBACK;
