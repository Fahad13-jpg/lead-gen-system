CREATE FUNCTION outreach_whatsapp_recheck_valid(ob jsonb,expected jsonb) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE stamp timestamptz;
BEGIN
 IF jsonb_typeof(ob) IS DISTINCT FROM 'object' OR jsonb_typeof(expected) IS DISTINCT FROM 'object'
 OR ob->>'version' IS DISTINCT FROM 'whatsapp_recheck_v1' OR ob->>'state' IS DISTINCT FROM 'verified'
 OR ob->'sender_account_match' IS DISTINCT FROM 'true'::jsonb OR ob->'execution_authorized' IS DISTINCT FROM 'false'::jsonb
 OR jsonb_typeof(expected->'template') IS DISTINCT FROM 'object' OR ob->'template' IS DISTINCT FROM expected->'template'
 OR NOT coalesce(ob @> expected,false) THEN RETURN false;END IF;
 stamp:=(ob->>'checked_at')::timestamptz;
 RETURN coalesce(isfinite(stamp) AND stamp BETWEEN now()-interval '24 hours' AND now(),false);
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation THEN RETURN false;
END $$;

CREATE FUNCTION outreach_whatsapp_recheck_input(p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE g jsonb;v strategy_plans%ROWTYPE;previous_activity outreach_activities%ROWTYPE;entry jsonb;requested integer;
BEGIN
 g:=outreach_whatsapp_gate(p);
 IF (g->>'allowed' IS DISTINCT FROM 'true' AND coalesce(g->>'reason','') NOT IN ('sender_not_ready','template_changed_or_unapproved','provider_recheck_required')) OR coalesce(p->>'step','') !~ '^([2-9]|10)$' THEN RETURN '{"ready":false}';END IF;
 requested:=(p->>'step')::integer;
 SELECT * INTO v FROM strategy_plans WHERE org_id=(p->>'org_id')::integer AND id=(p->>'plan_id')::bigint;
 IF NOT FOUND OR v.content_hash IS DISTINCT FROM p->>'content_hash' OR v.content_hash IS DISTINCT FROM md5(v.body::text) THEN RETURN '{"ready":false}';END IF;
 entry:=v.body->'artifacts'->'whatsapp_sequence'->'steps'->(requested-1);
 IF entry->>'channel' IS DISTINCT FROM 'whatsapp' OR coalesce(entry->>'delay_days','') !~ '^([0-9]|[1-5][0-9]|60)$' THEN RETURN '{"ready":false}';END IF;
 SELECT * INTO previous_activity FROM outreach_activities z WHERE z.org_id=v.org_id AND z.lead_id=v.lead_id AND z.channel='whatsapp' AND z.dispatch_metadata->>'version'='whatsapp_v1' AND z.dispatch_metadata->>'plan_id'=v.id::text AND z.dispatch_metadata->>'step'=(requested-1)::text;
 IF NOT FOUND OR previous_activity.status IS DISTINCT FROM 'provider_accepted' OR previous_activity.external_id IS NULL OR previous_activity.sent_at IS NULL OR previous_activity.dispatch_metadata->>'content_hash' IS DISTINCT FROM v.content_hash
 OR previous_activity.dispatch_metadata->>'delivery_status'='failed' OR previous_activity.replied_at IS NOT NULL OR previous_activity.dispatch_metadata->>'stop_reason' IS NOT NULL
 OR (previous_activity.sent_at AT TIME ZONE 'UTC')+(entry->>'delay_days')::integer*interval '1 day'>now() THEN RETURN '{"ready":false}';END IF;
 IF previous_activity.dispatch_metadata->'whatsapp_rechecks'->requested::text->>'state'='failed' AND (previous_activity.dispatch_metadata->'whatsapp_rechecks'->requested::text->>'checked_at')::timestamptz>now()-interval '30 minutes' THEN RETURN '{"ready":false,"reason":"provider_recheck_backoff"}';END IF;
 RETURN jsonb_build_object('ready',true,'task',jsonb_build_object('org_id',v.org_id,'plan_id',v.id::text,'content_hash',v.content_hash,'step',requested,'previous_activity_id',previous_activity.id,'artifact',entry->'artifact'));
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_datetime_format OR datetime_field_overflow THEN RETURN '{"ready":false}';
END $$;

CREATE FUNCTION outreach_whatsapp_recheck_store(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v strategy_plans%ROWTYPE;previous_activity outreach_activities%ROWTYPE;a jsonb;expected jsonb;stamp timestamptz;old_stamp timestamptz;requested integer;
BEGIN
 -- Trusted credential-bound connector only. No public configuration endpoint.
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR coalesce(p->>'org_id','') !~ '^[1-9][0-9]{0,8}$'
 OR coalesce(p->>'plan_id','') !~ '^[1-9][0-9]{0,17}$' OR coalesce(p->>'previous_activity_id','') !~ '^[1-9][0-9]{0,8}$'
 OR coalesce(p->>'step','') !~ '^([2-9]|10)$' OR p->>'version' IS DISTINCT FROM 'whatsapp_recheck_v1'
 OR coalesce(p->>'state','') NOT IN ('verified','failed') OR p->'execution_authorized' IS DISTINCT FROM 'false'::jsonb
 OR octet_length(p::text)>16384
 OR (p-ARRAY['version','org_id','plan_id','content_hash','step','previous_activity_id','connection_id','credential_ref','phone_number_id','waba_id','api_version','checked_at','execution_authorized','state','reason','sender_account_match','template','provider_content_hash'])<>'{}'::jsonb
 THEN RETURN '{"saved":false,"reason":"invalid_recheck"}';END IF;
 stamp:=(p->>'checked_at')::timestamptz;
 IF stamp IS NULL OR NOT isfinite(stamp) OR stamp<now()-interval '5 minutes' OR stamp>now() THEN RETURN '{"saved":false,"reason":"invalid_recheck_time"}';END IF;
 requested:=(p->>'step')::integer;
 PERFORM pg_advisory_xact_lock(727413,1);
 SELECT * INTO v FROM strategy_plans WHERE org_id=(p->>'org_id')::integer AND id=(p->>'plan_id')::bigint;
 IF NOT FOUND OR v.content_hash IS DISTINCT FROM p->>'content_hash' OR v.content_hash IS DISTINCT FROM md5(v.body::text) THEN RETURN '{"saved":false,"reason":"recheck_plan_changed"}';END IF;
 a:=v.body->'artifacts'->'whatsapp_sequence'->'steps'->(requested-1)->'artifact';
 IF a->>'version' IS DISTINCT FROM 'whatsapp_v1' THEN RETURN '{"saved":false,"reason":"reviewed_step_required"}';END IF;
 SELECT * INTO previous_activity FROM outreach_activities WHERE org_id=v.org_id AND id=(p->>'previous_activity_id')::integer AND lead_id=v.lead_id AND channel='whatsapp' FOR UPDATE;
 IF NOT FOUND OR previous_activity.dispatch_metadata->>'version' IS DISTINCT FROM 'whatsapp_v1'
 OR previous_activity.dispatch_metadata->>'plan_id' IS DISTINCT FROM v.id::text OR previous_activity.dispatch_metadata->>'step' IS DISTINCT FROM (requested-1)::text
 OR previous_activity.dispatch_metadata->>'content_hash' IS DISTINCT FROM v.content_hash OR previous_activity.status IS DISTINCT FROM 'provider_accepted'
 OR previous_activity.external_id IS NULL OR previous_activity.sent_at IS NULL
 THEN RETURN '{"saved":false,"reason":"recheck_predecessor_mismatch"}';END IF;
 expected:=jsonb_build_object('org_id',v.org_id,'plan_id',v.id::text,'content_hash',v.content_hash,'step',requested,'previous_activity_id',previous_activity.id,'connection_id',a->>'connection_id','credential_ref',a->>'credential_ref','phone_number_id',a->>'phone_number_id','waba_id',a->>'waba_id','api_version',a->>'api_version');
 IF NOT coalesce(p @> expected,false) THEN RETURN '{"saved":false,"reason":"recheck_sender_mismatch"}';END IF;
 IF p->>'state'='verified' AND NOT outreach_whatsapp_recheck_valid(p,expected||jsonb_build_object('template',(a->'template_snapshot')-'checked_at')) THEN RETURN '{"saved":false,"reason":"recheck_content_mismatch"}';END IF;
 old_stamp:=(previous_activity.dispatch_metadata->'whatsapp_rechecks'->requested::text->>'checked_at')::timestamptz;
 IF old_stamp IS NOT NULL AND (stamp<old_stamp OR stamp=old_stamp AND previous_activity.dispatch_metadata->'whatsapp_rechecks'->requested::text IS DISTINCT FROM p) THEN RETURN '{"saved":false,"reason":"recheck_older_or_conflicting"}';END IF;
 UPDATE outreach_activities SET dispatch_metadata=jsonb_set(dispatch_metadata,'{whatsapp_rechecks}',(CASE WHEN jsonb_typeof(dispatch_metadata->'whatsapp_rechecks')='object' THEN dispatch_metadata->'whatsapp_rechecks' ELSE '{}'::jsonb END)||jsonb_build_object(requested::text,p)) WHERE id=previous_activity.id;
 RETURN jsonb_build_object('saved',true,'state',p->>'state','execution_authorized',false);
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation OR numeric_value_out_of_range THEN RETURN '{"saved":false,"reason":"malformed_recheck"}';
END $$;
