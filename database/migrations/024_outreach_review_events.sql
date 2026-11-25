-- Trusted backend operations only; no new webhook/table, sending or automatic resend.
BEGIN;
CREATE OR REPLACE FUNCTION outreach_record_stop(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a outreach_activities%ROWTYPE;event jsonb;old jsonb;events jsonb;
BEGIN
 IF coalesce(p->>'org_id','') !~ '^[1-9][0-9]{0,9}$' OR coalesce(p->>'activity_id','') !~ '^[1-9][0-9]{0,9}$'
 OR coalesce(p->>'kind','') NOT IN ('reply','bounce','opt_out','wrong_person','meeting_booked')
 OR nullif(p->>'event_id','') IS NULL OR length(p->>'event_id')>200
 OR nullif(p->>'source_ref','') IS NULL OR length(p->>'source_ref')>500 THEN
 RETURN '{"saved":false,"reason":"invalid_stop_event"}';END IF;
 SELECT * INTO a FROM outreach_activities WHERE org_id=(p->>'org_id')::integer AND id=(p->>'activity_id')::integer FOR UPDATE;
 IF NOT FOUND THEN RETURN '{"saved":false,"reason":"not_found"}';END IF;
 event:=jsonb_build_object('event_id',p->>'event_id','kind',p->>'kind','source_ref',p->>'source_ref');
 events:=CASE WHEN jsonb_typeof(a.dispatch_metadata->'stop_events')='array' THEN a.dispatch_metadata->'stop_events' ELSE '[]'::jsonb END;
 SELECT value INTO old FROM jsonb_array_elements(events) WHERE value->>'event_id'=p->>'event_id';
 IF old IS NOT NULL THEN RETURN jsonb_build_object('saved',old-'recorded_at'=event,'idempotent',old-'recorded_at'=event,'reason',CASE WHEN old-'recorded_at'=event THEN 'already_recorded' ELSE 'event_id_conflict' END);END IF;
 UPDATE outreach_activities SET replied_at=CASE WHEN p->>'kind'='reply' THEN coalesce(replied_at,clock_timestamp() AT TIME ZONE 'UTC') ELSE replied_at END,
 bounced_at=CASE WHEN p->>'kind'='bounce' THEN coalesce(bounced_at,clock_timestamp() AT TIME ZONE 'UTC') ELSE bounced_at END,
 dispatch_metadata=dispatch_metadata||jsonb_build_object('stop_reason',p->>'kind','stop_events',events||jsonb_build_array(event||jsonb_build_object('recorded_at',clock_timestamp())))
 WHERE id=a.id AND org_id=a.org_id;
 RETURN '{"saved":true,"outreach_stopped":true}';
EXCEPTION WHEN numeric_value_out_of_range THEN RETURN '{"saved":false,"reason":"invalid_stop_event"}';
END $$;

CREATE OR REPLACE FUNCTION outreach_reconcile_receipt(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a outreach_activities%ROWTYPE;receipt jsonb;t timestamptz;
BEGIN
 IF coalesce(p->>'org_id','') !~ '^[1-9][0-9]{0,9}$' OR coalesce(p->>'activity_id','') !~ '^[1-9][0-9]{0,9}$'
 OR coalesce(p->>'external_id','') !~ '^[a-fA-F0-9]{8,64}$'
 OR nullif(p->>'reviewer','') IS NULL OR length(p->>'reviewer')>200
 OR nullif(p->>'source_ref','') IS NULL OR length(p->>'source_ref')>500 THEN
 RETURN '{"saved":false,"reason":"reviewed_receipt_required","retry_allowed":false}';END IF;
 t:=(p->>'accepted_at')::timestamptz;
 IF t IS NULL OR NOT isfinite(t) OR t>clock_timestamp() THEN RETURN '{"saved":false,"reason":"invalid_receipt_time","retry_allowed":false}';END IF;
 SELECT * INTO a FROM outreach_activities WHERE org_id=(p->>'org_id')::integer AND id=(p->>'activity_id')::integer FOR UPDATE;
 IF NOT FOUND OR a.dispatch_metadata->>'content_hash' IS DISTINCT FROM p->>'content_hash'
 OR a.dispatch_metadata->>'lease' IS DISTINCT FROM p->>'lease'
 OR coalesce(p->>'lease','')='' OR coalesce(p->>'content_hash','')='' THEN RETURN '{"saved":false,"reason":"identity_mismatch","retry_allowed":false}';END IF;
 IF a.dispatch_metadata->>'state'='provider_accepted' THEN
 RETURN jsonb_build_object('saved',a.external_id=p->>'external_id','idempotent',a.external_id=p->>'external_id','retry_allowed',false);END IF;
 IF a.dispatch_metadata->>'state' NOT IN ('attempting','ambiguous') OR a.dispatch_metadata->>'started_at' IS NULL
 OR t<(a.dispatch_metadata->>'started_at')::timestamptz THEN
 RETURN '{"saved":false,"reason":"reconciliation_state_or_time_mismatch","retry_allowed":false}';END IF;
 receipt:=jsonb_build_object('reviewer',p->>'reviewer','source_ref',p->>'source_ref','reviewed_at',clock_timestamp(),'mode','manual_provider_receipt_review');
 UPDATE outreach_activities SET status='provider_accepted',external_id=p->>'external_id',sent_at=t AT TIME ZONE 'UTC',
 dispatch_metadata=dispatch_metadata||jsonb_build_object('state','provider_accepted','reconciliation',receipt,'delivered',false) WHERE id=a.id AND org_id=a.org_id;
 RETURN '{"saved":true,"state":"provider_accepted","retry_allowed":false,"delivered":false}';
EXCEPTION WHEN numeric_value_out_of_range OR invalid_datetime_format OR datetime_field_overflow THEN
 RETURN '{"saved":false,"reason":"invalid_receipt","retry_allowed":false}';
END $$;

CREATE OR REPLACE FUNCTION outreach_review_queue(p_org integer) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT coalesce(jsonb_agg(row_data ORDER BY activity_id),'[]'::jsonb) FROM (
 SELECT id AS activity_id,jsonb_build_object('activity_id',id,'org_id',org_id,'lead_id',lead_id,'plan_id',dispatch_metadata->>'plan_id',
 'step',dispatch_metadata->>'step','state',dispatch_metadata->>'state','external_id',external_id,'created_at',created_at,'retry_allowed',false) AS row_data
 FROM outreach_activities WHERE org_id=p_org AND dispatch_metadata->>'state' IN ('ambiguous','attempting','reserved') ORDER BY id LIMIT 200
 ) q;
$$;
REVOKE ALL ON FUNCTION outreach_record_stop(jsonb),outreach_reconcile_receipt(jsonb),outreach_review_queue(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_record_stop(jsonb),outreach_reconcile_receipt(jsonb),outreach_review_queue(integer) TO n8n_user;
COMMIT;
