-- Local/scratch only. Trusted operator function, never an automatic error retry.
BEGIN;
CREATE OR REPLACE FUNCTION outreach_delivery_scan_restart(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE a outreach_activities%ROWTYPE; previous jsonb; attempts integer;
BEGIN
 IF coalesce(p->>'org_id','') !~ '^[1-9][0-9]{0,9}$'
 OR coalesce(p->>'activity_id','') !~ '^[1-9][0-9]{0,9}$'
 OR jsonb_typeof(p->'expected_scan') IS DISTINCT FROM 'object'
 OR coalesce(length(trim(p->>'actor')),0) NOT BETWEEN 1 AND 120
 OR coalesce(p->>'reason','') NOT IN ('page_token_rejected','operator_verified_scan_interruption') THEN
 RETURN '{"saved":false,"reason":"invalid_recovery_request"}'; END IF;
 SELECT * INTO a FROM outreach_activities WHERE org_id=(p->>'org_id')::integer
 AND id=(p->>'activity_id')::integer FOR UPDATE;
 IF NOT FOUND OR a.channel<>'email' OR a.dispatch_metadata->>'state' IS DISTINCT FROM 'provider_accepted'
 OR nullif(p->>'credential_ref','') IS NULL OR nullif(p->>'sender_email','') IS NULL
 OR a.dispatch_metadata->>'credential_ref' IS DISTINCT FROM p->>'credential_ref'
 OR a.dispatch_metadata->>'sender_email' IS DISTINCT FROM p->>'sender_email' THEN
 RETURN '{"saved":false,"reason":"recovery_scope_mismatch"}'; END IF;
 previous:=a.dispatch_metadata->'delivery_scan';
 IF previous IS DISTINCT FROM p->'expected_scan' THEN
 RETURN '{"saved":false,"reason":"recovery_stale"}'; END IF;
 IF previous->>'complete' IS DISTINCT FROM 'false' OR previous->>'restart_pending'='true'
 OR nullif(previous->>'next_page_token','') IS NULL THEN
 RETURN '{"saved":false,"reason":"scan_not_restartable"}'; END IF;
 attempts:=coalesce((a.dispatch_metadata->'delivery_scan_recovery'->>'attempts')::integer,0);
 IF attempts<0 OR attempts>=2 THEN RETURN '{"saved":false,"reason":"recovery_limit_reached"}'; END IF;
 -- Replay the SAME window from page one. No evidence, suppression, checkpoint,
 -- review flag, send lease, reservation or plan approval is cleared.
 UPDATE outreach_activities SET dispatch_metadata=dispatch_metadata||jsonb_build_object(
 'delivery_scan',(previous-'next_page_token')||'{"restart_pending":true}'::jsonb,
 'delivery_scan_recovery',jsonb_build_object('attempts',attempts+1,'actor',trim(p->>'actor'),
 'reason',p->>'reason','requested_at',clock_timestamp(),'window_start',previous->'window_start',
 'window_end',previous->'window_end')) WHERE id=a.id AND org_id=a.org_id;
 RETURN '{"saved":true,"complete":false,"restart_pending":true}';
EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN
 RETURN '{"saved":false,"reason":"invalid_recovery_request"}';
END $$;
REVOKE ALL ON FUNCTION outreach_delivery_scan_restart(jsonb) FROM PUBLIC;
-- The migration owner retains access. Grant EXECUTE only to a trusted operator
-- role during reviewed deployment; do not expose through customer SQL access.
COMMIT;
