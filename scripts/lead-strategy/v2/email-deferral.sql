CREATE OR REPLACE FUNCTION outreach_email_can_resume(m jsonb) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE due timestamptz;
BEGIN
 IF m->>'state' IS DISTINCT FROM 'reserved' OR m->>'attempts' IS DISTINCT FROM '0'
 OR m ? 'started_at' OR nullif(m->>'lease','') IS NOT NULL
 OR nullif(m->>'deferred_until','') IS NULL THEN RETURN false; END IF;
 due:=(m->>'deferred_until')::timestamptz;
 RETURN isfinite(due) AND due<=statement_timestamp();
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN false;
END $$;

CREATE OR REPLACE FUNCTION outreach_email_defer(p jsonb, reason text, due timestamptz) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a outreach_activities%ROWTYPE;
BEGIN
 IF coalesce(p->>'org_id','') !~ '^[1-9][0-9]{0,9}$' OR coalesce(p->>'plan_id','') !~ '^[1-9][0-9]{0,18}$'
 OR coalesce(p->>'step','') !~ '^([1-9]|10)$' OR coalesce(p->>'lease','') !~ '^[a-f0-9]{32}$'
 OR reason IS NULL OR reason NOT IN ('daily_quota_reached','mailbox_rolling_limit_reached','mailbox_spacing_required','outside_sending_window')
 OR due IS NULL OR NOT isfinite(due) THEN RETURN '{"ready":false,"execution_authorized":false,"reason":"invalid_deferral"}'; END IF;
 SELECT * INTO a FROM outreach_activities WHERE org_id=(p->>'org_id')::integer
 AND dispatch_metadata->>'plan_id'=p->>'plan_id' AND dispatch_metadata->>'step'=p->>'step'
 AND dispatch_metadata->>'lease'=p->>'lease' FOR UPDATE;
 IF NOT FOUND OR a.dispatch_metadata->>'content_hash' IS DISTINCT FROM p->>'content_hash'
 OR a.dispatch_metadata->>'state' IS DISTINCT FROM 'reserved' OR a.dispatch_metadata->>'attempts' IS DISTINCT FROM '0'
 OR a.dispatch_metadata ? 'started_at' THEN
 RETURN '{"ready":false,"execution_authorized":false,"reason":"attempt_not_safe_to_defer"}'; END IF;
 -- Never recycle an attempting/ambiguous/accepted send. Revoke the old lease.
 due:=greatest(due,clock_timestamp()+interval '5 minutes');
 UPDATE outreach_activities SET dispatch_metadata=(dispatch_metadata-'lease'-'lease_until')||jsonb_build_object(
 'deferred_until',due,'defer_reason',reason,'last_deferred_at',clock_timestamp()) WHERE id=a.id AND org_id=a.org_id;
 RETURN jsonb_build_object('ready',false,'execution_authorized',false,'queued',true,'reason',reason,'next_check_at',due);
EXCEPTION WHEN numeric_value_out_of_range THEN RETURN '{"ready":false,"execution_authorized":false,"reason":"invalid_deferral"}';
END $$;
