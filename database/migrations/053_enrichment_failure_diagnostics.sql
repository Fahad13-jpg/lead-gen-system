-- Classify unavailable sources accurately; unchanged leases, retries and last-good preservation.
BEGIN;
CREATE OR REPLACE FUNCTION enrichment_finish(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE t enrichment_tasks%ROWTYPE;r jsonb:=p->'result';outcome text;
BEGIN
 IF (CASE WHEN jsonb_typeof(p)='object' THEN coalesce(p->>'id' ~ '^[0-9]{1,18}$',false) ELSE false END) THEN NULL; ELSE RETURN '{"saved":false,"status":"failed","reason":"invalid_payload"}';END IF;
 SELECT * INTO t FROM enrichment_tasks WHERE id=(p->>'id')::bigint FOR UPDATE;
 IF NOT FOUND OR t.status<>'processing' OR t.lease IS DISTINCT FROM p->>'lease' OR t.lease_until<=now() THEN RETURN '{"saved":false,"reason":"stale_lease"}';END IF;
 IF NOT contact_eligible(t.org_id,t.lead_id,t.staging_id) OR t.fingerprint IS DISTINCT FROM enrichment_fingerprint(t.org_id,t.lead_id,t.kind) THEN
 UPDATE enrichment_tasks SET status='pending',attempts=0,next_attempt=now(),lease=NULL,lease_until=NULL WHERE id=t.id;RETURN '{"saved":false,"reason":"source_changed"}';END IF;
 outcome:=CASE WHEN p->>'status' IN ('complete','partial') AND r->>'version'='enrichment_v1' THEN p->>'status' ELSE 'failed' END;
 IF t.kind='basic' AND (jsonb_typeof(r) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM (VALUES(r->'pages'),(r->'evidence'),(r->'services'),(r->'quality_flags'),(r->'signals'->'social'->'facebook'),(r->'signals'->'social'->'instagram'),(r->'signals'->'web_presence'->'checks')) a(v) WHERE jsonb_typeof(v) IS DISTINCT FROM 'array')) THEN outcome:='failed';END IF;
 IF t.kind='basic' AND (r->>'status'='failed' OR r->>'reason'='blocked_target' OR
 (CASE WHEN jsonb_typeof(r->'pages')='array' THEN jsonb_array_length(r->'pages')>0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'pages') x WHERE x->>'usable_html'='true') ELSE true END)) THEN outcome:='failed';END IF;
 -- Failed refreshes are recorded only in attempt history. Preserve last good evidence and its timestamps.
 IF outcome IN ('complete','partial') THEN
 r:=r||jsonb_build_object('input_fingerprint',t.fingerprint);
 INSERT INTO enrichment_profiles(org_id,lead_id) VALUES(t.org_id,t.lead_id) ON CONFLICT DO NOTHING;
 IF t.kind='basic' THEN UPDATE enrichment_profiles SET basic=r,basic_at=now(),research=NULL,research_at=NULL WHERE org_id=t.org_id AND lead_id=t.lead_id;
 ELSE UPDATE enrichment_profiles SET research=r,research_at=now() WHERE org_id=t.org_id AND lead_id=t.lead_id;END IF;
 END IF;
 UPDATE enrichment_tasks SET status=CASE WHEN outcome='failed' AND attempts<3 THEN 'pending' ELSE outcome END,next_attempt=now()+interval '10 minutes',finished_at=now(),lease_until=NULL,error=CASE WHEN outcome='failed' THEN CASE WHEN r->>'version'='enrichment_v1' AND r->>'failure_class' IN ('dns','blocked','not_found','non_html','unavailable') AND (CASE WHEN jsonb_typeof(r->'pages')='array' THEN jsonb_array_length(r->'pages')>0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'pages') x WHERE x->>'usable_html'='true') ELSE false END) THEN 'source_'||(r->>'failure_class') WHEN r->>'reason'='temporary_source_failure' AND r->>'retryable'='true' THEN 'temporary_source_failure' ELSE 'invalid_worker_result' END ELSE NULL END WHERE id=t.id;
 UPDATE enrichment_attempts SET finished_at=now(),result=p WHERE lease=t.lease;
 RETURN jsonb_build_object('saved',outcome IN ('complete','partial'),'status',outcome);
END $$;

COMMIT;
