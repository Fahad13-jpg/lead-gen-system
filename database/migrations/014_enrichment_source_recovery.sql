-- Preserve bounded retry behavior and report transient website failures accurately.
BEGIN;
CREATE OR REPLACE FUNCTION enrichment_finish(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE t enrichment_tasks%ROWTYPE;r jsonb:=p->'result';outcome text;
BEGIN
 SELECT * INTO t FROM enrichment_tasks WHERE id=(p->>'id')::bigint FOR UPDATE;
 IF NOT FOUND OR t.status<>'processing' OR t.lease IS DISTINCT FROM p->>'lease' OR t.lease_until<=now() THEN RETURN '{"saved":false,"reason":"stale_lease"}';END IF;
 IF NOT contact_eligible(t.org_id,t.lead_id,t.staging_id) OR t.fingerprint IS DISTINCT FROM enrichment_fingerprint(t.org_id,t.lead_id,t.kind) THEN
 UPDATE enrichment_tasks SET status='pending',attempts=0,next_attempt=now(),lease=NULL,lease_until=NULL WHERE id=t.id;RETURN '{"saved":false,"reason":"source_changed"}';END IF;
 outcome:=p->>'status';IF outcome NOT IN ('complete','partial') OR r->>'version' IS DISTINCT FROM 'enrichment_v1' THEN outcome:='failed';END IF;
 IF outcome IN ('complete','partial') THEN
 r:=r||jsonb_build_object('input_fingerprint',t.fingerprint);
 INSERT INTO enrichment_profiles(org_id,lead_id) VALUES(t.org_id,t.lead_id) ON CONFLICT DO NOTHING;
 IF t.kind='basic' THEN UPDATE enrichment_profiles SET basic=r,basic_at=now(),research=NULL,research_at=NULL WHERE org_id=t.org_id AND lead_id=t.lead_id;
 ELSE UPDATE enrichment_profiles SET research=r,research_at=now() WHERE org_id=t.org_id AND lead_id=t.lead_id;END IF;
 END IF;
 UPDATE enrichment_tasks SET status=CASE WHEN outcome='failed' AND attempts<3 THEN 'pending' ELSE outcome END,next_attempt=now()+interval '10 minutes',finished_at=now(),lease_until=NULL,error=CASE WHEN outcome='failed' THEN CASE WHEN r->>'reason'='temporary_source_failure' AND r->>'retryable'='true' THEN 'temporary_source_failure' ELSE 'invalid_worker_result' END ELSE NULL END WHERE id=t.id;
 UPDATE enrichment_attempts SET finished_at=now(),result=p WHERE lease=t.lease;
 RETURN jsonb_build_object('saved',outcome IN ('complete','partial'),'status',outcome);
END $$;
COMMIT;
