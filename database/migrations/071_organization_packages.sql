-- Feature access only. No prices, credits, provider activation or subscription-tier rewrites.
BEGIN;
CREATE TABLE organization_packages(
 org_id integer PRIMARY KEY REFERENCES organizations(id),
 package text NOT NULL CHECK(package IN ('free','plus')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 activation_after timestamptz NOT NULL DEFAULT clock_timestamp(),
 changed_by text NOT NULL CHECK(length(changed_by) BETWEEN 1 AND 150),
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 500));
CREATE TABLE organization_package_events(
 id bigserial PRIMARY KEY,org_id integer NOT NULL REFERENCES organizations(id),
 previous_package text NOT NULL,new_package text NOT NULL,revision integer NOT NULL,
 changed_at timestamptz NOT NULL,changed_by text NOT NULL,reason text NOT NULL);
REVOKE ALL ON organization_packages,organization_package_events FROM PUBLIC;

CREATE FUNCTION organization_feature_allowed(o integer,f text) RETURNS boolean
LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM organizations WHERE id=o AND status='active') AND
 (f IN ('email','linkedin_manual','whatsapp_manual','messenger_manual') OR
 (f IN ('sms','calling','whatsapp_automation') AND EXISTS(SELECT 1 FROM organization_packages WHERE org_id=o AND package='plus')));
$$;
CREATE FUNCTION organization_package_snapshot(o integer) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('name',coalesce(p.package,'free'),'revision',coalesce(p.revision,0),
 'provider_credits_included',false,'pricing_active',false,
 'features',jsonb_build_object('email',organization_feature_allowed(o,'email'),
 'linkedin_manual',organization_feature_allowed(o,'linkedin_manual'),'whatsapp_manual',organization_feature_allowed(o,'whatsapp_manual'),
 'messenger_manual',organization_feature_allowed(o,'messenger_manual'),'sms',organization_feature_allowed(o,'sms'),
 'calling',organization_feature_allowed(o,'calling'),'whatsapp_automation',organization_feature_allowed(o,'whatsapp_automation')))
 FROM organizations x LEFT JOIN organization_packages p ON p.org_id=x.id WHERE x.id=o;
$$;
CREATE FUNCTION organization_require_feature(o integer,f text,pid bigint DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE threshold timestamptz; latest record;
BEGIN
 IF NOT organization_feature_allowed(o,f) THEN RAISE EXCEPTION 'PLUS_REQUIRED';END IF;
 IF pid IS NOT NULL AND f IN ('sms','calling','whatsapp_automation') THEN
  SELECT activation_after INTO threshold FROM organization_packages WHERE org_id=o AND package='plus';
  SELECT a.action,a.created_at,a.content_hash,p.content_hash AS plan_hash INTO latest
   FROM strategy_approvals a JOIN strategy_plans p ON p.org_id=a.org_id AND p.id=a.plan_id
   WHERE a.org_id=o AND a.plan_id=pid ORDER BY a.id DESC LIMIT 1;
  IF latest IS NULL OR latest.action<>'approve' OR latest.content_hash IS DISTINCT FROM latest.plan_hash
   OR latest.created_at<threshold THEN RAISE EXCEPTION 'PLUS_APPROVAL_REQUIRED';END IF;
 END IF;
END $$;
CREATE FUNCTION organization_channels_allowed(o integer,c jsonb) RETURNS boolean
LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT organization_feature_allowed(o,'email') AND NOT EXISTS(
 SELECT 1 FROM (SELECT value AS ch FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(c->'channels')='array' THEN c->'channels' ELSE '[]'::jsonb END)
 UNION SELECT value->>'channel' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c->'sequence')='array' THEN c->'sequence' ELSE '[]'::jsonb END)) selected
 WHERE (ch='sms' AND NOT organization_feature_allowed(o,'sms')) OR (ch='call' AND NOT organization_feature_allowed(o,'calling')));
$$;
CREATE FUNCTION organization_require_channels(o integer,c jsonb) RETURNS void
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE ch text;
BEGIN
 FOR ch IN SELECT value FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(c->'channels')='array' THEN c->'channels' ELSE '[]'::jsonb END) UNION SELECT value->>'channel' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c->'sequence')='array' THEN c->'sequence' ELSE '[]'::jsonb END) LOOP
  IF ch='sms' THEN PERFORM organization_require_feature(o,'sms');
  ELSIF ch='call' THEN PERFORM organization_require_feature(o,'calling');END IF;
 END LOOP;
END $$;
CREATE FUNCTION organization_package_version_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE previous jsonb;
BEGIN
 -- A downgraded workspace can still disconnect or pause an existing calling binding.
 SELECT config INTO previous FROM strategy_campaign_versions WHERE org_id=NEW.org_id AND campaign_id=NEW.campaign_id AND version<NEW.version ORDER BY version DESC LIMIT 1;
 IF previous IS NOT NULL AND NEW.config-'call_dispatch'=previous-'call_dispatch'
  AND NEW.config#>>'{call_dispatch,enabled}'='false' AND NEW.config#>>'{call_dispatch,release,enabled}'='false' THEN RETURN NEW;END IF;
 PERFORM organization_require_channels(NEW.org_id,NEW.config);RETURN NEW;END $$;
CREATE TRIGGER package_campaign_channels BEFORE INSERT OR UPDATE ON strategy_campaign_versions
 FOR EACH ROW EXECUTE FUNCTION organization_package_version_guard();
CREATE FUNCTION organization_package_job_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE c jsonb; j strategy_jobs%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='strategy_ai_requests' THEN
  SELECT * INTO j FROM strategy_jobs WHERE org_id=NEW.org_id AND id=NEW.job_id;
  SELECT config INTO c FROM strategy_campaign_versions WHERE org_id=j.org_id AND campaign_id=j.campaign_id AND version=j.campaign_version;
 ELSE
  SELECT config INTO c FROM strategy_campaign_versions WHERE org_id=NEW.org_id AND campaign_id=NEW.campaign_id AND version=NEW.campaign_version;
 END IF;
 PERFORM organization_require_channels(NEW.org_id,c);RETURN NEW;
END $$;
CREATE TRIGGER package_strategy_enqueue BEFORE INSERT ON strategy_jobs FOR EACH ROW EXECUTE FUNCTION organization_package_job_guard();
CREATE TRIGGER package_strategy_claim BEFORE UPDATE OF status ON strategy_jobs FOR EACH ROW WHEN (NEW.status='processing') EXECUTE FUNCTION organization_package_job_guard();
CREATE TRIGGER package_ai_reservation BEFORE INSERT ON strategy_ai_requests FOR EACH ROW EXECUTE FUNCTION organization_package_job_guard();
CREATE FUNCTION organization_package_dispatch_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE f text;pid bigint;

BEGIN
 IF TG_TABLE_NAME='sms_dispatches' THEN
  IF TG_OP='UPDATE' AND (NEW.state NOT IN ('queued','reserved','submitting') OR NEW.state=OLD.state) THEN RETURN NEW;END IF;
  f:='sms';pid:=NEW.plan_id;
 ELSE
  IF TG_OP='UPDATE' AND NEW.channel=OLD.channel AND NEW.dispatch_metadata->>'state' IS NOT DISTINCT FROM OLD.dispatch_metadata->>'state' THEN RETURN NEW;END IF;
  IF NEW.channel='call' AND (TG_OP='INSERT' OR NEW.dispatch_metadata->>'state'='dispatching') THEN f:='calling';
  ELSIF NEW.channel='sms' AND (TG_OP='INSERT' OR NEW.dispatch_metadata->>'state'='submitting') THEN f:='sms';
  ELSIF NEW.channel='whatsapp' AND NEW.dispatch_metadata->>'version'='whatsapp_v1'
   AND (TG_OP='INSERT' OR NEW.dispatch_metadata->>'state'='attempting') THEN f:='whatsapp_automation';
  ELSE RETURN NEW;END IF;
  IF coalesce(NEW.dispatch_metadata->>'plan_id','') !~ '^[1-9][0-9]{0,17}$' THEN RAISE EXCEPTION 'PLUS_APPROVAL_REQUIRED';END IF;
  pid:=(NEW.dispatch_metadata->>'plan_id')::bigint;
 END IF;
 PERFORM organization_require_feature(NEW.org_id,f,pid);RETURN NEW;
END $$;
CREATE TRIGGER package_outreach_admission BEFORE INSERT OR UPDATE OF channel,dispatch_metadata ON outreach_activities FOR EACH ROW EXECUTE FUNCTION organization_package_dispatch_guard();
CREATE TRIGGER package_sms_admission BEFORE INSERT OR UPDATE OF state ON sms_dispatches FOR EACH ROW EXECUTE FUNCTION organization_package_dispatch_guard();
CREATE FUNCTION organization_package_setup_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_TABLE_NAME='sms_connections' THEN
  IF TG_OP='INSERT' OR NEW.state='ready' THEN PERFORM organization_require_feature(NEW.org_id,'sms');END IF;
 ELSIF TG_TABLE_NAME='calling_accounts' THEN
  IF TG_OP='INSERT' THEN PERFORM organization_require_feature(NEW.org_id,'calling');END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER package_sms_setup BEFORE INSERT OR UPDATE OF state ON sms_connections FOR EACH ROW EXECUTE FUNCTION organization_package_setup_guard();
CREATE TRIGGER package_calling_setup BEFORE INSERT ON calling_accounts FOR EACH ROW EXECUTE FUNCTION organization_package_setup_guard();
CREATE FUNCTION organization_package_change() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.org_id<>OLD.org_id THEN RAISE EXCEPTION 'PACKAGE_ORGANIZATION_IMMUTABLE';END IF;
  IF NEW.package=OLD.package THEN RAISE EXCEPTION 'PACKAGE_UNCHANGED';END IF;
  NEW.revision:=OLD.revision+1;
 ELSE NEW.revision:=1;END IF;
 NEW.changed_at:=clock_timestamp();NEW.activation_after:=NEW.changed_at;
 INSERT INTO organization_package_events(org_id,previous_package,new_package,revision,changed_at,changed_by,reason)
 VALUES(NEW.org_id,CASE WHEN TG_OP='UPDATE' THEN OLD.package ELSE 'free' END,NEW.package,NEW.revision,NEW.changed_at,NEW.changed_by,NEW.reason);
 IF NEW.package='free' THEN
  UPDATE sms_connections SET state='paused',version=version+1,updated_at=now() WHERE org_id=NEW.org_id;
  WITH cancelled AS (UPDATE sms_dispatches SET state='cancelled' WHERE org_id=NEW.org_id AND state IN ('queued','reserved') RETURNING activity_id)
   UPDATE outreach_activities SET status='cancelled',dispatch_metadata=dispatch_metadata||'{"state":"cancelled","package_stop":true}'::jsonb WHERE org_id=NEW.org_id AND id IN(SELECT activity_id FROM cancelled);
  UPDATE strategy_jobs j SET status='superseded',error='PLUS_REQUIRED',finished_at=now() FROM strategy_campaign_versions v
   WHERE j.org_id=NEW.org_id AND j.status='pending' AND v.org_id=j.org_id AND v.campaign_id=j.campaign_id AND v.version=j.campaign_version
    AND (v.config->'channels' ?| ARRAY['sms','call']);
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER package_assignment BEFORE INSERT OR UPDATE ON organization_packages FOR EACH ROW EXECUTE FUNCTION organization_package_change();
REVOKE ALL ON FUNCTION organization_feature_allowed(integer,text),organization_package_snapshot(integer),organization_require_feature(integer,text,bigint),organization_require_channels(integer,jsonb),organization_channels_allowed(integer,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION organization_feature_allowed(integer,text),organization_package_snapshot(integer),organization_require_feature(integer,text,bigint),organization_require_channels(integer,jsonb),organization_channels_allowed(integer,jsonb) TO n8n_user;
COMMIT;
