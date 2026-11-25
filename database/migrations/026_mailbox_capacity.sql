-- Local candidate. Preserves existing approval, lease and org quota checks.
BEGIN;
-- Atomic only when called in the same transaction as the attempt write.
CREATE OR REPLACE FUNCTION outreach_mailbox_capacity(p_org integer, policy jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE mailbox text; cap integer; spacing integer; used bigint; latest timestamptz; oldest timestamptz;
 checked_at timestamptz; record_time timestamptz; row_data record; other_policy jsonb;
BEGIN
 mailbox:=lower(trim(policy->>'sender_email'));
 IF p_org IS NULL OR p_org<=0 OR coalesce(mailbox,'') !~ '^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+\.[^[:space:]@,;<>]+$'
 OR policy->>'enabled' IS DISTINCT FROM 'true' OR nullif(policy->>'credential_ref','') IS NULL
 OR coalesce(policy->>'mailbox_rolling_limit','') !~ '^[1-9][0-9]{0,3}$'
 OR coalesce(policy->>'min_interval_seconds','') !~ '^[1-9][0-9]{0,4}$' THEN
 RETURN '{"allowed":false,"reason":"mailbox_policy_required"}'; END IF;
 cap:=(policy->>'mailbox_rolling_limit')::integer;
 spacing:=(policy->>'min_interval_seconds')::integer;
 -- Same actual mailbox shares a lock, including aliases of credential references.
 PERFORM pg_advisory_xact_lock(72619,hashtext(mailbox));
 checked_at:=clock_timestamp();
 -- A campaign cannot increase a mailbox's limits by supplying a more permissive policy.
 FOR other_policy IN SELECT cv.config->'email_dispatch'
 FROM strategy_campaigns c JOIN strategy_campaign_versions cv
 ON cv.org_id=c.org_id AND cv.campaign_id=c.id AND cv.version=c.version
 WHERE lower(trim(cv.config->'email_dispatch'->>'sender_email'))=mailbox
 AND cv.config->'email_dispatch'->>'enabled'='true' LOOP
  IF coalesce(other_policy->>'mailbox_rolling_limit','') !~ '^[1-9][0-9]{0,3}$'
  OR coalesce(other_policy->>'min_interval_seconds','') !~ '^[1-9][0-9]{0,4}$' THEN
   RETURN '{"allowed":false,"reason":"mailbox_policy_inconsistent"}'; END IF;
  cap:=least(cap,(other_policy->>'mailbox_rolling_limit')::integer);
  spacing:=greatest(spacing,(other_policy->>'min_interval_seconds')::integer);
 END LOOP;
 used:=0;
 FOR row_data IN SELECT sent_at,dispatch_metadata FROM outreach_activities
 WHERE channel='email' AND (
 lower(trim(dispatch_metadata->>'sender_email'))=mailbox
 OR (org_id=p_org AND nullif(dispatch_metadata->>'sender_email','') IS NULL)) LOOP
  -- Uncertain attempts consume capacity; receipts never reset the attempt time.
  IF nullif(row_data.dispatch_metadata->>'started_at','') IS NOT NULL THEN
   record_time:=(row_data.dispatch_metadata->>'started_at')::timestamptz;
  ELSIF row_data.sent_at IS NOT NULL THEN record_time:=row_data.sent_at AT TIME ZONE 'UTC';
  ELSIF row_data.dispatch_metadata->>'state' IN ('attempting','ambiguous','provider_accepted') THEN
   RETURN '{"allowed":false,"reason":"mailbox_history_requires_review"}';
  ELSE CONTINUE; END IF;
  IF NOT isfinite(record_time) OR record_time>checked_at THEN RETURN '{"allowed":false,"reason":"mailbox_history_requires_review"}'; END IF;
  latest:=greatest(latest,record_time);
  IF record_time>checked_at-interval '24 hours' THEN
   used:=used+1;oldest:=least(oldest,record_time);
  END IF;
 END LOOP;
 IF used>=cap THEN RETURN jsonb_build_object('allowed',false,'reason','mailbox_rolling_limit_reached','used',used,'limit',cap,'next_eligible_at',oldest+interval '24 hours'); END IF;
 IF latest IS NOT NULL AND latest+make_interval(secs=>spacing)>checked_at THEN
  RETURN jsonb_build_object('allowed',false,'reason','mailbox_spacing_required','next_eligible_at',latest+make_interval(secs=>spacing)); END IF;
 RETURN jsonb_build_object('allowed',true,'used',used,'limit',cap,'remaining',cap-used,'checked_at',checked_at);
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN
 RETURN '{"allowed":false,"reason":"mailbox_history_requires_review"}';
END $$;

CREATE OR REPLACE FUNCTION outreach_email_step_begin(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE ck jsonb; v strategy_plans%ROWTYPE; a outreach_activities%ROWTYPE;
 mailbox_guard jsonb; cfg jsonb; policy jsonb; message jsonb; cap integer; used bigint; day text;
BEGIN
 ck:=outreach_email_step_recheck(p);
 IF ck->>'ready' IS DISTINCT FROM 'true' THEN RETURN ck; END IF;
 -- Every email begin for an organization takes this same lock, across campaigns.
 PERFORM 1 FROM organizations WHERE id=(ck->>'org_id')::integer FOR UPDATE;
 SELECT * INTO v FROM strategy_plans WHERE org_id=(ck->>'org_id')::integer AND id=(ck->>'plan_id')::bigint FOR UPDATE;
 ck:=outreach_email_step_recheck(p);
 IF ck->>'ready' IS DISTINCT FROM 'true' THEN RETURN ck; END IF;
 -- No caller-supplied switch grants authority. Existing offline plans remain blocked.
 IF v.body->>'execution_authorized' IS DISTINCT FROM 'true' THEN
  RETURN '{"ready":false,"execution_authorized":false,"reason":"plan_transport_not_authorized"}'; END IF;
 IF p->>'step'='1' THEN message:=v.body->'artifacts'->'email_draft';
 ELSE SELECT item INTO message FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v.body->'artifacts'->'followup_drafts')='array' THEN v.body->'artifacts'->'followup_drafts' ELSE '[]'::jsonb END) item WHERE item->>'step'=p->>'step' LIMIT 1; END IF;
 IF coalesce(message->>'subject','')=''
 OR coalesce(message->>'body','')=''
 OR message->>'subject' IS DISTINCT FROM p->>'subject'
 OR message->>'body' IS DISTINCT FROM p->>'body'
 OR NOT EXISTS(SELECT 1 FROM cleaned_leads WHERE org_id=v.org_id AND id=v.lead_id AND email=p->>'to_email') THEN
  RETURN '{"ready":false,"execution_authorized":false,"reason":"approved_message_or_recipient_mismatch"}'; END IF;
 SELECT cv.config INTO cfg FROM strategy_campaigns c JOIN strategy_campaign_versions cv
 ON cv.org_id=c.org_id AND cv.campaign_id=c.id AND cv.version=c.version
 WHERE c.org_id=v.org_id AND c.id=v.campaign_id AND c.version=v.campaign_version;
 policy:=cfg->'email_dispatch';
 IF policy->>'enabled' IS DISTINCT FROM 'true'
 OR coalesce(policy->>'credential_ref','')='' OR policy->>'credential_ref' IS DISTINCT FROM p->>'credential_ref'
 OR coalesce(policy->>'daily_limit','') !~ '^[1-9][0-9]{0,3}$'
 OR policy->>'sender_email' IS DISTINCT FROM p->>'sender_email'
 OR coalesce(policy->>'sender_email','') !~ '^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+\.[^[:space:]@,;<>]+$' THEN
  RETURN '{"ready":false,"execution_authorized":false,"reason":"sender_policy_missing_or_mismatched"}'; END IF;
 -- Require the approved plan's timing to match its current campaign version.
 IF v.body->'artifacts'->'schedule'->>'timezone' IS DISTINCT FROM cfg->>'timezone'
 OR v.body->'artifacts'->'schedule'->'sending_window' IS DISTINCT FROM cfg->'sending_window'
 OR v.body->'artifacts'->'schedule'->'sequence' IS DISTINCT FROM cfg->'sequence'
 OR cfg->'sequence'->((p->>'step')::integer-1)->>'channel' IS DISTINCT FROM 'email'
 OR (p->>'step'='1' AND cfg->'sequence'->0->>'delay_days' IS DISTINCT FROM '0') THEN
 RETURN '{"ready":false,"execution_authorized":false,"reason":"approved_schedule_required"}'; END IF;
 ck:=outreach_email_window(cfg,clock_timestamp());
 IF ck->>'allowed' IS DISTINCT FROM 'true' THEN
 RETURN ck||jsonb_build_object('ready',false,'execution_authorized',false); END IF;
 ck:=outreach_email_step_recheck(p);
 IF ck->>'ready' IS DISTINCT FROM 'true' THEN RETURN ck;END IF;
 -- Conservative org cap: smallest enabled current campaign limit, not a new allowance per campaign.
 SELECT min(CASE WHEN coalesce(cv.config->'email_dispatch'->>'daily_limit','') ~ '^[1-9][0-9]{0,3}$'
 THEN (cv.config->'email_dispatch'->>'daily_limit')::integer ELSE NULL END) INTO cap
 FROM strategy_campaigns c JOIN strategy_campaign_versions cv ON cv.org_id=c.org_id AND cv.campaign_id=c.id AND cv.version=c.version
 WHERE c.org_id=v.org_id AND cv.config->'email_dispatch'->>'enabled'='true'
 AND CASE WHEN coalesce(cv.config->'email_dispatch'->>'daily_limit','') ~ '^[1-9][0-9]{0,3}$' THEN true ELSE false END;
 IF cap IS NULL THEN RETURN '{"ready":false,"execution_authorized":false,"reason":"quota_not_configured"}'; END IF;
 day:=to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD');
 SELECT count(*) INTO used FROM outreach_activities WHERE org_id=v.org_id AND channel='email'
 AND (dispatch_metadata->>'quota_day'=day OR (sent_at IS NOT NULL AND sent_at::date=(clock_timestamp() AT TIME ZONE 'UTC')::date));
 IF used>=cap THEN RETURN jsonb_build_object('ready',false,'execution_authorized',false,'reason','daily_quota_reached','used',used,'limit',cap); END IF;
 SELECT * INTO a FROM outreach_activities WHERE id=(ck->>'activity_id')::integer AND org_id=v.org_id FOR UPDATE;
 IF a.dispatch_metadata->>'state' IS DISTINCT FROM 'reserved'
 OR (a.dispatch_metadata->>'lease_until')::timestamptz<=clock_timestamp() THEN
  RETURN '{"ready":false,"execution_authorized":false,"reason":"dispatch_requires_reconciliation"}'; END IF;
 mailbox_guard:=outreach_mailbox_capacity(v.org_id,policy);
 IF mailbox_guard->>'allowed' IS DISTINCT FROM 'true' THEN
 RETURN mailbox_guard||'{"ready":false,"execution_authorized":false}'::jsonb; END IF;
 UPDATE outreach_activities SET status='attempting',dispatch_metadata=dispatch_metadata||jsonb_build_object(
 'state','attempting','attempts',1,'quota_day',day,'started_at',clock_timestamp(),
 'credential_ref',policy->>'credential_ref','sender_email',policy->>'sender_email') WHERE id=a.id AND org_id=v.org_id;
 RETURN ck||jsonb_build_object('execution_authorized',true,'reason','one_attempt_committed','quota_day',day);
END $$;
REVOKE ALL ON FUNCTION outreach_mailbox_capacity(integer,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_mailbox_capacity(integer,jsonb) TO n8n_user;
COMMIT;
