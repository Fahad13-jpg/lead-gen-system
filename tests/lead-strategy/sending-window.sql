BEGIN;
SET LOCAL ROLE v2_scratch_runtime;
DO $test$
DECLARE cfg jsonb:='{"timezone":"Asia/Karachi","sending_window":{"start_hour":9,"end_hour":17,"weekdays":[1,2,3,4,5]}}';bad jsonb;
BEGIN
 ASSERT outreach_email_window(cfg,'2026-10-15 03:59:59+00')->>'allowed'='false';
 ASSERT outreach_email_window(cfg,'2026-10-15 04:00:00+00')->>'allowed'='true';
 ASSERT outreach_email_window(cfg,'2026-10-15 11:59:59+00')->>'allowed'='true';
 ASSERT outreach_email_window(cfg,'2026-10-15 12:00:00+00')->>'allowed'='false';
 ASSERT outreach_email_window(cfg,'2026-10-17 06:00:00+00')->>'allowed'='false';
 ASSERT outreach_email_window(cfg||'{"timezone":"America/New_York"}','2026-07-15 13:00:00+00')->>'allowed'='true';
 ASSERT outreach_email_window(cfg||'{"timezone":"America/New_York"}','2026-01-15 14:00:00+00')->>'allowed'='true';
 ASSERT outreach_email_window(cfg||'{"timezone":"Not/AZone"}',now())->>'allowed'='false';
 FOREACH bad IN ARRAY ARRAY['null'::jsonb,'"Monday"'::jsonb,'{}'::jsonb,'[]'::jsonb,'[0]'::jsonb,'["1"]'::jsonb] LOOP
 ASSERT outreach_email_window(jsonb_set(cfg,'{sending_window,weekdays}',bad),now())->>'allowed'='false';
 END LOOP;
 ASSERT outreach_email_window(cfg,'infinity')->>'allowed'='false';
 ASSERT outreach_email_window(cfg,NULL)->>'allowed'='false';
END $test$;
SELECT 'PASS: boundary hours, weekend, timezone/DST seasons and malformed windows fail closed';
ROLLBACK;
