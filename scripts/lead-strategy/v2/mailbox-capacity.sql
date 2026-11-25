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
