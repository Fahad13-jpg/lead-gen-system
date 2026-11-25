-- Local/scratch candidate. Compare-and-set checkpoint; no new tables.
BEGIN;
CREATE OR REPLACE FUNCTION outreach_reply_scan_finish(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a outreach_activities%ROWTYPE; e jsonb; result jsonb; report jsonb; event jsonb; reviews jsonb; previous jsonb; next_scan jsonb;
BEGIN
 IF coalesce(p->>'org_id','') !~ '^[1-9][0-9]{0,9}$' OR coalesce(p->>'activity_id','') !~ '^[1-9][0-9]{0,9}$'
 OR jsonb_typeof(p->'events') IS DISTINCT FROM 'array' OR jsonb_typeof(p->'reviews') IS DISTINCT FROM 'array' THEN
 RETURN '{"saved":false,"reason":"invalid_scan"}'; END IF;
 IF jsonb_array_length(p->'events')>200 OR jsonb_array_length(p->'reviews')>200 THEN
 RETURN '{"saved":false,"reason":"scan_too_large"}'; END IF;
 SELECT * INTO a FROM outreach_activities WHERE org_id=(p->>'org_id')::integer AND id=(p->>'activity_id')::integer FOR UPDATE;
 IF NOT FOUND OR a.channel<>'email' OR a.dispatch_metadata->>'state' IS DISTINCT FROM 'provider_accepted'
 OR nullif(p->>'credential_ref','') IS NULL OR nullif(p->>'sender_email','') IS NULL
 OR a.dispatch_metadata->>'credential_ref' IS DISTINCT FROM p->>'credential_ref'
 OR a.dispatch_metadata->>'sender_email' IS DISTINCT FROM p->>'sender_email'
 OR a.external_id IS DISTINCT FROM p->>'external_id' THEN
 RETURN '{"saved":false,"reason":"sender_or_activity_mismatch"}'; END IF;
 previous:=coalesce(a.dispatch_metadata->'delivery_scan','{}'::jsonb);
 next_scan:=p->'delivery_scan_next';
 IF jsonb_typeof(next_scan) IS DISTINCT FROM 'object' OR p->'delivery_scan_previous' IS DISTINCT FROM previous THEN
 RETURN '{"saved":false,"reason":"delivery_scan_stale_or_missing"}'; END IF;
 IF jsonb_typeof(next_scan->'complete') IS DISTINCT FROM 'boolean'
 OR jsonb_typeof(next_scan->'review_required') IS DISTINCT FROM 'boolean'
 OR coalesce(next_scan->>'window_start','') !~ '^[1-9][0-9]{0,15}$'
 OR coalesce(next_scan->>'window_end','') !~ '^[1-9][0-9]{0,15}$' THEN
 RETURN '{"saved":false,"reason":"delivery_scan_invalid"}'; END IF;
 IF (next_scan->>'window_end')::bigint<(next_scan->>'window_start')::bigint
 OR (next_scan->>'window_end')::bigint>extract(epoch FROM clock_timestamp())*1000+1000 THEN
 RETURN '{"saved":false,"reason":"delivery_scan_window_invalid"}'; END IF;
 IF previous->>'complete'='false' THEN
 IF next_scan->'window_start' IS DISTINCT FROM previous->'window_start' OR next_scan->'window_end' IS DISTINCT FROM previous->'window_end' THEN
 RETURN '{"saved":false,"reason":"delivery_scan_window_changed"}'; END IF;
 ELSIF previous ? 'checked_through' AND next_scan->'window_start' IS DISTINCT FROM previous->'checked_through' THEN
 RETURN '{"saved":false,"reason":"delivery_scan_checkpoint_gap"}'; END IF;
 IF next_scan->>'complete'='true' THEN
 IF next_scan->'checked_through' IS DISTINCT FROM next_scan->'window_end' OR nullif(next_scan->>'next_page_token','') IS NOT NULL THEN
 RETURN '{"saved":false,"reason":"delivery_scan_checkpoint_invalid"}'; END IF;
 ELSE
 IF nullif(next_scan->>'next_page_token','') IS NULL OR length(next_scan->>'next_page_token')>2000
 OR next_scan->>'next_page_token'=previous->>'next_page_token'
 OR coalesce(next_scan->'checked_through','null'::jsonb) IS DISTINCT FROM coalesce(previous->'checked_through','null'::jsonb) THEN
 RETURN '{"saved":false,"reason":"delivery_scan_page_invalid"}'; END IF;
 END IF;
 next_scan:=jsonb_set(next_scan,'{review_required}',to_jsonb(coalesce(previous->>'review_required'='true',false) OR next_scan->>'review_required'='true' OR jsonb_array_length(p->'reviews')>0));
 -- Validate the complete batch before any write.
 FOR e IN SELECT value FROM jsonb_array_elements(p->'events') LOOP
  event:=e->'stop_event';
  IF event->>'org_id' IS DISTINCT FROM p->>'org_id' OR event->>'activity_id' IS DISTINCT FROM p->>'activity_id'
  OR coalesce(event->>'kind','') NOT IN ('reply','opt_out','bounce') OR coalesce(event->>'event_id','') !~ '^gmail:[a-fA-F0-9]{8,64}$'
  OR coalesce(event->>'source_ref','') !~ '^gmail-thread:[a-fA-F0-9]{8,64}$' THEN
   RETURN '{"saved":false,"reason":"event_scope_mismatch"}'; END IF;
 END LOOP;
 FOR e IN SELECT value FROM jsonb_array_elements(p->'events') LOOP
  result:=outreach_record_stop(e->'stop_event');
  IF result->>'saved' IS DISTINCT FROM 'true' THEN
   RAISE EXCEPTION 'reply_stop_not_saved'; -- whole statement rolls back; no cursor advancement
  END IF;
 END LOOP;
 SELECT coalesce(jsonb_agg(jsonb_build_object('message_id',value->>'message_id','category',value->>'category',
  'subject',left(value->>'subject',500),'body_excerpt',left(value->>'body',2000),'received_at',value->>'received_at')),'[]'::jsonb)
 INTO report FROM (SELECT value FROM jsonb_array_elements(p->'events') LIMIT 20) q;
 SELECT coalesce(jsonb_agg(jsonb_build_object('message_id',left(value->>'message_id',64),'reason',left(value->>'reason',100))),'[]'::jsonb)
 INTO reviews FROM (SELECT value FROM jsonb_array_elements(p->'reviews') LIMIT 20) q;
 UPDATE outreach_activities SET dispatch_metadata=dispatch_metadata||jsonb_build_object(
  'delivery_scan',next_scan,'reply_scan',jsonb_build_object('checked_at',clock_timestamp(),'events',report,'review_required',jsonb_array_length(p->'reviews')>0,
   'reviews',reviews,'review_count',jsonb_array_length(p->'reviews'),'matched_count',jsonb_array_length(p->'events')))
 WHERE org_id=a.org_id AND id=a.id;
 RETURN jsonb_build_object('saved',true,'matched_count',jsonb_array_length(p->'events'),'review_count',jsonb_array_length(p->'reviews'));
EXCEPTION WHEN numeric_value_out_of_range THEN RETURN '{"saved":false,"reason":"invalid_scan_id"}';
END $$;
CREATE OR REPLACE FUNCTION outreach_email_contact_gate(p_org integer,p_lead integer,recipient text,sender text)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE a record; checked timestamptz;
BEGIN
 IF p_org IS NULL OR p_lead IS NULL OR nullif(trim(recipient),'') IS NULL OR nullif(trim(sender),'') IS NULL THEN
 RETURN '{"allowed":false,"reason":"contact_identity_missing"}'; END IF;
 FOR a IN SELECT oa.*,cl.email AS current_email FROM outreach_activities oa
 LEFT JOIN cleaned_leads cl ON cl.id=oa.lead_id AND cl.org_id=oa.org_id
 WHERE oa.org_id=p_org AND oa.channel='email' AND (
 oa.lead_id=p_lead OR lower(trim(coalesce(nullif(oa.dispatch_metadata->>'recipient_email',''),cl.email)))=lower(trim(recipient))) LOOP
  -- Audit events retain suppression even if a later event changes stop_reason.
  IF a.bounced_at IS NOT NULL OR a.dispatch_metadata->>'stop_reason' IN ('opt_out','bounce')
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(a.dispatch_metadata->'stop_events')='array'
     THEN a.dispatch_metadata->'stop_events' ELSE '[]'::jsonb END) e WHERE e->>'kind' IN ('opt_out','bounce')) THEN
   RETURN '{"allowed":false,"reason":"email_address_suppressed"}'; END IF;
  IF a.replied_at IS NOT NULL THEN RETURN '{"allowed":false,"reason":"reply_requires_review"}'; END IF;
  IF a.dispatch_metadata->>'state'='provider_accepted' THEN
   -- A prior contact through a different mailbox must still be reviewed; do not
   -- skip its history when the campaign changes sender.
   IF a.dispatch_metadata->'reply_scan'->>'review_required'='true' THEN
    RETURN '{"allowed":false,"reason":"conversation_review_required"}'; END IF;
   IF a.dispatch_metadata->'delivery_scan'->>'review_required'='true' THEN RETURN '{"allowed":false,"reason":"conversation_review_required"}'; END IF;
   IF a.dispatch_metadata->'delivery_scan'->>'complete' IS DISTINCT FROM 'true'
   OR coalesce(a.dispatch_metadata->'delivery_scan'->>'checked_through','') !~ '^[1-9][0-9]{0,15}$' THEN
   RETURN '{"allowed":false,"reason":"reply_check_stale"}'; END IF;
   checked:=to_timestamp((a.dispatch_metadata->'delivery_scan'->>'checked_through')::double precision/1000);
   IF checked>statement_timestamp() OR checked<statement_timestamp()-interval '5 minutes' THEN RETURN '{"allowed":false,"reason":"reply_check_stale"}'; END IF;
   checked:=(a.dispatch_metadata->'reply_scan'->>'checked_at')::timestamptz;
   IF checked IS NULL OR NOT isfinite(checked) OR checked>statement_timestamp()
   OR checked<statement_timestamp()-interval '5 minutes' THEN
    RETURN '{"allowed":false,"reason":"reply_check_stale"}'; END IF;
  END IF;
 END LOOP;
 RETURN '{"allowed":true}';
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
 RETURN '{"allowed":false,"reason":"reply_check_stale"}';
END $$;
COMMIT;
