BEGIN;
CREATE TABLE IF NOT EXISTS enrichment_ai_controls (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 enabled boolean NOT NULL DEFAULT false,
 monthly_request_limit integer NOT NULL DEFAULT 0 CHECK(monthly_request_limit BETWEEN 0 AND 10000)
);
INSERT INTO enrichment_ai_controls(id) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS enrichment_ai_requests (
 lease text PRIMARY KEY REFERENCES enrichment_attempts(lease),
 task_id bigint NOT NULL REFERENCES enrichment_tasks(id),
 reserved_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz, status text NOT NULL DEFAULT 'reserved', usage jsonb
);
CREATE OR REPLACE FUNCTION enrichment_ai_reserve(p_id bigint,p_lease text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE cfg enrichment_ai_controls%ROWTYPE; t enrichment_tasks%ROWTYPE;
BEGIN
 SELECT * INTO cfg FROM enrichment_ai_controls WHERE id FOR UPDATE;
 IF NOT cfg.enabled OR cfg.monthly_request_limit=0 THEN RETURN false; END IF;
 SELECT * INTO t FROM enrichment_tasks WHERE id=p_id AND lease=p_lease AND kind='research'
 AND status='processing' AND lease_until>now() FOR UPDATE;
 IF NOT FOUND OR enrichment_task_input(p_id,p_lease) IS NULL THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM enrichment_ai_requests WHERE lease=p_lease) THEN RETURN false; END IF;
 IF (SELECT count(*) FROM enrichment_ai_requests WHERE reserved_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') >= cfg.monthly_request_limit THEN RETURN false; END IF;
 INSERT INTO enrichment_ai_requests(lease,task_id) VALUES(p_lease,p_id);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION enrichment_ai_reserve(bigint,text) FROM PUBLIC;
COMMIT;
