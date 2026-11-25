-- LOCAL / UNAPPLIED. Existing tables and approval/lease/budget model only.
-- call_dispatch is trusted operator configuration, never an agent-supplied object.
BEGIN;
CREATE OR REPLACE FUNCTION outreach_call_window(t timestamptz,zone text,windows jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE w jsonb; local_time timestamp; seconds integer; dow text; first_second integer; last_second integer;
BEGIN
 IF NOT isfinite(t) OR zone IS NULL OR jsonb_typeof(windows) IS DISTINCT FROM 'array' THEN RETURN false;END IF;
 local_time:=t AT TIME ZONE zone;
 seconds:=extract(hour FROM local_time)::integer*3600+extract(minute FROM local_time)::integer*60+floor(extract(second FROM local_time))::integer;
 dow:=(ARRAY['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[extract(dow FROM local_time)::integer+1];
 FOR w IN SELECT value FROM jsonb_array_elements(windows) LOOP
  IF jsonb_typeof(w->'days') IS DISTINCT FROM 'array'
  OR coalesce(w->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  OR coalesce(w->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RETURN false;END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(w->'days') d WHERE d NOT IN ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')) THEN RETURN false;END IF;
  first_second:=split_part(w->>'start',':',1)::integer*3600+split_part(w->>'start',':',2)::integer*60;
  last_second:=split_part(w->>'end',':',1)::integer*3600+split_part(w->>'end',':',2)::integer*60;
  IF first_second>=last_second THEN RETURN false;END IF;
 END LOOP;
 FOR w IN SELECT value FROM jsonb_array_elements(windows) LOOP
  first_second:=split_part(w->>'start',':',1)::integer*3600+split_part(w->>'start',':',2)::integer*60;
  last_second:=split_part(w->>'end',':',1)::integer*3600+split_part(w->>'end',':',2)::integer*60;
  IF w->'days' ? dow AND seconds>=first_second AND seconds+60<=last_second THEN RETURN true;END IF;
 END LOOP;
 RETURN false;
EXCEPTION WHEN invalid_parameter_value OR invalid_text_representation OR datetime_field_overflow THEN RETURN false;
END $$;

CREATE OR REPLACE FUNCTION outreach_call_gate_step(o integer,pid bigint,connection text,p_step integer) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE v strategy_plans%ROWTYPE; cfg jsonb; who jsonb; binding jsonb; ck jsonb; phone text; proof_expiry timestamptz;brief jsonb;
BEGIN
 SELECT * INTO v FROM strategy_plans WHERE org_id=o AND id=pid;
 IF NOT FOUND THEN RETURN '{"allowed":false,"reason":"not_found"}';END IF;
 IF p_step=1 THEN ck:=outreach_call_preview(o,pid);brief:=v.body->'artifacts'->'call_brief';
 ELSE ck:=outreach_call_step_check(o,pid,p_step);brief:=ck->'call_brief';END IF;
 IF ck->>'plan_eligible' IS DISTINCT FROM 'true' THEN RETURN jsonb_build_object('allowed',false,'reason','plan_not_eligible','details',ck->'reasons');END IF;
 -- strategy_finish requires false: plans describe reviewed content, never grant
 -- transport authority. Runtime release, approval and atomic reservation own it.
 IF v.body->>'execution_authorized' IS DISTINCT FROM 'false' THEN RETURN '{"allowed":false,"reason":"invalid_plan_authority"}';END IF;
 SELECT cv.config->'call_dispatch' INTO cfg FROM strategy_campaigns c JOIN strategy_campaign_versions cv
 ON cv.org_id=c.org_id AND cv.campaign_id=c.id AND cv.version=c.version
 WHERE c.org_id=o AND c.id=v.campaign_id AND c.version=v.campaign_version;
 binding:=cfg->'connection';who:=cfg->'recipient_permissions'->v.lead_id::text;
 SELECT cl.phone INTO phone FROM cleaned_leads cl WHERE cl.org_id=o AND cl.id=v.lead_id;
 IF cfg->>'campaign_state' IS DISTINCT FROM 'running' OR cfg->>'language' IS DISTINCT FROM 'en'
 OR cfg->>'connection_ref' IS DISTINCT FROM connection OR coalesce(connection,'')=''
 OR binding->>'ready' IS DISTINCT FROM 'true' OR binding->>'credential_ref' IS DISTINCT FROM connection
 OR binding->>'route_verified' IS DISTINCT FROM 'true' OR binding->>'caller_id_authorized' IS DISTINCT FROM 'true'
 OR binding->>'voice_tested' IS DISTINCT FROM 'true' OR binding->>'country' IS DISTINCT FROM 'US'
 OR coalesce(binding->>'from_number','') !~ '^\+1[0-9]{10}$'
 OR coalesce(binding->>'agent_id','') !~ '^[A-Za-z0-9_-]{1,100}$'
 OR outreach_call_amount(binding->>'agent_version') IS NULL OR outreach_call_amount(binding->>'agent_version')>2147483647
 THEN RETURN '{"allowed":false,"reason":"connection_or_campaign_not_ready"}';END IF;
 IF who->>'phone' IS DISTINCT FROM phone OR coalesce(phone,'') !~ '^\+1[0-9]{10}$'
 OR who->>'country' IS DISTINCT FROM 'US' OR who->>'country_verified' IS DISTINCT FROM 'true'
 OR who->>'calling_eligible' IS DISTINCT FROM 'true' OR who->>'timezone_verified' IS DISTINCT FROM 'true'
 OR coalesce(who->>'permission_source_ref','')='' OR coalesce(who->>'reviewed_by','')=''
 THEN RETURN '{"allowed":false,"reason":"recipient_permission_required"}';END IF;
 proof_expiry:=(who->>'expires_at')::timestamptz;
 IF proof_expiry IS NULL OR NOT isfinite(proof_expiry) OR proof_expiry<=now()
 THEN RETURN '{"allowed":false,"reason":"recipient_permission_expired"}';END IF;
 IF (cfg->'quote'->>'expires_at')::timestamptz IS NULL OR NOT isfinite((cfg->'quote'->>'expires_at')::timestamptz)
 THEN RETURN '{"allowed":false,"reason":"finite_quote_expiry_required"}';END IF;
 -- +1 is not US country proof, and scraped phone data is not calling permission.
 IF EXISTS(SELECT 1 FROM outreach_activities a WHERE a.org_id=o AND (a.lead_id=v.lead_id
 OR (a.channel='call' AND a.dispatch_metadata->>'recipient_phone'=phone)) AND (
 a.replied_at IS NOT NULL OR a.bounced_at IS NOT NULL OR a.dispatch_metadata->>'stop_reason' IN ('opt_out','wrong_person','meeting_booked')
 OR a.dispatch_metadata->>'followup_pause_reason' IN ('not_interested','human_requested','opt_out','wrong_person','meeting_booked')
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(a.dispatch_metadata->'stop_events')='array' THEN a.dispatch_metadata->'stop_events' ELSE '[]'::jsonb END) e
 WHERE e->>'kind' IN ('opt_out','wrong_person','meeting_booked'))))
 THEN RETURN '{"allowed":false,"reason":"recipient_stopped"}';END IF;
 IF NOT outreach_call_window(now(),who->>'timezone',cfg->'campaign_windows')
 OR NOT outreach_call_window(now(),who->>'timezone',cfg->'plan_windows')
 THEN RETURN '{"allowed":false,"reason":"outside_call_window"}';END IF;
 IF outreach_call_amount(cfg->>'min_interval_seconds') IS NULL
 THEN RETURN '{"allowed":false,"reason":"spacing_unconfigured"}';END IF;
 IF EXISTS(SELECT 1 FROM outreach_activities a WHERE a.org_id=o AND a.channel='call'
 AND a.dispatch_metadata->>'state' IS DISTINCT FROM 'cancelled_before_send'
 AND a.created_at>now()-(outreach_call_amount(cfg->>'min_interval_seconds')*interval '1 second'))
 THEN RETURN '{"allowed":false,"reason":"spacing_not_ready"}';END IF;
 IF cfg->'release'->>'enabled' IS DISTINCT FROM 'true' OR (cfg->'release'->>'expires_at')::timestamptz IS NULL
 OR NOT isfinite((cfg->'release'->>'expires_at')::timestamptz) OR (cfg->'release'->>'expires_at')::timestamptz<=now()
 THEN RETURN '{"allowed":false,"reason":"release_disabled_or_expired"}';END IF;
 IF jsonb_typeof(brief) IS DISTINCT FROM 'object'
 OR nullif(brief->>'opening','') IS NULL
 OR nullif(brief->>'permission_question','') IS NULL
 OR length(brief::text)>12000
 THEN RETURN '{"allowed":false,"reason":"approved_call_brief_required"}';END IF;
 RETURN jsonb_build_object('allowed',true,'connection',binding,'phone',phone,'call_brief',brief);
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN
 RETURN '{"allowed":false,"reason":"invalid_call_configuration"}';
END $$;

CREATE OR REPLACE FUNCTION outreach_call_gate(o integer,pid bigint,connection text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT outreach_call_gate_step(o,pid,connection,1);
$$;

CREATE OR REPLACE FUNCTION outreach_call_dispatch_next(o integer,connection text) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE v record; ck jsonb; r jsonb; b jsonb; request jsonb; aid integer; deferred integer:=0;
BEGIN
 IF o IS NULL OR o<=0 OR coalesce(connection,'')='' THEN RETURN '{"authorized":false,"reason":"operator_binding_required"}';END IF;
 PERFORM pg_advisory_xact_lock(727411,1);
 -- One transaction selects oldest eligible, reserves funds and commits one attempt.
 FOR v IN SELECT p.*,steps.n AS call_step FROM strategy_plans p CROSS JOIN generate_series(1,10) steps(n)
 WHERE p.org_id=o AND ((steps.n=1 AND p.body->'strategy'->'step1'->>'channel'='call') OR
 (steps.n>1 AND EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p.body->'artifacts'->'followup_drafts')='array' THEN p.body->'artifacts'->'followup_drafts' ELSE '[]'::jsonb END) d WHERE d->>'step'=steps.n::text AND d->>'channel'='call')))
 AND NOT EXISTS(SELECT 1 FROM outreach_activities a WHERE a.org_id=o AND a.dispatch_metadata->>'plan_id'=p.id::text AND a.dispatch_metadata->>'step'=steps.n::text)
 ORDER BY p.created_at,p.id,steps.n LIMIT 100 FOR UPDATE OF p LOOP
  ck:=outreach_call_gate_step(o,v.id,connection,v.call_step);
  IF ck->>'allowed' IS DISTINCT FROM 'true' THEN deferred:=deferred+1;CONTINUE;END IF;
  r:=outreach_call_reserve(jsonb_build_object('org_id',o,'plan_id',v.id,'content_hash',v.content_hash,'step',v.call_step));
  IF r->>'reserved' IS DISTINCT FROM 'true' THEN RETURN r||jsonb_build_object('authorized',false,'deferred',deferred);END IF;
  aid:=(r->>'activity_id')::integer;b:=ck->'connection';
  request:=jsonb_build_object('from_number',b->>'from_number','to_number',ck->>'phone',
   'override_agent_id',b->>'agent_id','override_agent_version',(b->>'agent_version')::integer,
   'agent_override',jsonb_build_object('agent',jsonb_build_object('max_call_duration_ms',60000)),
   'metadata',jsonb_build_object('org_id',o::text,'activity_id',aid::text,'plan_hash',v.content_hash,
   'dispatch_key',md5(o::text||':'||aid::text||':'||v.content_hash||':'||(r->>'lease'))),
   'retell_llm_dynamic_variables',jsonb_build_object('approved_call_brief',(ck->'call_brief')::text,'preferred_language','English'));
  UPDATE outreach_activities SET status='dispatching',dispatch_metadata=dispatch_metadata||jsonb_build_object(
   'state','dispatching','attempts',1,'started_at',now(),'recipient_phone',ck->>'phone',
   'expected_request',request,'execution_authorized',false,'automatic_redial_allowed',false)
  WHERE org_id=o AND id=aid AND dispatch_metadata->>'lease'=r->>'lease';
  RETURN jsonb_build_object('authorized',true,'org_id',o,'activity_id',aid::text,'lease',r->>'lease',
   'content_hash',v.content_hash,'connection_ref',connection,'request',request,'deferred',deferred);
 END LOOP;
 RETURN jsonb_build_object('authorized',false,'reason','no_eligible_calls','deferred',deferred);
END $$;

CREATE OR REPLACE FUNCTION outreach_call_uncertain(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a outreach_activities%ROWTYPE;
BEGIN
 IF coalesce(p->>'org_id','') !~ '^[1-9][0-9]{0,8}$' OR coalesce(p->>'activity_id','') !~ '^[1-9][0-9]{0,8}$'
 THEN RETURN '{"saved":false,"reason":"invalid_binding"}';END IF;
 PERFORM pg_advisory_xact_lock(727411,1);
 SELECT * INTO a FROM outreach_activities WHERE org_id=(p->>'org_id')::integer AND id=(p->>'activity_id')::integer AND channel='call' FOR UPDATE;
 IF NOT FOUND OR a.dispatch_metadata->>'lease' IS DISTINCT FROM p->>'lease' OR coalesce(p->>'lease','')=''
 OR a.dispatch_metadata->>'connection_ref' IS DISTINCT FROM p->>'connection_ref'
 OR a.dispatch_metadata->>'content_hash' IS DISTINCT FROM p->>'content_hash'
 OR a.dispatch_metadata->>'attempts' IS DISTINCT FROM '1'
 OR coalesce(a.dispatch_metadata->>'state','') NOT IN ('dispatching','reconciliation_required')
 THEN RETURN '{"saved":false,"reason":"uncertain_binding_invalid"}';END IF;
 UPDATE outreach_activities SET status='reconciliation_required',dispatch_metadata=dispatch_metadata||
 '{"state":"reconciliation_required","automatic_redial_allowed":false,"execution_authorized":false}'::jsonb WHERE id=a.id;
 RETURN '{"saved":true,"retry_allowed":false}';
END $$;

CREATE OR REPLACE FUNCTION outreach_call_poll_queue(o integer,connection text) RETURNS SETOF outreach_activities LANGUAGE sql STABLE AS $$
 SELECT * FROM outreach_activities WHERE org_id=o AND channel='call' AND dispatch_metadata->>'connection_ref'=connection
 AND dispatch_metadata->>'state' IN ('dispatching','provider_accepted','reconciliation_required','awaiting_final_cost')
 AND dispatch_metadata->>'provider_call_id' ~ '^[A-Za-z0-9_-]{1,128}$' ORDER BY id LIMIT 10;
$$;
REVOKE ALL ON FUNCTION outreach_call_window(timestamptz,text,jsonb),outreach_call_gate_step(integer,bigint,text,integer),outreach_call_gate(integer,bigint,text),outreach_call_dispatch_next(integer,text),outreach_call_uncertain(jsonb),outreach_call_poll_queue(integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_call_window(timestamptz,text,jsonb),outreach_call_gate_step(integer,bigint,text,integer),outreach_call_gate(integer,bigint,text),outreach_call_dispatch_next(integer,text),outreach_call_uncertain(jsonb),outreach_call_poll_queue(integer,text) TO n8n_user;
COMMIT;
