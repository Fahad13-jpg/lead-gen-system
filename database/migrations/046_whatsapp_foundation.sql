-- LOCAL / UNAPPLIED. Initial marketing-template dispatch and correlated replies.
-- No new tables. Trusted operator config in existing campaign JSON; no public config setter.
BEGIN;
CREATE OR REPLACE FUNCTION outreach_whatsapp_gate(p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE v strategy_plans%ROWTYPE;x jsonb;d jsonb;a jsonb;c jsonb;t jsonb;permission jsonb;approval strategy_approvals%ROWTYPE;rendered text;value text;i integer;ref text;local_time timestamp;w jsonb;
BEGIN
 IF coalesce(p->>'org_id','') !~ '^[1-9][0-9]{0,8}$' OR coalesce(p->>'plan_id','') !~ '^[1-9][0-9]{0,17}$' THEN RETURN '{"allowed":false,"reason":"invalid_binding"}';END IF;
 IF coalesce(p->>'step','1')<>'1' THEN RETURN '{"allowed":false,"reason":"followup_template_review_required"}';END IF;
 SELECT * INTO v FROM strategy_plans WHERE org_id=(p->>'org_id')::integer AND id=(p->>'plan_id')::bigint;
 IF NOT FOUND OR v.content_hash IS DISTINCT FROM p->>'content_hash' OR v.content_hash IS DISTINCT FROM md5(v.body::text)
 OR v.body->>'version' IS DISTINCT FROM 'strategy_v2' OR v.body->>'execution_authorized' IS DISTINCT FROM 'false' OR v.body->>'approval_required' IS DISTINCT FROM 'true'
 OR coalesce(v.body->>'state','') NOT IN ('ai_completed','template_completed','template_fallback')
 OR (CASE WHEN jsonb_typeof(v.body->'blocking_reasons')='array' THEN jsonb_array_length(v.body->'blocking_reasons')<>0 ELSE true END)
 OR (CASE WHEN jsonb_typeof(v.body->'validation_errors')='array' THEN jsonb_array_length(v.body->'validation_errors')<>0 ELSE true END)
 OR v.body->'strategy'->'step1'->>'channel' IS DISTINCT FROM 'whatsapp' THEN RETURN '{"allowed":false,"reason":"plan_blocked_or_changed"}';END IF;
 SELECT * INTO approval FROM strategy_approvals WHERE org_id=v.org_id AND plan_id=v.id ORDER BY id DESC LIMIT 1;
 IF NOT FOUND OR approval.action<>'approve' OR approval.content_hash IS DISTINCT FROM v.content_hash THEN RETURN '{"allowed":false,"reason":"approval_required"}';END IF;
 x:=strategy_context(v.org_id,v.campaign_id,v.lead_id);
 IF x IS NULL OR x->>'fingerprint' IS DISTINCT FROM v.fingerprint OR x->'campaign'->>'version' IS DISTINCT FROM v.campaign_version::text OR v.expires_at IS NULL OR NOT isfinite(v.expires_at) OR v.expires_at<=now() THEN RETURN '{"allowed":false,"reason":"stale_plan"}';END IF;
 IF x->>'suppressed' IS DISTINCT FROM 'false' OR x->>'replied' IS DISTINCT FROM 'false' OR EXISTS(SELECT 1 FROM outreach_activities z WHERE z.org_id=v.org_id AND z.lead_id=v.lead_id AND (z.replied_at IS NOT NULL OR z.bounced_at IS NOT NULL OR z.dispatch_metadata->>'stop_reason' IS NOT NULL OR z.dispatch_metadata->>'followup_pause_reason' IS NOT NULL)) THEN RETURN '{"allowed":false,"reason":"lead_stopped"}';END IF;
 IF (CASE WHEN jsonb_typeof(x->'report'->'trust'->'conflicts')='array' THEN jsonb_array_length(x->'report'->'trust'->'conflicts')<>0 ELSE true END) THEN RETURN '{"allowed":false,"reason":"conflicting_evidence"}';END IF;
 d:=x->'campaign'->'config'->'whatsapp_dispatch';a:=v.body->'artifacts'->'whatsapp_dispatch';c:=d->'connection';t:=d->'template';permission:=d->'consents'->v.lead_id::text;
 IF d->>'enabled' IS DISTINCT FROM 'true' OR d->>'campaign_state' IS DISTINCT FROM 'running' OR a->>'version' IS DISTINCT FROM 'whatsapp_v1'
 OR a->>'org_id' IS DISTINCT FROM v.org_id::text OR c->>'org_id' IS DISTINCT FROM v.org_id::text OR c->>'state' IS DISTINCT FROM 'ready' OR coalesce(c->>'credential_ref','')='' OR coalesce(c->>'connection_id','')=''
 OR coalesce(c->>'phone_number_id','') !~ '^[0-9]{5,30}$' OR coalesce(c->>'waba_id','') !~ '^[0-9]{5,30}$' OR coalesce(c->>'api_version','') !~ '^v[0-9]{1,3}[.][0-9]$'
 OR NOT coalesce((c->>'verified_at')::timestamptz BETWEEN now()-interval '24 hours' AND now(),false) OR NOT coalesce((c->>'expires_at')::timestamptz>now(),false)
 OR a->>'connection_id' IS DISTINCT FROM c->>'connection_id' OR a->>'phone_number_id' IS DISTINCT FROM c->>'phone_number_id' OR a->>'waba_id' IS DISTINCT FROM c->>'waba_id' OR a->>'credential_ref' IS DISTINCT FROM c->>'credential_ref' OR a->>'api_version' IS DISTINCT FROM c->>'api_version'
 THEN RETURN '{"allowed":false,"reason":"sender_not_ready"}';END IF;
 IF a->>'recipient' IS DISTINCT FROM x->'lead'->>'phone' OR coalesce(a->>'recipient','') !~ '^\+[1-9][0-9]{7,14}$' OR permission->>'phone' IS DISTINCT FROM a->>'recipient' OR permission->>'state' IS DISTINCT FROM 'granted' OR permission->>'purpose' IS DISTINCT FROM 'marketing' OR permission->>'country_verified' IS DISTINCT FROM 'true' OR nullif(permission->>'source_ref','') IS NULL
 OR NOT coalesce((permission->>'recorded_at')::timestamptz BETWEEN now()-interval '365 days' AND now(),false) OR NOT coalesce((permission->>'expires_at')::timestamptz>now(),false)
 OR permission->>'country' IS DISTINCT FROM 'PK' OR a->>'country' IS DISTINCT FROM 'PK' OR coalesce(a->>'recipient','') !~ '^\+92[0-9]{7,12}$' THEN RETURN '{"allowed":false,"reason":"permission_or_market_blocked"}';END IF;
 IF t->>'status' IS DISTINCT FROM 'APPROVED' OR t->>'category' IS DISTINCT FROM 'MARKETING' OR a->'template_snapshot' IS DISTINCT FROM t
 OR a->>'template_id' IS DISTINCT FROM t->>'id' OR a->>'template_name' IS DISTINCT FROM t->>'name' OR a->>'language' IS DISTINCT FROM t->>'language' OR a->>'revision' IS DISTINCT FROM t->>'revision'
 OR NOT coalesce((t->>'checked_at')::timestamptz BETWEEN now()-interval '24 hours' AND now(),false)
 OR jsonb_typeof(t->'body') IS DISTINCT FROM 'string' OR jsonb_typeof(t->'variable_refs') IS DISTINCT FROM 'array' OR jsonb_typeof(a->'variables') IS DISTINCT FROM 'array' THEN RETURN '{"allowed":false,"reason":"template_changed_or_unapproved"}';END IF;
 IF jsonb_array_length(t->'variable_refs')>8 OR jsonb_array_length(t->'variable_refs')<>jsonb_array_length(a->'variables') THEN RETURN '{"allowed":false,"reason":"template_variables_invalid"}';END IF;
 rendered:=t->>'body';
 FOR i IN 0..jsonb_array_length(t->'variable_refs')-1 LOOP
  ref:=t->'variable_refs'->>i;
  value:=CASE ref WHEN 'company_name' THEN x->'lead'->>'company_name' WHEN 'city' THEN x->'lead'->>'city' WHEN 'offer_name' THEN x->'campaign'->'config'->'offer'->>'name' WHEN 'offer_description' THEN x->'campaign'->'config'->'offer'->>'description' WHEN 'benefit_1' THEN x->'campaign'->'config'->'offer'->'approved_points'->>0 WHEN 'cta' THEN x->'campaign'->'config'->'cta'->>'text' WHEN 'sender_name' THEN x->'campaign'->'config'->'sender'->>'name' WHEN 'sender_company' THEN x->'campaign'->'config'->'sender'->>'company' ELSE NULL END;
  IF length(coalesce(value,'')) NOT BETWEEN 1 AND 500 OR a->'variables'->>i IS DISTINCT FROM value OR position('{{'||(i+1)||'}}' IN rendered)=0 THEN RETURN '{"allowed":false,"reason":"template_variables_invalid"}';END IF;
  rendered:=replace(rendered,'{{'||(i+1)||'}}',value);
 END LOOP;
 IF rendered IS DISTINCT FROM a->>'rendered' OR rendered IS DISTINCT FROM v.body->'artifacts'->>'whatsapp_draft' OR length(rendered) NOT BETWEEN 1 AND 1500 OR rendered LIKE '%{{%' OR position('Reply STOP to opt out.' IN rendered)=0 THEN RETURN '{"allowed":false,"reason":"approved_render_mismatch"}';END IF;
 IF d->'quote'->>'verified' IS DISTINCT FROM 'true' OR d->'quote'->>'currency' IS DISTINCT FROM 'USD' OR NOT coalesce((d->'quote'->>'expires_at')::timestamptz>now(),false)
 OR coalesce(d->'quote'->>'max_message_micro_usd','') !~ '^[1-9][0-9]{0,8}$' OR a->>'max_message_micro_usd' IS DISTINCT FROM d->'quote'->>'max_message_micro_usd'
 OR coalesce(d->'limits'->>'daily_messages','') !~ '^([1-9][0-9]{0,2}|1000)$' OR coalesce(d->'limits'->>'monthly_micro_usd','') !~ '^[1-9][0-9]{0,11}$' OR coalesce(d->'limits'->>'min_interval_seconds','') !~ '^[1-9][0-9]{0,4}$'
 OR d->'release'->>'enabled' IS DISTINCT FROM 'true' OR NOT coalesce((d->'release'->>'expires_at')::timestamptz>now(),false) THEN RETURN '{"allowed":false,"reason":"budget_quote_or_release_required"}';END IF;
 w:=x->'campaign'->'config'->'sending_window';
 IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=x->'campaign'->'config'->>'timezone') OR coalesce(w->>'start_hour','') !~ '^([0-9]|1[0-9]|2[0-3])$' OR coalesce(w->>'end_hour','') !~ '^([1-9]|1[0-9]|2[0-4])$' THEN RETURN '{"allowed":false,"reason":"working_window_required"}';END IF;
 local_time:=now() AT TIME ZONE (x->'campaign'->'config'->>'timezone');
 IF extract(hour FROM local_time)<(w->>'start_hour')::integer OR extract(hour FROM local_time)>=(w->>'end_hour')::integer OR NOT (CASE WHEN jsonb_typeof(w->'weekdays')='array' THEN w->'weekdays' @> jsonb_build_array(extract(isodow FROM local_time)::integer) ELSE false END) THEN RETURN '{"allowed":false,"reason":"outside_working_window"}';END IF;
 RETURN jsonb_build_object('allowed',true,'artifact',a,'config',d,'lead_id',v.lead_id,'org_id',v.org_id,'plan_id',v.id,'execution_authorized',false);
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range OR invalid_parameter_value THEN RETURN '{"allowed":false,"reason":"malformed_whatsapp_configuration"}';
END $$;

CREATE OR REPLACE FUNCTION outreach_whatsapp_begin(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE g jsonb;a outreach_activities%ROWTYPE;cap bigint;daily integer;spacing integer;amount bigint;lease text;
BEGIN
 PERFORM pg_advisory_xact_lock(727413,1);
 g:=outreach_whatsapp_gate(p);IF g->>'allowed' IS DISTINCT FROM 'true' THEN RETURN g||'{"authorized":false}';END IF;
 IF EXISTS(SELECT 1 FROM strategy_campaigns c JOIN strategy_campaign_versions cv ON cv.org_id=c.org_id AND cv.campaign_id=c.id AND cv.version=c.version WHERE c.org_id<>(g->>'org_id')::integer AND cv.config->'whatsapp_dispatch'->'connection'->>'phone_number_id'=g->'artifact'->>'phone_number_id' AND cv.config->'whatsapp_dispatch'->>'enabled'='true') THEN RETURN '{"authorized":false,"reason":"sender_bound_to_another_org"}';END IF;
 -- Minimum current enabled campaign caps apply across the organization.
 SELECT min(CASE WHEN coalesce(cv.config->'whatsapp_dispatch'->'limits'->>'monthly_micro_usd','') ~ '^[1-9][0-9]{0,11}$' THEN (cv.config->'whatsapp_dispatch'->'limits'->>'monthly_micro_usd')::bigint ELSE 0 END),min(CASE WHEN coalesce(cv.config->'whatsapp_dispatch'->'limits'->>'daily_messages','') ~ '^([1-9][0-9]{0,2}|1000)$' THEN (cv.config->'whatsapp_dispatch'->'limits'->>'daily_messages')::integer ELSE 0 END),max(CASE WHEN coalesce(cv.config->'whatsapp_dispatch'->'limits'->>'min_interval_seconds','') ~ '^[1-9][0-9]{0,4}$' THEN (cv.config->'whatsapp_dispatch'->'limits'->>'min_interval_seconds')::integer ELSE 99999 END)
 INTO cap,daily,spacing FROM strategy_campaigns c JOIN strategy_campaign_versions cv ON cv.org_id=c.org_id AND cv.campaign_id=c.id AND cv.version=c.version WHERE c.org_id=(g->>'org_id')::integer AND cv.config->'whatsapp_dispatch'->>'enabled'='true';
 amount:=(g->'artifact'->>'max_message_micro_usd')::bigint;
 IF coalesce(cap,0)<amount OR (SELECT coalesce(sum(CASE WHEN dispatch_metadata->>'reserved_micro_usd' ~ '^[0-9]{1,12}$' THEN (dispatch_metadata->>'reserved_micro_usd')::bigint ELSE cap END),0) FROM outreach_activities WHERE org_id=(g->>'org_id')::integer AND dispatch_metadata->>'version'='whatsapp_v1' AND (dispatch_metadata->>'accounting_month'=to_char(now() AT TIME ZONE 'UTC','YYYY-MM') OR dispatch_metadata->>'state' IN ('attempting','uncertain')))+amount>cap THEN RETURN '{"authorized":false,"reason":"monthly_budget_exhausted"}';END IF;
 IF (SELECT count(*) FROM outreach_activities WHERE org_id=(g->>'org_id')::integer AND dispatch_metadata->>'version'='whatsapp_v1' AND created_at AT TIME ZONE 'UTC'>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')>=coalesce(daily,0) THEN RETURN '{"authorized":false,"reason":"daily_limit_reached"}';END IF;
 IF EXISTS(SELECT 1 FROM outreach_activities WHERE org_id=(g->>'org_id')::integer AND dispatch_metadata->>'version'='whatsapp_v1' AND (dispatch_metadata->>'state' IN ('attempting','uncertain') OR created_at>now()-spacing*interval '1 second')) THEN RETURN '{"authorized":false,"reason":"previous_attempt_or_spacing_unresolved"}';END IF;
 lease:=md5(random()::text||clock_timestamp()::text||p::text);
 INSERT INTO outreach_activities(org_id,lead_id,channel,status,dispatch_metadata) VALUES((g->>'org_id')::integer,(g->>'lead_id')::integer,'whatsapp','attempting',jsonb_build_object('version','whatsapp_v1','plan_id',p->>'plan_id','step','1','content_hash',p->>'content_hash','lease',lease,'lease_until',now()+interval '5 minutes','state','attempting','attempts',1,'recipient',g->'artifact'->>'recipient','connection_id',g->'artifact'->>'connection_id','phone_number_id',g->'artifact'->>'phone_number_id','waba_id',g->'artifact'->>'waba_id','artifact',g->'artifact','reserved_micro_usd',amount,'accounting_month',to_char(now() AT TIME ZONE 'UTC','YYYY-MM'),'events','[]'::jsonb)) ON CONFLICT DO NOTHING RETURNING * INTO a;
 IF NOT FOUND THEN RETURN '{"authorized":false,"reason":"step_already_recorded"}';END IF;
 RETURN jsonb_build_object('authorized',true,'activity_id',a.id,'lease',lease,'artifact',g->'artifact');
END $$;

CREATE OR REPLACE FUNCTION outreach_whatsapp_finish(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a outreach_activities%ROWTYPE;m jsonb;
BEGIN
 IF coalesce(p->>'org_id','') !~ '^[1-9][0-9]{0,8}$' OR coalesce(p->>'activity_id','') !~ '^[1-9][0-9]{0,8}$' THEN RETURN '{"saved":false,"reason":"invalid_binding"}';END IF;
 PERFORM pg_advisory_xact_lock(727413,1);
 SELECT * INTO a FROM outreach_activities WHERE org_id=(p->>'org_id')::integer AND id=(p->>'activity_id')::integer AND channel='whatsapp' FOR UPDATE;m:=a.dispatch_metadata;
 IF NOT FOUND OR m->>'version' IS DISTINCT FROM 'whatsapp_v1' OR coalesce(p->>'lease','')='' OR m->>'lease' IS DISTINCT FROM p->>'lease' OR m->>'content_hash' IS DISTINCT FROM p->>'content_hash' THEN RETURN '{"saved":false,"reason":"binding_mismatch"}';END IF;
 IF p->>'state'='uncertain' THEN
  IF m->>'state' NOT IN ('attempting','uncertain') THEN RETURN '{"saved":false,"reason":"acceptance_already_recorded"}';END IF;
  UPDATE outreach_activities SET status='uncertain',dispatch_metadata=m||'{"state":"uncertain","retry_allowed":false}'::jsonb WHERE id=a.id;RETURN '{"saved":true,"state":"uncertain","retry_allowed":false}';
 END IF;
 IF p->>'state' IS DISTINCT FROM 'provider_accepted' OR length(coalesce(p->>'provider_message_id',''))>255 OR coalesce(p->>'provider_message_id','') !~ '^wamid[.][A-Za-z0-9_+/=.-]+$' THEN RETURN '{"saved":false,"reason":"provider_receipt_required"}';END IF;
 IF a.external_id IS NOT NULL THEN RETURN jsonb_build_object('saved',a.external_id=p->>'provider_message_id','idempotent',a.external_id=p->>'provider_message_id');END IF;
 IF m->>'state' NOT IN ('attempting','uncertain') THEN RETURN '{"saved":false,"reason":"invalid_attempt_state"}';END IF;
 UPDATE outreach_activities SET external_id=p->>'provider_message_id',whatsapp_sid=p->>'provider_message_id',status='provider_accepted',sent_at=now() AT TIME ZONE 'UTC',dispatch_metadata=m||jsonb_build_object('state','provider_accepted','delivered',false,'billing_state','reserved_ceiling_unsettled') WHERE id=a.id;
 RETURN '{"saved":true,"state":"provider_accepted","delivered":false}';
END $$;

CREATE OR REPLACE FUNCTION outreach_whatsapp_event(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a outreach_activities%ROWTYPE;m jsonb;events jsonb;e jsonb;old jsonb;key text;stamp timestamptz;rank integer;previous integer;r jsonb;
BEGIN
 IF coalesce(p->>'org_id','') !~ '^[1-9][0-9]{0,8}$' OR coalesce(p->>'activity_id','') !~ '^[1-9][0-9]{0,8}$' OR p->'signature_verified' IS DISTINCT FROM 'true'::jsonb OR coalesce(p->>'kind','') NOT IN ('status','inbound') OR length(coalesce(p->>'provider_message_id','')) NOT BETWEEN 1 AND 450 THEN RETURN '{"saved":false,"reason":"invalid_provider_event"}';END IF;
 PERFORM pg_advisory_xact_lock(727413,1);
 SELECT * INTO a FROM outreach_activities WHERE org_id=(p->>'org_id')::integer AND id=(p->>'activity_id')::integer AND channel='whatsapp' FOR UPDATE;m:=a.dispatch_metadata;
 IF NOT FOUND OR m->>'version' IS DISTINCT FROM 'whatsapp_v1' OR m->>'phone_number_id' IS DISTINCT FROM p->>'phone_number_id' OR m->>'waba_id' IS DISTINCT FROM p->>'waba_id' OR m->>'recipient' IS DISTINCT FROM p->>'recipient' THEN RETURN '{"saved":false,"reason":"sender_or_recipient_mismatch"}';END IF;
 stamp:=(p->>'occurred_at')::timestamptz;IF stamp IS NULL OR NOT isfinite(stamp) OR stamp>now()+interval '5 minutes' OR stamp<(a.created_at AT TIME ZONE 'UTC')-interval '5 minutes' THEN RETURN '{"saved":false,"reason":"invalid_event_time"}';END IF;
 IF p->>'kind'='status' AND a.external_id IS DISTINCT FROM p->>'provider_message_id' THEN RETURN '{"saved":false,"reason":"message_id_mismatch"}';END IF;
 e:=p-'signature_verified'-'activity_id'-'org_id';key:=(p->>'kind')||':'||(p->>'provider_message_id')||':'||coalesce(p->>'status','');
 events:=CASE WHEN jsonb_typeof(m->'events')='array' THEN m->'events' ELSE '[]'::jsonb END;
 SELECT z INTO old FROM jsonb_array_elements(events) z WHERE z->>'key'=key;
 IF old IS NOT NULL THEN RETURN jsonb_build_object('saved',old->'event'=e,'idempotent',old->'event'=e,'reason',CASE WHEN old->'event'=e THEN 'already_recorded' ELSE 'event_conflict' END);END IF;
 IF jsonb_array_length(events)>=100 AND p->>'kind'<>'inbound' THEN RETURN '{"saved":false,"reason":"event_storage_review_required"}';END IF;
 IF jsonb_array_length(events)>=100 THEN SELECT coalesce(jsonb_agg(z),'[]'::jsonb) INTO events FROM jsonb_array_elements(events) WITH ORDINALITY q(z,n) WHERE n>jsonb_array_length(events)-80;END IF;
 IF p->>'kind'='inbound' THEN
  r:=outreach_record_stop(jsonb_build_object('org_id',a.org_id,'activity_id',a.id,'event_id','wa:'||md5(key),'kind',CASE WHEN p->>'opt_out'='true' OR m->>'stop_reason'='opt_out' THEN 'opt_out' ELSE 'reply' END,'source_ref','meta_verified_callback'));
  IF r->>'saved' IS DISTINCT FROM 'true' THEN RETURN r;END IF;
  SELECT dispatch_metadata INTO m FROM outreach_activities WHERE id=a.id;
  m:=m||jsonb_build_object('last_inbound_at',greatest(coalesce((m->>'last_inbound_at')::timestamptz,stamp),stamp),'followup_pause_reason',CASE WHEN m->>'stop_reason'='opt_out' OR p->>'opt_out'='true' THEN 'opt_out' ELSE 'reply' END);
 ELSE
  rank:=CASE p->>'status' WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3 WHEN 'failed' THEN -1 ELSE NULL END;
  IF rank IS NULL THEN RETURN '{"saved":false,"reason":"unknown_delivery_status"}';END IF;
  previous:=coalesce((m->>'delivery_rank')::integer,0);
  IF rank=-1 AND previous>=2 THEN m:=m||'{"delivery_conflict":true}';
  ELSIF rank>previous OR rank=-1 AND previous=0 THEN m:=m||jsonb_build_object('delivery_status',p->>'status','delivery_rank',rank,'delivered',rank>=2);END IF;
 END IF;
 UPDATE outreach_activities SET dispatch_metadata=m||jsonb_build_object('events',events||jsonb_build_array(jsonb_build_object('key',key,'event',e,'recorded_at',now()))) WHERE id=a.id;
 RETURN '{"saved":true,"retry_allowed":false}';
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN RETURN '{"saved":false,"reason":"malformed_provider_event"}';
END $$;

CREATE OR REPLACE FUNCTION outreach_whatsapp_queue(p jsonb) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('execution_authorized',false,'items',coalesce(jsonb_agg(jsonb_build_object('org_id',v.org_id,'plan_id',v.id::text,'content_hash',v.content_hash,'step',1) ORDER BY v.created_at,v.id),'[]'::jsonb)) FROM (SELECT * FROM strategy_plans WHERE org_id=CASE WHEN p->>'org_id' ~ '^[1-9][0-9]{0,8}$' THEN (p->>'org_id')::integer ELSE 0 END AND body->'artifacts'->'whatsapp_dispatch'->>'version'='whatsapp_v1' ORDER BY created_at,id LIMIT 50) v
 WHERE NOT EXISTS(SELECT 1 FROM outreach_activities a WHERE a.org_id=v.org_id AND a.dispatch_metadata->>'plan_id'=v.id::text AND a.dispatch_metadata->>'step'='1');
$$;
CREATE OR REPLACE FUNCTION outreach_whatsapp_ingest(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE e jsonb;a outreach_activities%ROWTYPE;r jsonb;matches integer;plans integer;processed integer:=0;
BEGIN
 IF p->'signature_verified' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(p->'events') IS DISTINCT FROM 'array' THEN RETURN '{"saved":false,"reason":"verified_batch_required"}';END IF;
 IF jsonb_array_length(p->'events')>50 THEN RETURN '{"saved":false,"reason":"event_batch_limit"}';END IF;
 PERFORM pg_advisory_xact_lock(727413,1);
 FOR e IN SELECT value FROM jsonb_array_elements(p->'events') LOOP
  SELECT count(DISTINCT z.org_id),count(DISTINCT z.dispatch_metadata->>'plan_id') INTO matches,plans FROM outreach_activities z WHERE z.channel='whatsapp' AND z.dispatch_metadata->>'version'='whatsapp_v1'
  AND z.dispatch_metadata->>'phone_number_id'=e->>'phone_number_id' AND z.dispatch_metadata->>'waba_id'=e->>'waba_id' AND z.dispatch_metadata->>'recipient'=e->>'recipient'
  AND CASE WHEN e->>'kind'='status' THEN z.external_id=e->>'provider_message_id' WHEN e->>'kind'='inbound' THEN CASE WHEN nullif(e->>'context_id','') IS NOT NULL THEN z.external_id=e->>'context_id' ELSE true END ELSE false END;
  IF matches<>1 OR plans<>1 THEN RETURN jsonb_build_object('saved',false,'reason','unmatched_or_ambiguous_inbound_storage_review_required','processed',processed);END IF;
  SELECT * INTO a FROM outreach_activities z WHERE z.channel='whatsapp' AND z.dispatch_metadata->>'version'='whatsapp_v1' AND z.dispatch_metadata->>'phone_number_id'=e->>'phone_number_id' AND z.dispatch_metadata->>'waba_id'=e->>'waba_id' AND z.dispatch_metadata->>'recipient'=e->>'recipient'
  AND CASE WHEN e->>'kind'='status' THEN z.external_id=e->>'provider_message_id' ELSE CASE WHEN nullif(e->>'context_id','') IS NOT NULL THEN z.external_id=e->>'context_id' ELSE true END END ORDER BY id DESC LIMIT 1;
  r:=outreach_whatsapp_event(e||jsonb_build_object('org_id',a.org_id,'activity_id',a.id,'signature_verified',true));
  IF r->>'saved' IS DISTINCT FROM 'true' THEN RETURN r||jsonb_build_object('processed',processed);END IF;processed:=processed+1;
 END LOOP;
 RETURN jsonb_build_object('saved',true,'processed',processed);
END $$;
REVOKE ALL ON FUNCTION outreach_whatsapp_gate(jsonb),outreach_whatsapp_begin(jsonb),outreach_whatsapp_finish(jsonb),outreach_whatsapp_event(jsonb),outreach_whatsapp_queue(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_whatsapp_gate(jsonb),outreach_whatsapp_begin(jsonb),outreach_whatsapp_finish(jsonb),outreach_whatsapp_event(jsonb),outreach_whatsapp_queue(jsonb) TO n8n_user;
REVOKE ALL ON FUNCTION outreach_whatsapp_ingest(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_whatsapp_ingest(jsonb) TO n8n_user;
COMMIT;
