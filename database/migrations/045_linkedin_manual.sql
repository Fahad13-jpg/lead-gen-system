-- Applied 2026-10-28; workflow rollout inactive. See LINKEDIN_MANUAL_DEPLOYMENT_20261028.md.
-- Existing JSON activities, approvals and unique plan/step index.
-- Trusted backend functions only; no new tables, webhook, provider or sending.
BEGIN;
CREATE OR REPLACE FUNCTION outreach_linkedin_gate(o integer,pid bigint,n integer) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE v strategy_plans%ROWTYPE;approval strategy_approvals%ROWTYPE;x jsonb;cfg jsonb;art jsonb;draft jsonb;seq jsonb;prev outreach_activities%ROWTYPE;due timestamptz;target text;
BEGIN
 IF o IS NULL OR o<=0 OR pid IS NULL OR pid<=0 OR n IS NULL OR n<1 OR n>10 THEN RETURN '{"allowed":false,"reason":"invalid_binding"}';END IF;
 SELECT * INTO v FROM strategy_plans WHERE org_id=o AND id=pid;
 IF NOT FOUND THEN RETURN '{"allowed":false,"reason":"not_found"}';END IF;
 IF v.content_hash IS DISTINCT FROM md5(v.body::text) OR v.body->>'version' IS DISTINCT FROM 'strategy_v2'
 OR v.body->>'execution_authorized' IS DISTINCT FROM 'false' OR v.body->>'approval_required' IS DISTINCT FROM 'true'
 OR coalesce(v.body->>'state','') NOT IN ('ai_completed','template_completed','template_fallback')
 OR (CASE WHEN jsonb_typeof(v.body->'blocking_reasons')='array' THEN jsonb_array_length(v.body->'blocking_reasons')<>0 ELSE true END)
 OR (CASE WHEN jsonb_typeof(v.body->'validation_errors')='array' THEN jsonb_array_length(v.body->'validation_errors')<>0 ELSE true END)
 THEN RETURN '{"allowed":false,"reason":"plan_blocked_or_changed"}';END IF;
 SELECT * INTO approval FROM strategy_approvals WHERE org_id=o AND plan_id=pid ORDER BY id DESC LIMIT 1;
 IF NOT FOUND OR approval.action<>'approve' OR approval.content_hash IS DISTINCT FROM v.content_hash THEN RETURN '{"allowed":false,"reason":"approval_required"}';END IF;
 x:=strategy_context(o,v.campaign_id,v.lead_id);
 IF x IS NULL OR x->>'fingerprint' IS DISTINCT FROM v.fingerprint OR v.expires_at IS NULL OR NOT isfinite(v.expires_at) OR v.expires_at<=now()
 OR x->'campaign'->>'version' IS DISTINCT FROM v.campaign_version::text THEN RETURN '{"allowed":false,"reason":"stale_plan"}';END IF;
 IF x->>'suppressed' IS DISTINCT FROM 'false' OR x->>'replied' IS DISTINCT FROM 'false' OR EXISTS(
 SELECT 1 FROM outreach_activities a WHERE a.org_id=o AND a.lead_id=v.lead_id AND (a.replied_at IS NOT NULL OR a.bounced_at IS NOT NULL
 OR a.dispatch_metadata->>'stop_reason' IN ('opt_out','wrong_person','meeting_booked','reply')
 OR a.dispatch_metadata->>'followup_pause_reason' IN ('not_interested','human_requested','opt_out','wrong_person','meeting_booked','reply')))
 THEN RETURN '{"allowed":false,"reason":"lead_stopped_or_replied"}';END IF;
 cfg:=x->'campaign'->'config';art:=v.body->'artifacts'->'linkedin_manual';target:=art->'target'->>'profile_url';
 IF cfg->'linkedin_manual'->>'enabled' IS DISTINCT FROM 'true' OR art->>'version' IS DISTINCT FROM 'linkedin_manual_v1'
 OR art->>'execution_mode' IS DISTINCT FROM 'manual_only' OR art->'target'->>'kind' IS DISTINCT FROM 'person'
 OR coalesce(target,'') !~ '^https://www[.]linkedin[.]com/in/[a-z0-9_-]+/$'
 OR x->'report'->'trust'->'freshness'->>'research_current' IS DISTINCT FROM 'true'
 OR (CASE WHEN jsonb_typeof(x->'report'->'trust'->'conflicts')='array' THEN jsonb_array_length(x->'report'->'trust'->'conflicts')<>0 ELSE true END)
 THEN RETURN '{"allowed":false,"reason":"matched_person_or_manual_configuration_required"}';END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(x->'report'->'research'->'linkedin'->'profiles')='array' THEN x->'report'->'research'->'linkedin'->'profiles' ELSE '[]'::jsonb END) p
 WHERE p->>'kind'='person' AND lower(regexp_replace(rtrim(p->>'profile_url','/'),'^https://(www[.])?linkedin[.]com/in/','https://www.linkedin.com/in/'))=rtrim(target,'/') AND p->>'observed_at'=art->'target'->>'observed_at'
 AND (p->>'observed_at')::timestamptz<=now() AND (p->>'observed_at')::timestamptz>now()-interval '30 days')
 THEN RETURN '{"allowed":false,"reason":"target_evidence_changed_or_expired"}';END IF;
 SELECT d INTO draft FROM jsonb_array_elements(CASE WHEN jsonb_typeof(art->'steps')='array' THEN art->'steps' ELSE '[]'::jsonb END) d WHERE d->>'step'=n::text;
 IF (SELECT count(*) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(art->'steps')='array' THEN art->'steps' ELSE '[]'::jsonb END) d WHERE d->>'step'=n::text)<>1 THEN RETURN '{"allowed":false,"reason":"unique_approved_draft_required"}';END IF;
 seq:=cfg->'sequence'->(n-1);
 IF seq->>'channel' IS DISTINCT FROM 'linkedin' OR seq->>'step' IS DISTINCT FROM n::text
 OR draft->>'approval_required' IS DISTINCT FROM 'true' OR draft->>'delay_days' IS DISTINCT FROM seq->>'delay_days'
 OR coalesce(draft->>'delay_days','') !~ '^([0-9]|[1-5][0-9]|60)$'
 OR v.body->'artifacts'->'schedule'->'sequence' IS DISTINCT FROM cfg->'sequence'
 OR jsonb_typeof(draft->'message') IS DISTINCT FROM 'string' OR length(btrim(draft->>'message')) NOT BETWEEN 1 AND 500
 OR draft->>'requires_connection' NOT IN ('true','false') OR draft->>'requires_connection' IS NULL
 OR (draft->>'requires_connection'='true') IS DISTINCT FROM (n=(SELECT min(CASE WHEN coalesce(s->>'step','') ~ '^([1-9]|10)$' THEN (s->>'step')::integer END) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(cfg->'sequence')='array' THEN cfg->'sequence' ELSE '[]'::jsonb END) s WHERE s->>'channel'='linkedin'))
 OR (draft->>'requires_connection'='true' AND (jsonb_typeof(draft->'connection_note') IS DISTINCT FROM 'string' OR length(btrim(draft->>'connection_note')) NOT BETWEEN 1 AND 200))
 THEN RETURN '{"allowed":false,"reason":"approved_content_and_sequence_required"}';END IF;
 due:=v.created_at;
 IF n>1 THEN
  SELECT * INTO prev FROM outreach_activities WHERE org_id=o AND lead_id=v.lead_id AND dispatch_metadata->>'plan_id'=pid::text AND dispatch_metadata->>'step'=(n-1)::text AND dispatch_metadata->>'content_hash'=v.content_hash;
  IF NOT FOUND OR prev.sent_at IS NULL OR prev.replied_at IS NOT NULL OR prev.bounced_at IS NOT NULL THEN RETURN '{"allowed":false,"reason":"previous_confirmed_send_required"}';END IF;
  IF prev.channel='linkedin' THEN
   IF prev.dispatch_metadata->>'version' IS DISTINCT FROM 'linkedin_manual_v1' OR prev.dispatch_metadata->>'state' IS DISTINCT FROM 'message_sent'
   OR prev.dispatch_metadata->>'profile_url' IS DISTINCT FROM target THEN RETURN '{"allowed":false,"reason":"previous_linkedin_message_required"}';END IF;
  ELSIF prev.channel='email' THEN
   IF prev.dispatch_metadata->>'state' IS DISTINCT FROM 'provider_accepted' OR nullif(prev.external_id,'') IS NULL
   OR outreach_email_contact_gate(o,v.lead_id,prev.dispatch_metadata->>'recipient_email',prev.dispatch_metadata->>'sender_email')->>'allowed' IS DISTINCT FROM 'true'
   THEN RETURN '{"allowed":false,"reason":"previous_email_or_reply_check_unavailable"}';END IF;
  ELSE RETURN '{"allowed":false,"reason":"preceding_channel_integration_review_required"}';END IF;
  due:=(prev.sent_at AT TIME ZONE 'UTC')+(draft->>'delay_days')::integer*interval '24 hours';
 END IF;
 IF due>now() THEN RETURN jsonb_build_object('allowed',false,'reason','delay_not_elapsed','due_at',due);END IF;
 RETURN jsonb_build_object('allowed',true,'org_id',o,'plan_id',pid,'lead_id',v.lead_id,'step',n,'content_hash',v.content_hash,'target',art->'target','draft',draft,'due_at',due,'config',cfg->'linkedin_manual','timezone',cfg->>'timezone','sending_window',cfg->'sending_window','execution_authorized',false);
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range OR invalid_parameter_value THEN RETURN '{"allowed":false,"reason":"malformed_manual_task_data"}';
END $$;

CREATE OR REPLACE FUNCTION outreach_linkedin_prepare(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE g jsonb;a outreach_activities%ROWTYPE;limit_count integer;o integer;pid bigint;n integer;state text;
BEGIN
 IF coalesce(p->>'org_id','') !~ '^[1-9][0-9]{0,8}$' OR coalesce(p->>'plan_id','') !~ '^[1-9][0-9]{0,17}$' OR coalesce(p->>'step','') !~ '^([1-9]|10)$' THEN RETURN '{"prepared":false,"reason":"invalid_binding"}';END IF;
 o:=(p->>'org_id')::integer;pid:=(p->>'plan_id')::bigint;n:=(p->>'step')::integer;
 PERFORM pg_advisory_xact_lock(727412,o);
 SELECT * INTO a FROM outreach_activities WHERE org_id=o AND dispatch_metadata->>'plan_id'=pid::text AND dispatch_metadata->>'step'=n::text FOR UPDATE;
 IF FOUND THEN RETURN jsonb_build_object('prepared',false,'idempotent',a.channel='linkedin' AND a.dispatch_metadata->>'version'='linkedin_manual_v1','activity_id',a.id,'reason','step_already_recorded','execution_authorized',false);END IF;
 g:=outreach_linkedin_gate(o,pid,n);IF g->>'allowed' IS DISTINCT FROM 'true' THEN RETURN g||'{"prepared":false}';END IF;
 IF coalesce(g->'config'->>'daily_task_limit','') !~ '^([1-9]|[1-9][0-9]|100)$' THEN RETURN '{"prepared":false,"reason":"task_limit_required"}';END IF;
 limit_count:=(g->'config'->>'daily_task_limit')::integer;
 IF (SELECT count(*) FROM outreach_activities WHERE org_id=o AND dispatch_metadata->>'version'='linkedin_manual_v1' AND (created_at AT TIME ZONE 'UTC') AT TIME ZONE (g->>'timezone') >= date_trunc('day',now() AT TIME ZONE (g->>'timezone')))>=limit_count THEN RETURN '{"prepared":false,"reason":"daily_task_limit_reached"}';END IF;
 IF EXISTS(SELECT 1 FROM outreach_activities WHERE org_id=o AND channel='linkedin' AND dispatch_metadata->>'profile_url'=g->'target'->>'profile_url' AND dispatch_metadata->>'plan_id'<>pid::text AND dispatch_metadata->>'state' IN ('ready','request_sent','accepted','message_sent')) THEN RETURN '{"prepared":false,"reason":"profile_has_another_active_campaign"}';END IF;
 state:=CASE WHEN g->'draft'->>'requires_connection'='true' THEN 'ready' ELSE 'accepted' END;
 INSERT INTO outreach_activities(org_id,lead_id,channel,status,dispatch_metadata) VALUES(o,(g->>'lead_id')::integer,'linkedin','manual_pending',jsonb_build_object('version','linkedin_manual_v1','plan_id',pid::text,'step',n::text,'content_hash',g->>'content_hash','state',state,'profile_url',g->'target'->>'profile_url','draft',g->'draft','target',g->'target','assignee',g->'config'->>'assignee','due_at',g->'due_at','events','[]'::jsonb,'reported_source','customer_reported','execution_authorized',false)) ON CONFLICT DO NOTHING RETURNING * INTO a;
 IF NOT FOUND THEN RETURN '{"prepared":false,"reason":"step_already_recorded"}';END IF;
 RETURN jsonb_build_object('prepared',true,'activity_id',a.id,'state',state,'manual_only',true,'execution_authorized',false);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_parameter_value THEN RETURN '{"prepared":false,"reason":"malformed_manual_task_data"}';
END $$;

CREATE OR REPLACE FUNCTION outreach_linkedin_event(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a outreach_activities%ROWTYPE;m jsonb;events jsonb;event jsonb;old jsonb;action text;state text;next_state text;g jsonb;stopped jsonb;until_time timestamptz;is_stop boolean;
BEGIN
 IF coalesce(p->>'org_id','') !~ '^[1-9][0-9]{0,8}$' OR coalesce(p->>'activity_id','') !~ '^[1-9][0-9]{0,8}$'
 OR length(coalesce(p->>'actor','')) NOT BETWEEN 1 AND 120 OR length(coalesce(p->>'event_id','')) NOT BETWEEN 1 AND 160 OR p->'confirmed_by_customer' IS DISTINCT FROM 'true'::jsonb
 OR length(coalesce(p->>'note',''))>1000 OR coalesce(p->>'action','') NOT IN ('copy_note','copy_message','request_sent','already_connected','accepted','message_sent','reply','not_interested','opt_out','wrong_person','snooze','skip','assign') THEN RETURN '{"saved":false,"reason":"invalid_customer_event"}';END IF;
 PERFORM pg_advisory_xact_lock(727412,(p->>'org_id')::integer);
 SELECT * INTO a FROM outreach_activities WHERE org_id=(p->>'org_id')::integer AND id=(p->>'activity_id')::integer AND channel='linkedin' FOR UPDATE;
 m:=a.dispatch_metadata;
 IF NOT FOUND OR m->>'version' IS DISTINCT FROM 'linkedin_manual_v1' OR m->>'content_hash' IS DISTINCT FROM p->>'content_hash' THEN RETURN '{"saved":false,"reason":"task_or_content_mismatch"}';END IF;
 action:=p->>'action';state:=m->>'state';is_stop:=action IN ('reply','opt_out','wrong_person','not_interested');
 IF coalesce(m->>'assignee','')<>'' AND m->>'assignee' IS DISTINCT FROM p->>'actor' AND p->'can_manage_assignments' IS DISTINCT FROM 'true'::jsonb AND NOT is_stop THEN RETURN '{"saved":false,"reason":"task_assigned_to_another_member"}';END IF;
 event:=jsonb_build_object('event_id',p->>'event_id','action',action,'actor',p->>'actor','note',left(regexp_replace(coalesce(p->>'note',''),'[[:cntrl:]]',' ','g'),1000),'assignee',p->>'assignee','snooze_until',p->>'snooze_until','source','customer_reported');
 events:=CASE WHEN jsonb_typeof(m->'events')='array' THEN m->'events' ELSE '[]'::jsonb END;
 SELECT e INTO old FROM jsonb_array_elements(events) e WHERE e->>'event_id'=p->>'event_id';
 IF old IS NOT NULL THEN RETURN jsonb_build_object('saved',old-'recorded_at'=event,'idempotent',old-'recorded_at'=event,'reason',CASE WHEN old-'recorded_at'=event THEN 'already_recorded' ELSE 'event_id_conflict' END);END IF;
 IF jsonb_array_length(events)>=100 AND NOT is_stop THEN RETURN '{"saved":false,"reason":"task_event_limit_reached"}';END IF;
 IF NOT is_stop AND action NOT IN ('skip','assign') THEN
  g:=outreach_linkedin_gate(a.org_id,(m->>'plan_id')::bigint,(m->>'step')::integer);
  IF g->>'allowed' IS DISTINCT FROM 'true' THEN RETURN g||'{"saved":false}';END IF;
  IF m->>'content_hash' IS DISTINCT FROM g->>'content_hash' OR m->'draft' IS DISTINCT FROM g->'draft' OR m->>'profile_url' IS DISTINCT FROM g->'target'->>'profile_url' THEN RETURN '{"saved":false,"reason":"task_snapshot_mismatch"}';END IF;
  IF action IN ('request_sent','message_sent','copy_note','copy_message') AND (m->>'snooze_until')::timestamptz>now() THEN RETURN '{"saved":false,"reason":"task_snoozed"}';END IF;
 END IF;
 IF is_stop THEN
  -- Durable stops remain recordable after expiry/revocation. Never weaken opt-out.
  IF state='opt_out' AND action<>'opt_out' THEN RETURN '{"saved":false,"reason":"already_opted_out"}';END IF;
  next_state:=CASE WHEN action='reply' THEN 'replied' ELSE action END;
 ELSIF action IN ('copy_note','request_sent','already_connected') AND state='ready' THEN next_state:=CASE WHEN action='request_sent' THEN 'request_sent' WHEN action='already_connected' THEN 'accepted' ELSE state END;
 ELSIF action='copy_note' AND state='request_sent' THEN next_state:=state;
 ELSIF action='accepted' AND state='request_sent' THEN next_state:='accepted';
 ELSIF action IN ('copy_message','message_sent') AND state='accepted' THEN next_state:=CASE WHEN action='message_sent' THEN 'message_sent' ELSE state END;
 ELSIF action='copy_message' AND state='message_sent' THEN next_state:=state;
 ELSIF action IN ('snooze','skip','assign') AND state IN ('ready','request_sent','accepted') THEN next_state:=CASE WHEN action='skip' THEN 'skipped' ELSE state END;
 ELSE RETURN '{"saved":false,"reason":"invalid_task_transition"}';END IF;
 IF action='assign' THEN
  IF p->'can_manage_assignments' IS DISTINCT FROM 'true'::jsonb OR length(coalesce(p->>'assignee','')) NOT BETWEEN 1 AND 120 THEN RETURN '{"saved":false,"reason":"verified_assignment_permission_required"}';END IF;
  m:=m||jsonb_build_object('assignee',p->>'assignee');
 END IF;
 IF action='snooze' THEN
  IF coalesce(p->>'snooze_until','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$' THEN RETURN '{"saved":false,"reason":"explicit_snooze_time_required"}';END IF;
  until_time:=(p->>'snooze_until')::timestamptz;
  IF NOT isfinite(until_time) OR until_time<=now() OR until_time>now()+interval '30 days' THEN RETURN '{"saved":false,"reason":"invalid_snooze_time"}';END IF;
  m:=m||jsonb_build_object('snooze_until',until_time);
 END IF;
 -- First copy/action claims an unassigned task under the same row lock. Two
 -- members cannot both acquire it through the backend's copy operation.
 IF coalesce(m->>'assignee','')='' AND action IN ('copy_note','copy_message','request_sent','already_connected') THEN m:=m||jsonb_build_object('assignee',p->>'actor');END IF;
 IF action IN ('reply','opt_out','wrong_person','not_interested') THEN
  stopped:=outreach_record_stop(jsonb_build_object('org_id',a.org_id,'activity_id',a.id,'kind',CASE WHEN action='not_interested' THEN 'reply' ELSE action END,'event_id','linkedin:'||(p->>'event_id'),'source_ref','customer_reported:'||(p->>'actor')));
  IF stopped->>'saved' IS DISTINCT FROM 'true' THEN RETURN stopped;END IF;
  SELECT dispatch_metadata INTO m FROM outreach_activities WHERE id=a.id;
 END IF;
 m:=m||jsonb_build_object('state',next_state,'events',events||jsonb_build_array(event||jsonb_build_object('recorded_at',clock_timestamp())),'last_customer_action_at',clock_timestamp());
 IF is_stop THEN m:=m||jsonb_build_object('followup_pause_reason',action);END IF;
 IF action IN ('request_sent','accepted','already_connected','message_sent') THEN m:=m||jsonb_build_object(action||'_at',clock_timestamp());END IF;
 UPDATE outreach_activities SET dispatch_metadata=m,status='manual_'||next_state,sent_at=CASE WHEN action='message_sent' THEN coalesce(sent_at,clock_timestamp() AT TIME ZONE 'UTC') ELSE sent_at END WHERE org_id=a.org_id AND id=a.id;
 RETURN jsonb_build_object('saved',true,'state',next_state,'source','customer_reported','provider_verified',false,'execution_authorized',false,'copy_text',CASE WHEN action='copy_note' THEN m->'draft'->>'connection_note' WHEN action='copy_message' THEN m->'draft'->>'message' ELSE NULL END);
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range OR invalid_parameter_value THEN RETURN '{"saved":false,"reason":"invalid_customer_event"}';
END $$;

CREATE OR REPLACE FUNCTION outreach_linkedin_queue(p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE a outreach_activities%ROWTYPE;g jsonb;items jsonb:='[]'::jsonb;local_time timestamp;w jsonb;within_window boolean;due boolean;
BEGIN
 IF coalesce(p->>'org_id','') !~ '^[1-9][0-9]{0,8}$' THEN RETURN '{"items":[],"reason":"invalid_org"}';END IF;
 FOR a IN SELECT * FROM outreach_activities WHERE org_id=(p->>'org_id')::integer AND channel='linkedin' AND dispatch_metadata->>'version'='linkedin_manual_v1' AND dispatch_metadata->>'state' IN ('ready','request_sent','accepted','message_sent') ORDER BY created_at,id LIMIT 100 LOOP
  g:=outreach_linkedin_gate(a.org_id,(a.dispatch_metadata->>'plan_id')::bigint,(a.dispatch_metadata->>'step')::integer);
  IF g->>'allowed'='true' AND (a.dispatch_metadata->>'content_hash' IS DISTINCT FROM g->>'content_hash' OR a.dispatch_metadata->'draft' IS DISTINCT FROM g->'draft' OR a.dispatch_metadata->>'profile_url' IS DISTINCT FROM g->'target'->>'profile_url') THEN g:='{"allowed":false,"reason":"task_snapshot_mismatch"}';END IF;
  w:=g->'sending_window';within_window:=false;
  IF g->>'allowed'='true' AND coalesce(w->>'start_hour','') ~ '^([0-9]|1[0-9]|2[0-3])$' AND coalesce(w->>'end_hour','') ~ '^([1-9]|1[0-9]|2[0-4])$' THEN
   local_time:=now() AT TIME ZONE (g->>'timezone');
   within_window:=extract(hour FROM local_time)>=(w->>'start_hour')::integer AND extract(hour FROM local_time)<(w->>'end_hour')::integer AND (CASE WHEN jsonb_typeof(w->'weekdays')='array' THEN w->'weekdays' @> jsonb_build_array(extract(isodow FROM local_time)::integer) ELSE false END);
  END IF;
  due:=g->>'allowed'='true' AND within_window AND (coalesce(a.dispatch_metadata->>'snooze_until','-infinity'))::timestamptz<=now() AND a.dispatch_metadata->>'state' IN ('ready','accepted');
  items:=items||jsonb_build_array(jsonb_build_object('activity_id',a.id,'org_id',a.org_id,'lead_id',a.lead_id,'plan_id',a.dispatch_metadata->>'plan_id','step',a.dispatch_metadata->>'step','content_hash',a.dispatch_metadata->>'content_hash','state',a.dispatch_metadata->>'state','target',a.dispatch_metadata->'target','draft',a.dispatch_metadata->'draft','assignee',a.dispatch_metadata->>'assignee','snooze_until',a.dispatch_metadata->>'snooze_until','manual_action_due',coalesce(due,false),'gate_reason',g->>'reason','source','customer_reported','execution_authorized',false));
 END LOOP;
 RETURN jsonb_build_object('org_id',(p->>'org_id')::integer,'items',items,'manual_only',true,'execution_authorized',false,'summary',
 (SELECT coalesce(jsonb_object_agg(state,total),'{}'::jsonb) FROM (SELECT dispatch_metadata->>'state' AS state,count(*) AS total FROM outreach_activities WHERE org_id=(p->>'org_id')::integer AND channel='linkedin' AND dispatch_metadata->>'version'='linkedin_manual_v1' GROUP BY 1) s));
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR invalid_parameter_value THEN RETURN '{"items":[],"reason":"malformed_manual_task_data"}';
END $$;
REVOKE ALL ON FUNCTION outreach_linkedin_gate(integer,bigint,integer),outreach_linkedin_prepare(jsonb),outreach_linkedin_event(jsonb),outreach_linkedin_queue(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_linkedin_gate(integer,bigint,integer),outreach_linkedin_prepare(jsonb),outreach_linkedin_event(jsonb),outreach_linkedin_queue(jsonb) TO n8n_user;
COMMIT;
