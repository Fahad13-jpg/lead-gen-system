BEGIN;
ALTER TABLE enrichment_ai_controls ADD COLUMN IF NOT EXISTS cooldown_until timestamptz;
CREATE OR REPLACE FUNCTION enrichment_ai_gate(p_id bigint,p_lease text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE cfg enrichment_ai_controls%ROWTYPE;
BEGIN
 SELECT * INTO cfg FROM enrichment_ai_controls WHERE id FOR UPDATE;
 IF NOT cfg.enabled OR cfg.monthly_request_limit=0 THEN RETURN '{"allowed":false,"reason":"disabled"}'; END IF;
 IF cfg.cooldown_until>now() OR EXISTS(SELECT 1 FROM enrichment_ai_requests WHERE reserved_at>now()-interval '65 seconds') THEN
 RETURN '{"allowed":false,"reason":"rate_limited"}'; END IF;
 IF (SELECT count(*) FROM enrichment_ai_requests WHERE reserved_at>=(date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'))>=20 THEN
 RETURN '{"allowed":false,"reason":"daily_limit"}'; END IF;
 IF enrichment_ai_reserve(p_id,p_lease) THEN RETURN '{"allowed":true}'; END IF;
 RETURN '{"allowed":false,"reason":"quota_or_lease_blocked"}';
END $$;
CREATE OR REPLACE FUNCTION enrichment_ai_record(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a jsonb:=p->'result'->'ai_research'; changed integer;
BEGIN
 UPDATE enrichment_ai_requests SET finished_at=now(),status=a->>'status',usage=a->'usage'
 WHERE task_id=(p->>'id')::bigint AND lease=p->>'lease' AND finished_at IS NULL;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed=1 AND a->>'status'='rate_limited' THEN
 UPDATE enrichment_ai_controls SET cooldown_until=greatest(coalesce(cooldown_until,now()),now()+interval '15 minutes'); END IF;
 RETURN p;
END $$;
CREATE OR REPLACE FUNCTION enrichment_native_finish(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE saved jsonb; reason text:=p->'result'->'ai_research'->>'status';
BEGIN
 saved:=enrichment_finish(p);
 IF saved->>'saved'='true' AND reason IN ('rate_limited','daily_limit') THEN
 UPDATE enrichment_tasks SET status='pending',attempts=0,next_attempt=CASE WHEN reason='daily_limit'
 THEN (date_trunc('day',now() AT TIME ZONE 'UTC')+interval '1 day') AT TIME ZONE 'UTC'
 ELSE greatest(now()+interval '5 minutes',coalesce((SELECT cooldown_until FROM enrichment_ai_controls WHERE id),now())) END,
 lease=NULL,lease_until=NULL WHERE id=(p->>'id')::bigint;
 END IF;
 RETURN saved;
END $$;
REVOKE ALL ON FUNCTION enrichment_ai_gate(bigint,text),enrichment_ai_record(jsonb),enrichment_native_finish(jsonb) FROM PUBLIC;
COMMIT;
