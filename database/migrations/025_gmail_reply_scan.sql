-- Local candidate. Requires 024. No new tables; no activation or sender setup.
BEGIN;
CREATE OR REPLACE FUNCTION outreach_reply_scan_finish(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a outreach_activities%ROWTYPE; e jsonb; result jsonb; report jsonb; event jsonb; reviews jsonb;
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
  'reply_scan',jsonb_build_object('checked_at',clock_timestamp(),'events',report,'review_required',jsonb_array_length(p->'reviews')>0,
   'reviews',reviews,'review_count',jsonb_array_length(p->'reviews'),'matched_count',jsonb_array_length(p->'events')))
 WHERE org_id=a.org_id AND id=a.id;
 RETURN jsonb_build_object('saved',true,'matched_count',jsonb_array_length(p->'events'),'review_count',jsonb_array_length(p->'reviews'));
EXCEPTION WHEN numeric_value_out_of_range THEN RETURN '{"saved":false,"reason":"invalid_scan_id"}';
END $$;
REVOKE ALL ON FUNCTION outreach_reply_scan_finish(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_reply_scan_finish(jsonb) TO n8n_user;
COMMIT;
