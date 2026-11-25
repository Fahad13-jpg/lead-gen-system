-- LOCAL / UNAPPLIED. Requires 046, 047, 048. No new tables/webhooks.
-- Mutable provider observations use existing predecessor dispatch metadata.
-- Never changes an approved plan, campaign config, hash, fingerprint, expiry or quote.
-- Connector wiring/live recheck behavior remains UNVERIFIED; do not deploy yet.
BEGIN;
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

CREATE OR REPLACE FUNCTION outreach_whatsapp_gate_046(p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE v strategy_plans%ROWTYPE;x jsonb;d jsonb;a jsonb;c jsonb;t jsonb;permission jsonb;approval strategy_approvals%ROWTYPE;rendered text;value text;i integer;ref text;local_time timestamp;w jsonb;requested integer;seq jsonb;entry jsonb;previous_entry jsonb;previous_activity outreach_activities%ROWTYPE;idx integer;observation jsonb;recheck_ok boolean:=false;
BEGIN
 IF coalesce(p->>'org_id','') !~ '^[1-9][0-9]{0,8}$' OR coalesce(p->>'plan_id','') !~ '^[1-9][0-9]{0,17}$' THEN RETURN '{"allowed":false,"reason":"invalid_binding"}';END IF;
 IF coalesce(p->>'step','1') !~ '^([1-9]|10)$' THEN RETURN '{"allowed":false,"reason":"invalid_whatsapp_step"}';END IF;
 requested:=coalesce(p->>'step','1')::integer;
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
 seq:=v.body->'artifacts'->'whatsapp_sequence';
 IF seq IS NOT NULL THEN
  IF seq->>'version' IS DISTINCT FROM 'whatsapp_sequence_v1' OR seq->>'org_id' IS DISTINCT FROM v.org_id::text OR seq->>'lead_id' IS DISTINCT FROM v.lead_id::text OR seq->'execution_authorized' IS DISTINCT FROM 'false'::jsonb
  OR jsonb_typeof(seq->'steps') IS DISTINCT FROM 'array' OR jsonb_typeof(x->'campaign'->'config'->'sequence') IS DISTINCT FROM 'array' THEN RETURN '{"allowed":false,"reason":"invalid_whatsapp_sequence"}';END IF;
  IF jsonb_array_length(seq->'steps') NOT BETWEEN 1 AND 10 OR jsonb_array_length(seq->'steps')<>jsonb_array_length(x->'campaign'->'config'->'sequence') OR requested>jsonb_array_length(seq->'steps') THEN RETURN '{"allowed":false,"reason":"invalid_whatsapp_sequence"}';END IF;
  FOR idx IN 1..jsonb_array_length(seq->'steps') LOOP
   entry:=seq->'steps'->(idx-1);
   IF entry->'step' IS DISTINCT FROM to_jsonb(idx) OR entry->>'channel' IS DISTINCT FROM 'whatsapp' OR entry->'execution_authorized'='true'::jsonb
   OR entry->'artifact'->'execution_authorized' IS DISTINCT FROM 'false'::jsonb
   OR entry->'previous_step' IS DISTINCT FROM (CASE WHEN idx=1 THEN 'null'::jsonb ELSE to_jsonb(idx-1) END)
   OR entry->>'delay_basis' IS DISTINCT FROM (CASE WHEN idx=1 THEN 'initial' ELSE 'previous_confirmed_send' END)
   OR coalesce(entry->>'delay_days','') !~ '^([0-9]|[1-5][0-9]|60)$'
   OR entry->'delay_days' IS DISTINCT FROM x->'campaign'->'config'->'sequence'->(idx-1)->'delay_days'
   OR x->'campaign'->'config'->'sequence'->(idx-1)->'step' IS DISTINCT FROM to_jsonb(idx)
   OR x->'campaign'->'config'->'sequence'->(idx-1)->>'channel' IS DISTINCT FROM 'whatsapp'
   OR (idx=1 AND entry->'delay_days' IS DISTINCT FROM '0'::jsonb) THEN RETURN '{"allowed":false,"reason":"invalid_whatsapp_sequence"}';END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(seq->'steps') WITH ORDINALITY q(prior,n) WHERE n<idx AND prior->'artifact'->>'rendered'=entry->'artifact'->>'rendered') THEN RETURN '{"allowed":false,"reason":"repeated_step_message_requires_revision"}';END IF;
  END LOOP;
  IF seq->'steps'->0->'artifact' IS DISTINCT FROM a THEN RETURN '{"allowed":false,"reason":"first_step_artifact_changed"}';END IF;
  entry:=seq->'steps'->(requested-1);a:=entry->'artifact';
  t:=coalesce(nullif(d->'templates_by_step'->requested::text,'null'::jsonb),CASE WHEN requested=1 THEN d->'template' END);
  IF requested>1 THEN
   SELECT * INTO previous_activity FROM outreach_activities z WHERE z.org_id=v.org_id AND z.lead_id=v.lead_id AND z.channel='whatsapp' AND z.dispatch_metadata->>'version'='whatsapp_v1' AND z.dispatch_metadata->>'plan_id'=v.id::text AND z.dispatch_metadata->>'step'=(requested-1)::text;
   observation:=previous_activity.dispatch_metadata->'whatsapp_rechecks'->requested::text;
   IF observation IS NOT NULL THEN
    recheck_ok:=outreach_whatsapp_recheck_valid(observation,jsonb_build_object('org_id',v.org_id,'plan_id',v.id::text,'content_hash',v.content_hash,'step',requested,'previous_activity_id',previous_activity.id,'connection_id',a->>'connection_id','credential_ref',a->>'credential_ref','phone_number_id',a->>'phone_number_id','waba_id',a->>'waba_id','api_version',a->>'api_version','template',t-'checked_at'));
    IF NOT recheck_ok THEN RETURN '{"allowed":false,"reason":"provider_recheck_required"}';END IF;
   END IF;
  END IF;
 ELSIF requested<>1 OR d ? 'templates_by_step' THEN RETURN '{"allowed":false,"reason":"followup_template_review_required"}';END IF;
 IF d->>'enabled' IS DISTINCT FROM 'true' OR d->>'campaign_state' IS DISTINCT FROM 'running' OR a->>'version' IS DISTINCT FROM 'whatsapp_v1'
 OR a->>'org_id' IS DISTINCT FROM v.org_id::text OR c->>'org_id' IS DISTINCT FROM v.org_id::text OR c->>'state' IS DISTINCT FROM 'ready' OR coalesce(c->>'credential_ref','')='' OR coalesce(c->>'connection_id','')=''
 OR coalesce(c->>'phone_number_id','') !~ '^[0-9]{5,30}$' OR coalesce(c->>'waba_id','') !~ '^[0-9]{5,30}$' OR coalesce(c->>'api_version','') !~ '^v[0-9]{1,3}[.][0-9]$'
 OR (NOT recheck_ok AND NOT coalesce((c->>'verified_at')::timestamptz BETWEEN now()-interval '24 hours' AND now(),false)) OR NOT coalesce((c->>'expires_at')::timestamptz>now(),false)
 OR a->>'connection_id' IS DISTINCT FROM c->>'connection_id' OR a->>'phone_number_id' IS DISTINCT FROM c->>'phone_number_id' OR a->>'waba_id' IS DISTINCT FROM c->>'waba_id' OR a->>'credential_ref' IS DISTINCT FROM c->>'credential_ref' OR a->>'api_version' IS DISTINCT FROM c->>'api_version'
 THEN RETURN '{"allowed":false,"reason":"sender_not_ready"}';END IF;
 IF a->>'recipient' IS DISTINCT FROM x->'lead'->>'phone' OR coalesce(a->>'recipient','') !~ '^\+[1-9][0-9]{7,14}$' OR permission->>'phone' IS DISTINCT FROM a->>'recipient' OR permission->>'state' IS DISTINCT FROM 'granted' OR permission->>'purpose' IS DISTINCT FROM 'marketing' OR permission->>'country_verified' IS DISTINCT FROM 'true' OR nullif(permission->>'source_ref','') IS NULL
 OR NOT coalesce((permission->>'recorded_at')::timestamptz BETWEEN now()-interval '365 days' AND now(),false) OR NOT coalesce((permission->>'expires_at')::timestamptz>now(),false)
 OR permission->>'country' IS DISTINCT FROM 'PK' OR a->>'country' IS DISTINCT FROM 'PK' OR coalesce(a->>'recipient','') !~ '^\+92[0-9]{7,12}$' THEN RETURN '{"allowed":false,"reason":"permission_or_market_blocked"}';END IF;
 IF t->>'status' IS DISTINCT FROM 'APPROVED' OR t->>'category' IS DISTINCT FROM 'MARKETING' OR a->'template_snapshot' IS DISTINCT FROM t
 OR a->>'template_id' IS DISTINCT FROM t->>'id' OR a->>'template_name' IS DISTINCT FROM t->>'name' OR a->>'language' IS DISTINCT FROM t->>'language' OR a->>'revision' IS DISTINCT FROM t->>'revision'
 OR (NOT recheck_ok AND NOT coalesce((t->>'checked_at')::timestamptz BETWEEN now()-interval '24 hours' AND now(),false))
 OR jsonb_typeof(t->'body') IS DISTINCT FROM 'string' OR jsonb_typeof(t->'variable_refs') IS DISTINCT FROM 'array' OR jsonb_typeof(a->'variables') IS DISTINCT FROM 'array' THEN RETURN '{"allowed":false,"reason":"template_changed_or_unapproved"}';END IF;
 IF jsonb_array_length(t->'variable_refs')>8 OR jsonb_array_length(t->'variable_refs')<>jsonb_array_length(a->'variables') THEN RETURN '{"allowed":false,"reason":"template_variables_invalid"}';END IF;
 rendered:=t->>'body';
 FOR i IN 0..jsonb_array_length(t->'variable_refs')-1 LOOP
  ref:=t->'variable_refs'->>i;
  value:=CASE ref WHEN 'company_name' THEN x->'lead'->>'company_name' WHEN 'city' THEN x->'lead'->>'city' WHEN 'offer_name' THEN x->'campaign'->'config'->'offer'->>'name' WHEN 'offer_description' THEN x->'campaign'->'config'->'offer'->>'description' WHEN 'benefit_1' THEN x->'campaign'->'config'->'offer'->'approved_points'->>0 WHEN 'cta' THEN x->'campaign'->'config'->'cta'->>'text' WHEN 'sender_name' THEN x->'campaign'->'config'->'sender'->>'name' WHEN 'sender_company' THEN x->'campaign'->'config'->'sender'->>'company' ELSE NULL END;
  IF length(coalesce(value,'')) NOT BETWEEN 1 AND 500 OR a->'variables'->>i IS DISTINCT FROM value OR position('{{'||(i+1)||'}}' IN rendered)=0 THEN RETURN '{"allowed":false,"reason":"template_variables_invalid"}';END IF;
  rendered:=replace(rendered,'{{'||(i+1)||'}}',value);
 END LOOP;
 IF rendered IS DISTINCT FROM a->>'rendered' OR (requested=1 AND rendered IS DISTINCT FROM v.body->'artifacts'->>'whatsapp_draft') OR length(rendered) NOT BETWEEN 1 AND 1500 OR rendered LIKE '%{{%' OR position('Reply STOP to opt out.' IN rendered)=0 THEN RETURN '{"allowed":false,"reason":"approved_render_mismatch"}';END IF;
 IF d->'quote'->>'verified' IS DISTINCT FROM 'true' OR d->'quote'->>'currency' IS DISTINCT FROM 'USD' OR NOT coalesce((d->'quote'->>'expires_at')::timestamptz>now(),false)
 OR coalesce(d->'quote'->>'max_message_micro_usd','') !~ '^[1-9][0-9]{0,8}$' OR a->>'max_message_micro_usd' IS DISTINCT FROM d->'quote'->>'max_message_micro_usd'
 OR coalesce(d->'limits'->>'daily_messages','') !~ '^([1-9][0-9]{0,2}|1000)$' OR coalesce(d->'limits'->>'monthly_micro_usd','') !~ '^[1-9][0-9]{0,11}$' OR coalesce(d->'limits'->>'min_interval_seconds','') !~ '^[1-9][0-9]{0,4}$'
 OR d->'release'->>'enabled' IS DISTINCT FROM 'true' OR NOT coalesce((d->'release'->>'expires_at')::timestamptz>now(),false) THEN RETURN '{"allowed":false,"reason":"budget_quote_or_release_required"}';END IF;
 w:=x->'campaign'->'config'->'sending_window';
 IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=x->'campaign'->'config'->>'timezone') OR coalesce(w->>'start_hour','') !~ '^([0-9]|1[0-9]|2[0-3])$' OR coalesce(w->>'end_hour','') !~ '^([1-9]|1[0-9]|2[0-4])$' THEN RETURN '{"allowed":false,"reason":"working_window_required"}';END IF;
 local_time:=now() AT TIME ZONE (x->'campaign'->'config'->>'timezone');
 IF extract(hour FROM local_time)<(w->>'start_hour')::integer OR extract(hour FROM local_time)>=(w->>'end_hour')::integer OR NOT (CASE WHEN jsonb_typeof(w->'weekdays')='array' THEN w->'weekdays' @> jsonb_build_array(extract(isodow FROM local_time)::integer) ELSE false END) THEN RETURN '{"allowed":false,"reason":"outside_working_window"}';END IF;
 IF requested>1 THEN
  previous_entry:=seq->'steps'->(requested-2);
  SELECT * INTO previous_activity FROM outreach_activities z WHERE z.org_id=v.org_id AND z.channel='whatsapp' AND z.lead_id=v.lead_id AND z.dispatch_metadata->>'version'='whatsapp_v1' AND z.dispatch_metadata->>'plan_id'=v.id::text AND z.dispatch_metadata->>'step'=(requested-1)::text;
  IF NOT FOUND OR previous_activity.status<>'provider_accepted' OR previous_activity.external_id IS NULL OR previous_activity.sent_at IS NULL
  OR previous_activity.dispatch_metadata->>'state' IS DISTINCT FROM 'provider_accepted' OR previous_activity.dispatch_metadata->>'delivery_status'='failed'
  OR previous_activity.dispatch_metadata->>'content_hash' IS DISTINCT FROM v.content_hash OR previous_activity.dispatch_metadata->'artifact' IS DISTINCT FROM previous_entry->'artifact'
  OR previous_activity.dispatch_metadata->>'recipient' IS DISTINCT FROM a->>'recipient' OR previous_activity.dispatch_metadata->>'connection_id' IS DISTINCT FROM a->>'connection_id'
  THEN RETURN '{"allowed":false,"reason":"previous_confirmed_send_required"}';END IF;
  IF (previous_activity.sent_at AT TIME ZONE 'UTC')+(entry->>'delay_days')::integer*interval '1 day'>now() THEN RETURN '{"allowed":false,"reason":"followup_not_due"}';END IF;
 END IF;
 RETURN jsonb_build_object('allowed',true,'artifact',a,'config',d,'lead_id',v.lead_id,'org_id',v.org_id,'plan_id',v.id,'step',requested,'execution_authorized',false);
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range OR invalid_parameter_value THEN RETURN '{"allowed":false,"reason":"malformed_whatsapp_configuration"}';
END $$;
CREATE OR REPLACE FUNCTION outreach_whatsapp_queue(p jsonb) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('execution_authorized',false,'items',coalesce(jsonb_agg(candidate ORDER BY created_at,id,step),'[]'::jsonb)) FROM (
  SELECT v.created_at,v.id,s.step,jsonb_build_object('org_id',v.org_id,'plan_id',v.id::text,'content_hash',v.content_hash,'step',s.step) AS candidate
  FROM (SELECT * FROM strategy_plans WHERE org_id=CASE WHEN p->>'org_id' ~ '^[1-9][0-9]{0,8}$' THEN (p->>'org_id')::integer ELSE 0 END AND body->'artifacts'->'whatsapp_dispatch'->>'version'='whatsapp_v1' ORDER BY created_at,id LIMIT 50) v
  CROSS JOIN LATERAL generate_series(1,CASE WHEN jsonb_typeof(v.body->'artifacts'->'whatsapp_sequence'->'steps')='array' THEN least(10,jsonb_array_length(v.body->'artifacts'->'whatsapp_sequence'->'steps')) ELSE 1 END) s(step)
  WHERE NOT EXISTS(SELECT 1 FROM outreach_activities a WHERE a.org_id=v.org_id AND a.channel='whatsapp' AND a.dispatch_metadata->>'plan_id'=v.id::text AND a.dispatch_metadata->>'step'=s.step::text)
  AND (outreach_whatsapp_gate(jsonb_build_object('org_id',v.org_id,'plan_id',v.id::text,'content_hash',v.content_hash,'step',s.step))->>'allowed'='true' OR (s.step>1 AND outreach_whatsapp_recheck_input(jsonb_build_object('org_id',v.org_id,'plan_id',v.id::text,'content_hash',v.content_hash,'step',s.step))->>'ready'='true'))
  ORDER BY v.created_at,v.id,s.step LIMIT 50
 ) candidates;
$$;
REVOKE ALL ON FUNCTION outreach_whatsapp_recheck_valid(jsonb,jsonb),outreach_whatsapp_recheck_input(jsonb),outreach_whatsapp_recheck_store(jsonb),outreach_whatsapp_gate_046(jsonb),outreach_whatsapp_queue(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_whatsapp_recheck_valid(jsonb,jsonb),outreach_whatsapp_recheck_input(jsonb),outreach_whatsapp_recheck_store(jsonb),outreach_whatsapp_gate_046(jsonb),outreach_whatsapp_queue(jsonb) TO n8n_user;
COMMIT;
