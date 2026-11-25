-- LOCAL / UNAPPLIED. Durable tool state in existing activity JSON only.
-- Restricted trusted backend must authenticate Retell/tool requests FIRST.
BEGIN;
CREATE OR REPLACE FUNCTION outreach_call_stop(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a outreach_activities%ROWTYPE;r jsonb;
BEGIN
 IF coalesce(p->>'org_id','') !~ '^[1-9][0-9]{0,8}$' OR coalesce(p->>'activity_id','') !~ '^[1-9][0-9]{0,8}$'
 OR coalesce(p->>'kind','') NOT IN ('opt_out','wrong_person','meeting_booked')
 THEN RETURN '{"saved":false,"reason":"invalid_call_stop"}';END IF;
 PERFORM pg_advisory_xact_lock(727411,1);
 SELECT * INTO a FROM outreach_activities WHERE org_id=(p->>'org_id')::integer AND id=(p->>'activity_id')::integer AND channel='call' FOR UPDATE;
 IF NOT FOUND OR coalesce(p->>'provider_call_id','')='' OR a.dispatch_metadata->>'provider_call_id' IS DISTINCT FROM p->>'provider_call_id'
 OR a.dispatch_metadata->>'connection_ref' IS DISTINCT FROM p->>'connection_ref' OR coalesce(p->>'connection_ref','')=''
 THEN RETURN '{"saved":false,"reason":"call_tool_binding_invalid"}';END IF;
 -- AI analysis alone cannot claim a meeting happened. A booking receipt is required.
 IF p->>'kind'='meeting_booked' AND a.dispatch_metadata->'booking'->>'state' IS DISTINCT FROM 'booked'
 THEN RETURN '{"saved":false,"reason":"confirmed_booking_required"}';END IF;
 r:=outreach_record_stop(p||jsonb_build_object('source_ref','retell-call:'||(p->>'provider_call_id')));
 IF r->>'saved'='true' AND (a.dispatch_metadata->>'stop_reason'='opt_out' OR (a.dispatch_metadata->>'stop_reason'='wrong_person' AND p->>'kind'='meeting_booked')) THEN
  UPDATE outreach_activities SET dispatch_metadata=dispatch_metadata||jsonb_build_object('stop_reason',a.dispatch_metadata->>'stop_reason') WHERE id=a.id;
 END IF;
 RETURN r;
END $$;

CREATE OR REPLACE FUNCTION outreach_call_booking(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a outreach_activities%ROWTYPE; cfg jsonb; old jsonb; start_at timestamptz; end_at timestamptz; candidate jsonb;stopped jsonb;
BEGIN
 IF coalesce(p->>'org_id','') !~ '^[1-9][0-9]{0,8}$' OR coalesce(p->>'activity_id','') !~ '^[1-9][0-9]{0,8}$'
 OR coalesce(p->>'operation','') NOT IN ('claim','finish') OR coalesce(p->>'event_id','') !~ '^[a-f0-9]{64}$'
 THEN RETURN '{"saved":false,"reason":"invalid_booking_request"}';END IF;
 -- Shared with every booking claim, including different orgs sharing a calendar.
 -- Lock order matches stop/dispatch to avoid booking-vs-opt-out deadlocks.
 PERFORM pg_advisory_xact_lock(727411,1);
 PERFORM pg_advisory_xact_lock(727411,2);
 SELECT * INTO a FROM outreach_activities WHERE org_id=(p->>'org_id')::integer AND id=(p->>'activity_id')::integer AND channel='call' FOR UPDATE;
 IF NOT FOUND OR coalesce(p->>'provider_call_id','')='' OR a.dispatch_metadata->>'provider_call_id' IS DISTINCT FROM p->>'provider_call_id'
 OR a.dispatch_metadata->>'connection_ref' IS DISTINCT FROM p->>'connection_ref' OR coalesce(p->>'connection_ref','')=''
 THEN RETURN '{"saved":false,"reason":"call_tool_binding_invalid"}';END IF;
 old:=a.dispatch_metadata->'booking';
 IF p->>'operation'='finish' THEN
  IF old->>'event_id' IS DISTINCT FROM p->>'event_id' OR old->>'calendar_id' IS DISTINCT FROM p->>'calendar_id'
  OR coalesce(p->>'state','') NOT IN ('booked','unavailable','reconciliation_required')
  THEN RETURN '{"saved":false,"reason":"booking_receipt_binding_invalid"}';END IF;
  IF old->>'state'='booked' THEN RETURN jsonb_build_object('saved',p->>'state'='booked','replayed',true);END IF;
  IF old->>'state'='unavailable' THEN RETURN jsonb_build_object('saved',p->>'state'='unavailable','replayed',true);END IF;
  IF p->>'state'='booked' AND p->>'receipt_verified' IS DISTINCT FROM 'true'
  THEN RETURN '{"saved":false,"reason":"verified_calendar_receipt_required"}';END IF;
  UPDATE outreach_activities SET dispatch_metadata=jsonb_set(dispatch_metadata,'{booking}',old||jsonb_build_object('state',p->>'state','updated_at',now())) WHERE id=a.id;
  IF p->>'state'='booked' THEN
   stopped:=outreach_call_stop(p||jsonb_build_object('kind','meeting_booked','event_id','booking:'||(p->>'event_id')));
   IF stopped->>'saved' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Booking stop persistence failed';END IF;
  END IF;
  RETURN jsonb_build_object('saved',true,'state',p->>'state');
 END IF;
 IF old IS NOT NULL THEN
  IF old->>'event_id'=p->>'event_id' AND old->>'calendar_id'=p->>'calendar_id' THEN
   RETURN jsonb_build_object('acquired',false,'existing',jsonb_build_object('state',CASE WHEN old->>'state'='claimed' THEN 'reconciliation_required' ELSE old->>'state' END,
    'event_id',old->>'event_id','retry_allowed',false));
  END IF;
  RETURN '{"acquired":false,"reason":"call_already_has_booking_request"}';
 END IF;
 IF coalesce(a.dispatch_metadata->>'state','') NOT IN ('dispatching','provider_accepted') OR a.dispatch_metadata->>'provider_ended'='true'
 OR a.dispatch_metadata->>'stop_reason' IN ('opt_out','wrong_person')
 THEN RETURN '{"acquired":false,"reason":"call_not_active"}';END IF;
 SELECT cv.config->'call_dispatch' INTO cfg FROM strategy_plans v JOIN strategy_campaigns c ON c.org_id=v.org_id AND c.id=v.campaign_id
 JOIN strategy_campaign_versions cv ON cv.org_id=c.org_id AND cv.campaign_id=c.id AND cv.version=c.version
 WHERE v.org_id=a.org_id AND v.id::text=a.dispatch_metadata->>'plan_id';
 IF cfg->'calendar'->>'ready' IS DISTINCT FROM 'true' OR cfg->'calendar'->>'id' IS DISTINCT FROM p->>'calendar_id'
 OR coalesce(p->>'calendar_id','') IN ('','primary') OR p->>'confirmed_by_recipient' IS DISTINCT FROM 'true'
 THEN RETURN '{"acquired":false,"reason":"authorized_confirmed_slot_required"}';END IF;
 IF coalesce(p->>'start','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' OR coalesce(p->>'end','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
 THEN RETURN '{"acquired":false,"reason":"explicit_timezone_required"}';END IF;
 start_at:=(p->>'start')::timestamptz;end_at:=(p->>'end')::timestamptz;
 IF start_at IS NULL OR end_at IS NULL OR NOT isfinite(start_at) OR NOT isfinite(end_at) OR start_at<=now() OR end_at<=start_at OR end_at>start_at+interval '1 day'
 THEN RETURN '{"acquired":false,"reason":"future_slot_required"}';END IF;
 SELECT s INTO candidate FROM jsonb_array_elements(CASE WHEN jsonb_typeof(cfg->'calendar'->'slots')='array' THEN cfg->'calendar'->'slots' ELSE '[]'::jsonb END) s
 WHERE s->>'id'=p->>'slot_id' AND (s->>'start')::timestamptz=start_at AND (s->>'end')::timestamptz=end_at;
 IF candidate IS NULL THEN RETURN '{"acquired":false,"reason":"owner_offered_slot_required"}';END IF;
 IF EXISTS(SELECT 1 FROM outreach_activities other WHERE other.channel='call'
 AND other.dispatch_metadata->'booking'->>'calendar_id'=p->>'calendar_id'
 AND other.dispatch_metadata->'booking'->>'state' IS DISTINCT FROM 'unavailable'
 AND (other.dispatch_metadata->'booking'->>'start')::timestamptz<end_at
 AND (other.dispatch_metadata->'booking'->>'end')::timestamptz>start_at)
 THEN RETURN '{"acquired":false,"reason":"slot_locked"}';END IF;
 UPDATE outreach_activities SET dispatch_metadata=jsonb_set(dispatch_metadata,'{booking}',jsonb_build_object(
 'state','claimed','event_id',p->>'event_id','calendar_id',p->>'calendar_id','slot_id',p->>'slot_id','start',start_at,'end',end_at,'created_at',now())) WHERE id=a.id;
 RETURN '{"acquired":true}';
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
 RETURN '{"saved":false,"acquired":false,"reason":"invalid_booking_configuration"}';
END $$;
REVOKE ALL ON FUNCTION outreach_call_stop(jsonb),outreach_call_booking(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_call_stop(jsonb),outreach_call_booking(jsonb) TO n8n_user;
COMMIT;
