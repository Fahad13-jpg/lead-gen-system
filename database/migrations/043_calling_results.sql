-- LOCAL / UNAPPLIED. Existing activity JSON; no live changes or new ingress.
BEGIN;
CREATE OR REPLACE FUNCTION outreach_call_tool_context(p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE a outreach_activities%ROWTYPE;cfg jsonb;
BEGIN
 IF coalesce(p->>'org_id','') !~ '^[1-9][0-9]{0,8}$' OR coalesce(p->>'activity_id','') !~ '^[1-9][0-9]{0,8}$'
 THEN RETURN '{"allowed":false,"reason":"invalid_binding"}';END IF;
 SELECT * INTO a FROM outreach_activities WHERE org_id=(p->>'org_id')::integer AND id=(p->>'activity_id')::integer AND channel='call';
 IF NOT FOUND OR coalesce(p->>'provider_call_id','')='' OR a.dispatch_metadata->>'provider_call_id' IS DISTINCT FROM p->>'provider_call_id'
 OR coalesce(p->>'connection_ref','')='' OR a.dispatch_metadata->>'connection_ref' IS DISTINCT FROM p->>'connection_ref'
 THEN RETURN '{"allowed":false,"reason":"call_tool_binding_invalid"}';END IF;
 SELECT cv.config->'call_dispatch' INTO cfg FROM strategy_plans v JOIN strategy_campaigns c ON c.org_id=v.org_id AND c.id=v.campaign_id
 JOIN strategy_campaign_versions cv ON cv.org_id=c.org_id AND cv.campaign_id=c.id AND cv.version=c.version
 WHERE v.org_id=a.org_id AND v.id::text=a.dispatch_metadata->>'plan_id';
 IF a.dispatch_metadata->>'version' IS DISTINCT FROM 'calling_v1' OR a.dispatch_metadata->>'attempts' IS DISTINCT FROM '1'
 OR coalesce(a.dispatch_metadata->>'state','') NOT IN ('dispatching','provider_accepted') OR a.dispatch_metadata->>'provider_ended'='true'
 THEN RETURN '{"allowed":false,"reason":"call_not_active"}';END IF;
 IF a.dispatch_metadata->>'stop_reason' IN ('opt_out','wrong_person') THEN RETURN '{"allowed":false,"reason":"call_stopped"}';END IF;
 RETURN jsonb_build_object('allowed',true,'org_id',a.org_id,'activity_id',a.id::text,'provider_call_id',p->>'provider_call_id',
 'connection_ref',p->>'connection_ref','calendar',cfg->'calendar','recipient_timezone',cfg->'recipient_permissions'->a.lead_id::text->>'timezone');
END $$;

CREATE OR REPLACE FUNCTION outreach_call_result(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a outreach_activities%ROWTYPE;m jsonb;event jsonb;old jsonb;events jsonb;outcome text;at_time timestamptz;zone text;stopped jsonb;
BEGIN
 IF coalesce(p->>'org_id','') !~ '^[1-9][0-9]{0,8}$' OR coalesce(p->>'activity_id','') !~ '^[1-9][0-9]{0,8}$'
 OR coalesce(p->>'event_id','')='' OR length(p->>'event_id')>200
 OR coalesce(p->>'outcome','') NOT IN ('interested','busy','not_interested','callback_requested','wrong_person','human_requested','opt_out','unknown','meeting_booked')
 THEN RETURN '{"saved":false,"reason":"invalid_call_result"}';END IF;
 PERFORM pg_advisory_xact_lock(727411,1);
 SELECT * INTO a FROM outreach_activities WHERE org_id=(p->>'org_id')::integer AND id=(p->>'activity_id')::integer AND channel='call' FOR UPDATE;
 m:=a.dispatch_metadata;
 IF NOT FOUND OR coalesce(p->>'provider_call_id','')='' OR m->>'provider_call_id' IS DISTINCT FROM p->>'provider_call_id'
 OR coalesce(p->>'connection_ref','')='' OR m->>'connection_ref' IS DISTINCT FROM p->>'connection_ref'
 THEN RETURN '{"saved":false,"reason":"call_tool_binding_invalid"}';END IF;
 IF m->>'version' IS DISTINCT FROM 'calling_v1' OR m->>'attempts' IS DISTINCT FROM '1' THEN RETURN '{"saved":false,"reason":"call_not_started"}';END IF;
 outcome:=p->>'outcome';
 event:=jsonb_build_object('event_id',p->>'event_id','outcome',outcome,'note',left(regexp_replace(coalesce(p->>'note',''),'[[:cntrl:]]',' ','g'),1000),
 'source','authenticated_agent_tool','untrusted_data',true,'requested_at',p->>'requested_at','timezone',p->>'timezone','confirmed_by_recipient',p->'confirmed_by_recipient');
 events:=CASE WHEN jsonb_typeof(m->'result_events')='array' THEN m->'result_events' ELSE '[]'::jsonb END;
 SELECT e INTO old FROM jsonb_array_elements(events) e WHERE e->>'event_id'=p->>'event_id';
 IF old IS NOT NULL THEN RETURN jsonb_build_object('saved',old-'recorded_at'=event,'replayed',old-'recorded_at'=event,'reason',CASE WHEN old-'recorded_at'=event THEN 'already_recorded' ELSE 'event_id_conflict' END);END IF;
 IF jsonb_array_length(events)>=30 THEN RETURN '{"saved":false,"reason":"call_event_limit_reached"}';END IF;
 IF m->>'stop_reason' IN ('opt_out','wrong_person') AND outcome NOT IN ('opt_out','wrong_person') THEN RETURN '{"saved":false,"reason":"call_stopped"}';END IF;
 IF outcome='callback_requested' THEN
  IF p->'confirmed_by_recipient' IS DISTINCT FROM 'true'::jsonb OR coalesce(p->>'requested_at','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$'
  OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p->>'timezone')
  THEN RETURN '{"saved":false,"reason":"confirmed_callback_time_and_timezone_required"}';END IF;
  at_time:=(p->>'requested_at')::timestamptz;zone:=p->>'timezone';
  IF NOT isfinite(at_time) OR at_time<=now() OR at_time>now()+interval '90 days'
  OR to_char(at_time AT TIME ZONE zone,'YYYY-MM-DD"T"HH24:MI:SS')<>left(p->>'requested_at',19)
  THEN RETURN '{"saved":false,"reason":"invalid_or_ambiguous_callback_time"}';END IF;
 END IF;
 IF outcome IN ('opt_out','wrong_person','meeting_booked') THEN
  stopped:=outreach_call_stop(p||jsonb_build_object('kind',outcome));
  IF stopped->>'saved' IS DISTINCT FROM 'true' THEN RETURN stopped;END IF;
  SELECT dispatch_metadata INTO m FROM outreach_activities WHERE id=a.id;
 END IF;
 m:=m||jsonb_build_object('result_events',events||jsonb_build_array(event||jsonb_build_object('recorded_at',now())),
  'outcome',outcome,'outcome_source','authenticated_agent_tool','outcome_review_required',true,'last_result_at',now());
 IF outcome='callback_requested' THEN
  m:=m||jsonb_build_object('callback',jsonb_build_object('state','requested_pending_approved_step','requested_at',at_time,'timezone',zone,'event_id',p->>'event_id','confirmed_by_recipient',true));
 END IF;
 IF outcome IN ('not_interested','human_requested','wrong_person','opt_out','meeting_booked') THEN
  m:=m||jsonb_build_object('followup_pause_reason',outcome);
  IF jsonb_typeof(m->'callback')='object' THEN m:=jsonb_set(m,'{callback,state}','"cancelled_by_stop"');END IF;
 END IF;
 UPDATE outreach_activities SET dispatch_metadata=m WHERE org_id=a.org_id AND id=a.id;
 RETURN jsonb_build_object('saved',true,'outcome',outcome,'callback_state',m->'callback'->>'state','review_required',true,'execution_authorized',false);
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation THEN RETURN '{"saved":false,"reason":"invalid_call_result"}';
END $$;

CREATE OR REPLACE FUNCTION outreach_call_ingest(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;s jsonb;reason text:=p->>'disconnection_reason';
BEGIN
 PERFORM pg_advisory_xact_lock(727411,1);
 r:=outreach_call_observe(p);
 IF r->>'saved' IS DISTINCT FROM 'true' THEN RETURN r;END IF;
 IF p->>'status' IN ('ended','error','not_connected') AND reason IN ('user_requested_dnc','dial_no_answer','dial_busy','user_requested_callback','user_hangup','agent_hangup','voicemail_reached','ivr_reached','inactivity','max_duration_reached') THEN
  UPDATE outreach_activities SET dispatch_metadata=dispatch_metadata||jsonb_build_object('disconnection_reason',reason,
   'ended_at',coalesce(dispatch_metadata->'ended_at',to_jsonb(now()))) WHERE org_id=(p->>'org_id')::integer AND id=(p->>'activity_id')::integer;
  IF reason='user_requested_dnc' THEN
   s:=outreach_call_stop(p||jsonb_build_object('kind','opt_out','event_id','retell-dnc:'||(p->>'provider_call_id')));
   IF s->>'saved' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'DNC persistence failed';END IF;
   UPDATE outreach_activities SET dispatch_metadata=dispatch_metadata||'{"outcome":"opt_out","outcome_source":"provider_dnc","followup_pause_reason":"opt_out"}'::jsonb
   WHERE org_id=(p->>'org_id')::integer AND id=(p->>'activity_id')::integer;
   UPDATE outreach_activities SET dispatch_metadata=jsonb_set(dispatch_metadata,'{callback,state}','"cancelled_by_stop"')
   WHERE org_id=(p->>'org_id')::integer AND id=(p->>'activity_id')::integer AND jsonb_typeof(dispatch_metadata->'callback')='object';
   RETURN r||'{"opt_out_saved":true}'::jsonb;
  ELSIF reason IN ('dial_no_answer','dial_busy') THEN
   UPDATE outreach_activities SET dispatch_metadata=dispatch_metadata||jsonb_build_object('outcome',CASE WHEN reason='dial_busy' THEN 'line_busy' ELSE 'no_answer' END,'outcome_source','provider_disconnection')
   WHERE org_id=(p->>'org_id')::integer AND id=(p->>'activity_id')::integer AND dispatch_metadata->>'outcome' IS NULL;
  END IF;
 END IF;
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION outreach_call_tool_context(jsonb),outreach_call_result(jsonb),outreach_call_ingest(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_call_tool_context(jsonb),outreach_call_result(jsonb),outreach_call_ingest(jsonb) TO n8n_user;
COMMIT;
