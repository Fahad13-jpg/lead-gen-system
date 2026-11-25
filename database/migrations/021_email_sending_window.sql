-- Scheduling gate only. No activation, plan edits, policy seeding or quota increase.
BEGIN;
CREATE OR REPLACE FUNCTION outreach_email_window(cfg jsonb, checked_at timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE w jsonb; zone text; local_time timestamp; start_hour integer; end_hour integer; days jsonb;
BEGIN
 w:=cfg->'sending_window'; zone:=cfg->>'timezone';days:=w->'weekdays';
 IF checked_at IS NULL OR NOT isfinite(checked_at) OR zone IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=zone)
 OR jsonb_typeof(w) IS DISTINCT FROM 'object'
 OR coalesce(w->>'start_hour','') !~ '^([0-9]|1[0-9]|2[0-3])$'
 OR coalesce(w->>'end_hour','') !~ '^([1-9]|1[0-9]|2[0-4])$'
 OR (CASE WHEN jsonb_typeof(days)='array' THEN jsonb_array_length(days)=0 ELSE true END) THEN
 RETURN '{"allowed":false,"reason":"invalid_sending_window"}'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(days) d WHERE jsonb_typeof(d)<>'number' OR d::text !~ '^[1-7]$') THEN
 RETURN '{"allowed":false,"reason":"invalid_sending_window"}';END IF;
 start_hour:=(w->>'start_hour')::integer;end_hour:=(w->>'end_hour')::integer;
 IF start_hour>=end_hour THEN RETURN '{"allowed":false,"reason":"invalid_sending_window"}';END IF;
 local_time:=checked_at AT TIME ZONE zone;
 IF NOT days @> to_jsonb(extract(isodow FROM local_time)::integer)
 OR extract(hour FROM local_time)<start_hour OR extract(hour FROM local_time)>=end_hour THEN
 RETURN jsonb_build_object('allowed',false,'reason','outside_sending_window','timezone',zone); END IF;
 RETURN jsonb_build_object('allowed',true,'reason','within_sending_window','timezone',zone);
END $$;
CREATE OR REPLACE FUNCTION outreach_email_begin(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE ck jsonb; v strategy_plans%ROWTYPE; a outreach_activities%ROWTYPE;
 cfg jsonb; policy jsonb; cap integer; used bigint; day text;
BEGIN
 ck:=outreach_dispatch_recheck(p);
 IF ck->>'ready' IS DISTINCT FROM 'true' THEN RETURN ck; END IF;
 -- Every email begin for an organization takes this same lock, across campaigns.
 PERFORM 1 FROM organizations WHERE id=(ck->>'org_id')::integer FOR UPDATE;
 SELECT * INTO v FROM strategy_plans WHERE org_id=(ck->>'org_id')::integer AND id=(ck->>'plan_id')::bigint FOR UPDATE;
 ck:=outreach_dispatch_recheck(p);
 IF ck->>'ready' IS DISTINCT FROM 'true' THEN RETURN ck; END IF;
 -- No caller-supplied switch grants authority. Existing offline plans remain blocked.
 IF v.body->>'execution_authorized' IS DISTINCT FROM 'true' THEN
  RETURN '{"ready":false,"execution_authorized":false,"reason":"plan_transport_not_authorized"}'; END IF;
 IF coalesce(v.body->'artifacts'->'email_draft'->>'subject','')=''
 OR coalesce(v.body->'artifacts'->'email_draft'->>'body','')=''
 OR v.body->'artifacts'->'email_draft'->>'subject' IS DISTINCT FROM p->>'subject'
 OR v.body->'artifacts'->'email_draft'->>'body' IS DISTINCT FROM p->>'body'
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
 OR cfg->'sequence'->0->>'channel' IS DISTINCT FROM 'email'
 OR cfg->'sequence'->0->>'delay_days' IS DISTINCT FROM '0' THEN
 RETURN '{"ready":false,"execution_authorized":false,"reason":"approved_schedule_required"}'; END IF;
 ck:=outreach_email_window(cfg,clock_timestamp());
 IF ck->>'allowed' IS DISTINCT FROM 'true' THEN
 RETURN ck||jsonb_build_object('ready',false,'execution_authorized',false); END IF;
 ck:=outreach_dispatch_recheck(p);
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
 UPDATE outreach_activities SET status='attempting',dispatch_metadata=dispatch_metadata||jsonb_build_object(
 'state','attempting','attempts',1,'quota_day',day,'started_at',clock_timestamp(),
 'credential_ref',policy->>'credential_ref','sender_email',policy->>'sender_email') WHERE id=a.id AND org_id=v.org_id;
 RETURN ck||jsonb_build_object('execution_authorized',true,'reason','one_attempt_committed','quota_day',day);
END $$;

REVOKE ALL ON FUNCTION outreach_email_window(jsonb,timestamptz),outreach_email_begin(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_email_window(jsonb,timestamptz),outreach_email_begin(jsonb) TO n8n_user;
COMMIT;
