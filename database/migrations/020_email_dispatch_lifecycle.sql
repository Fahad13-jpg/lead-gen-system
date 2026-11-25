-- Local/scratch validated before release. No activation, policy seeding or budget change.
BEGIN;
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

CREATE OR REPLACE FUNCTION outreach_email_finish(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE a outreach_activities%ROWTYPE; state text; ext text;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR coalesce(p->>'org_id','') !~ '^[1-9][0-9]{0,9}$'
 OR coalesce(p->>'plan_id','') !~ '^[1-9][0-9]{0,18}$' OR p->>'step' IS DISTINCT FROM '1'
 OR coalesce(p->>'lease','') !~ '^[a-f0-9]{32}$' OR coalesce(p->>'content_hash','') !~ '^[a-f0-9]{32}$' THEN
 RETURN '{"saved":false,"reason":"invalid_identity","retry_allowed":false}'; END IF;
 SELECT * INTO a FROM outreach_activities WHERE org_id=(p->>'org_id')::integer
 AND dispatch_metadata->>'plan_id'=p->>'plan_id' AND dispatch_metadata->>'step'='1'
 AND dispatch_metadata->>'lease'=p->>'lease' AND dispatch_metadata->>'content_hash'=p->>'content_hash' FOR UPDATE;
 IF NOT FOUND THEN RETURN '{"saved":false,"reason":"identity_not_found","retry_allowed":false}'; END IF;
 state:='ambiguous'; ext:=NULL;
 IF p->>'outcome'='provider_accepted' AND coalesce(p->>'external_id','') ~ '^[a-fA-F0-9]{8,64}$' THEN
 state:='provider_accepted'; ext:=p->>'external_id'; END IF;
 IF a.dispatch_metadata->>'state'=state AND a.external_id IS NOT DISTINCT FROM ext THEN
 RETURN jsonb_build_object('saved',true,'idempotent',true,'state',state,'retry_allowed',false); END IF;
 IF a.dispatch_metadata->>'state' IS DISTINCT FROM 'attempting' THEN
 RETURN '{"saved":false,"reason":"reconciliation_required","retry_allowed":false}'; END IF;
 -- Record outcomes even after lease expiry/revocation: this is a historical receipt,
 -- not fresh permission. Never reset quota or recycle ambiguous attempts.
 UPDATE outreach_activities SET status=state,external_id=ext,
 sent_at=CASE WHEN state='provider_accepted' THEN clock_timestamp() AT TIME ZONE 'UTC' ELSE NULL END,
 dispatch_metadata=dispatch_metadata||jsonb_build_object('state',state,'finished_at',clock_timestamp(),'delivered',false)
 WHERE id=a.id AND org_id=a.org_id;
 RETURN jsonb_build_object('saved',true,'state',state,'delivered',false,'retry_allowed',false);
EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN
 RETURN '{"saved":false,"reason":"invalid_identity","retry_allowed":false}';
END $$;
REVOKE ALL ON FUNCTION outreach_email_begin(jsonb),outreach_email_finish(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_email_begin(jsonb),outreach_email_finish(jsonb) TO n8n_user;
COMMIT;
