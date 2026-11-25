-- Local campaign renewal support. Requires 056; no activation or sending on install.
-- No tables/webhooks; leases and exact slices use existing operational JSON.
BEGIN;
CREATE OR REPLACE FUNCTION email_campaign_automation_control(o integer,actor text,campaign bigint,ver integer,expected_revision integer,enabled boolean) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE cfg jsonb;r jsonb;
BEGIN
 PERFORM 1 FROM organizations WHERE id=o AND status='active' FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM org_sender_memberships WHERE org_id=o AND subject=actor AND active AND role IN('owner','admin')) THEN RETURN '{"error":"MEMBERSHIP_REQUIRED"}';END IF;
 IF NOT EXISTS(SELECT 1 FROM strategy_campaigns WHERE org_id=o AND id=campaign AND version=ver) THEN RETURN '{"error":"CAMPAIGN_CHANGED"}';END IF;
 SELECT config INTO cfg FROM strategy_campaign_versions WHERE org_id=o AND campaign_id=campaign AND version=ver FOR UPDATE;r:=cfg->'_email_execution';
 IF r IS NULL OR r->>'revision' IS DISTINCT FROM expected_revision::text OR enabled IS NULL THEN RETURN '{"error":"AUTHORITY_CHANGED"}';END IF;
 IF enabled AND (r->>'status' IS DISTINCT FROM 'approved' OR md5((r->'scope')::text) IS DISTINCT FROM r->>'scope_hash' OR coalesce((r#>>'{scope,end_at}')::timestamptz,'-infinity'::timestamptz)<=now() OR r#>>'{scope,campaign_version}' IS DISTINCT FROM ver::text OR r#>>'{scope,config_hash}' IS DISTINCT FROM md5((cfg-'_email_execution')::text)) THEN RETURN '{"error":"AUTHORITY_NOT_CURRENT"}';END IF;
 r:=(r-'renewal_lease')||jsonb_build_object('automatic_enabled',enabled,'revision',expected_revision+1,'slices','{}'::jsonb);
 UPDATE strategy_campaign_versions SET config=jsonb_set(config,'{_email_execution}',r,true) WHERE org_id=o AND campaign_id=campaign AND version=ver;
 RETURN jsonb_build_object('changed',true,'revision',expected_revision+1,'automatic_enabled',enabled,'execution_authorized',false);
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN RETURN '{"error":"INVALID_AUTHORITY"}';END $$;

CREATE OR REPLACE FUNCTION email_campaign_renewal_claim(o integer,campaign bigint,worker text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE ver integer;cfg jsonb;r jsonb;l jsonb;
BEGIN
 IF nullif(worker,'') IS NULL OR length(worker)>100 THEN RETURN '{"claimed":false,"reason":"invalid_worker"}';END IF;
 PERFORM 1 FROM organizations WHERE id=o AND status='active' FOR UPDATE;IF NOT FOUND THEN RETURN '{"claimed":false,"reason":"organization_unavailable"}';END IF;
 SELECT version INTO ver FROM strategy_campaigns WHERE org_id=o AND id=campaign;IF NOT FOUND THEN RETURN '{"claimed":false,"reason":"campaign_missing"}';END IF;
 SELECT config INTO cfg FROM strategy_campaign_versions WHERE org_id=o AND campaign_id=campaign AND version=ver FOR UPDATE;r:=cfg->'_email_execution';
 IF r->>'status' IS DISTINCT FROM 'approved' OR r->'automatic_enabled' IS DISTINCT FROM 'true'::jsonb OR md5((r->'scope')::text) IS DISTINCT FROM r->>'scope_hash' OR coalesce((r#>>'{scope,end_at}')::timestamptz,'-infinity'::timestamptz)<=clock_timestamp() OR r#>>'{scope,campaign_version}' IS DISTINCT FROM ver::text OR r#>>'{scope,config_hash}' IS DISTINCT FROM md5((cfg-'_email_execution')::text) THEN RETURN '{"claimed":false,"reason":"authority_not_current"}';END IF;
 IF NOT EXISTS(SELECT 1 FROM org_sender_memberships WHERE org_id=o AND subject=r->>'actor_subject' AND active AND role IN('owner','admin')) THEN RETURN '{"claimed":false,"reason":"approval_actor_inactive"}';END IF;
 IF coalesce((r#>>'{renewal_lease,until}')::timestamptz,'-infinity'::timestamptz)>clock_timestamp() THEN RETURN '{"claimed":false,"reason":"renewal_busy"}';END IF;
 l:=jsonb_build_object('token',md5(random()::text||clock_timestamp()::text||worker),'until',clock_timestamp()+interval '5 minutes','worker',worker);
 r:=r||jsonb_build_object('renewal_lease',l);UPDATE strategy_campaign_versions SET config=jsonb_set(config,'{_email_execution}',r,true) WHERE org_id=o AND campaign_id=campaign AND version=ver;
 RETURN jsonb_build_object('claimed',true,'org_id',o,'campaign_id',campaign,'campaign_version',ver,'lease',l->'token','lease_until',l->'until','revision',r->'revision','scope_hash',r->'scope_hash','actor_subject',r->'actor_subject');
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN RETURN '{"claimed":false,"reason":"invalid_authority"}';END $$;

CREATE OR REPLACE FUNCTION email_campaign_slice_publish(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE o integer;campaign bigint;ver integer;cfg jsonb;r jsonb;v strategy_plans%ROWTYPE;a jsonb;item jsonb;slice jsonb;key text;n integer;expires timestamptz;checked jsonb;
BEGIN
 o:=(p->>'org_id')::integer;campaign:=(p->>'campaign_id')::bigint;ver:=(p->>'campaign_version')::integer;n:=(p->>'target_step')::integer;
 IF n IS NULL OR n NOT BETWEEN 1 AND 10 OR p->>'content_hash' IS NULL OR p->>'expires_at' IS NULL THEN RETURN '{"issued":false,"reason":"invalid_step"}';END IF;
 PERFORM 1 FROM organizations WHERE id=o AND status='active' FOR UPDATE;IF NOT FOUND THEN RETURN '{"issued":false,"reason":"organization_unavailable"}';END IF;
 IF NOT EXISTS(SELECT 1 FROM strategy_campaigns WHERE org_id=o AND id=campaign AND version=ver) THEN RETURN '{"issued":false,"reason":"campaign_changed"}';END IF;
 SELECT config INTO cfg FROM strategy_campaign_versions WHERE org_id=o AND campaign_id=campaign AND version=ver FOR UPDATE;r:=cfg->'_email_execution';
 IF r->>'status' IS DISTINCT FROM 'approved' OR r->'automatic_enabled' IS DISTINCT FROM 'true'::jsonb OR r->>'revision' IS DISTINCT FROM p->>'revision' OR r->>'scope_hash' IS DISTINCT FROM p->>'scope_hash' OR md5((r->'scope')::text) IS DISTINCT FROM r->>'scope_hash' OR r#>>'{scope,config_hash}' IS DISTINCT FROM md5((cfg-'_email_execution')::text) OR r#>>'{renewal_lease,token}' IS DISTINCT FROM p->>'lease' OR coalesce((r#>>'{renewal_lease,until}')::timestamptz,'-infinity'::timestamptz)<=clock_timestamp() THEN RETURN '{"issued":false,"reason":"stale_renewal_lease"}';END IF;
 IF NOT EXISTS(SELECT 1 FROM org_sender_memberships WHERE org_id=o AND subject=r->>'actor_subject' AND active AND role IN('owner','admin')) THEN RETURN '{"issued":false,"reason":"approval_actor_inactive"}';END IF;
 SELECT * INTO v FROM strategy_plans WHERE org_id=o AND id=(p->>'plan_id')::bigint AND campaign_id=campaign AND campaign_version=ver FOR SHARE;
 IF NOT FOUND OR v.content_hash IS DISTINCT FROM p->>'content_hash' THEN RETURN '{"issued":false,"reason":"plan_changed"}';END IF;
 SELECT value INTO item FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r#>'{scope,plans}')='array' THEN r#>'{scope,plans}' ELSE '[]'::jsonb END) WHERE value->>'plan_id'=v.id::text;
 IF item->>'content_hash' IS DISTINCT FROM v.content_hash OR item->>'recipient' IS DISTINCT FROM p->>'recipient' OR cfg->'sequence'->(n-1)->>'channel' IS DISTINCT FROM 'email' THEN RETURN '{"issued":false,"reason":"outside_approved_scope"}';END IF;
 expires:=least((p->>'expires_at')::timestamptz,clock_timestamp()+interval '24 hours',(r#>>'{scope,end_at}')::timestamptz,v.expires_at);
 IF expires IS NULL OR expires<=clock_timestamp() THEN RETURN '{"issued":false,"reason":"scope_expired"}';END IF;
 checked:=outreach_email_step_check(jsonb_build_object('org_id',o,'plan_id',v.id,'content_hash',v.content_hash,'step',n));IF checked->>'ready' IS DISTINCT FROM 'true' THEN RETURN checked||'{"issued":false}';END IF;
 key:=v.id::text||':'||n::text;slice:=r->'slices'->key;
 IF slice#>>'{authority,revision}'=r->>'revision' AND coalesce((slice->>'expires_at')::timestamptz,'-infinity'::timestamptz)>clock_timestamp() THEN RETURN jsonb_build_object('issued',false,'existing',true,'slice',slice);END IF;
 a:=jsonb_build_object('campaign_id',campaign,'campaign_version',ver,'revision',(r->>'revision')::integer,'scope_hash',r->>'scope_hash','slice_id',md5(random()::text||key||clock_timestamp()::text));
 slice:=jsonb_build_object('format','email_campaign_slice_v1','binding',jsonb_build_object('org_id',o,'email',cfg#>>'{email_dispatch,sender_email}','credential_ref',cfg#>>'{email_dispatch,credential_ref}'),'authority',a,'plan',jsonb_build_object('plan_id',v.id,'content_hash',v.content_hash,'recipient',item->>'recipient'),'target_step',n,'expires_at',expires);
 r:=jsonb_set(r,'{slices}',coalesce(r->'slices','{}'::jsonb)||jsonb_build_object(key,slice),true);UPDATE strategy_campaign_versions SET config=jsonb_set(config,'{_email_execution}',r,true) WHERE org_id=o AND campaign_id=campaign AND version=ver;
 RETURN jsonb_build_object('issued',true,'slice',slice);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_datetime_format OR datetime_field_overflow THEN RETURN '{"issued":false,"reason":"invalid_request"}';END $$;

CREATE OR REPLACE FUNCTION email_campaign_renewal_finish(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE cfg jsonb;r jsonb;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR coalesce(p->>'org_id','') !~ '^[1-9][0-9]{0,9}$' OR coalesce(p->>'campaign_id','') !~ '^[1-9][0-9]{0,18}$' OR coalesce(p->>'campaign_version','') !~ '^[1-9][0-9]{0,8}$' OR coalesce(p->>'revision','') !~ '^[1-9][0-9]{0,8}$' OR coalesce(p->>'lease','') !~ '^[a-f0-9]{32}$' THEN RETURN '{"finished":false,"reason":"invalid_request"}';END IF;
 PERFORM 1 FROM organizations WHERE id=(p->>'org_id')::integer FOR UPDATE;
 SELECT config INTO cfg FROM strategy_campaign_versions WHERE org_id=(p->>'org_id')::integer AND campaign_id=(p->>'campaign_id')::bigint AND version=(p->>'campaign_version')::integer FOR UPDATE;r:=cfg->'_email_execution';
 IF NOT FOUND OR cfg IS NULL THEN RETURN '{"finished":false,"reason":"campaign_missing"}';END IF;
 IF r#>>'{renewal_lease,token}' IS DISTINCT FROM p->>'lease' OR r->>'revision' IS DISTINCT FROM p->>'revision' THEN RETURN '{"finished":false,"reason":"stale_renewal_lease"}';END IF;
 r:=(r-'renewal_lease')||jsonb_build_object('last_renewal',jsonb_build_object('at',clock_timestamp(),'state',left(p->>'state',60),'issued',p->'issued'));
 UPDATE strategy_campaign_versions SET config=jsonb_set(config,'{_email_execution}',r,true) WHERE org_id=(p->>'org_id')::integer AND campaign_id=(p->>'campaign_id')::bigint AND version=(p->>'campaign_version')::integer;
 RETURN '{"finished":true}';
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN '{"finished":false,"reason":"invalid_request"}';END $$;

CREATE OR REPLACE FUNCTION email_campaign_dispatch_gate(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v strategy_plans%ROWTYPE;cfg jsonb;r jsonb;s jsonb;a jsonb:=p->'authority';n integer;checked jsonb;
BEGIN
 SELECT * INTO v FROM strategy_plans WHERE org_id=(p->>'org_id')::integer AND id=(p->>'plan_id')::bigint;
 IF NOT FOUND THEN RETURN '{"allowed":false,"reason":"plan_missing"}';END IF;
 SELECT cv.config INTO cfg FROM strategy_campaigns c JOIN strategy_campaign_versions cv ON cv.org_id=c.org_id AND cv.campaign_id=c.id AND cv.version=c.version WHERE c.org_id=v.org_id AND c.id=v.campaign_id;
 IF NOT (cfg ? '_email_execution') THEN IF a IS NOT NULL THEN RETURN '{"allowed":false,"reason":"campaign_authority_missing"}';END IF;RETURN '{"allowed":true,"legacy":true}';END IF;
 PERFORM 1 FROM organizations WHERE id=v.org_id AND status='active' FOR UPDATE;IF NOT FOUND THEN RETURN '{"allowed":false,"reason":"organization_unavailable"}';END IF;
 SELECT cv.config INTO cfg FROM strategy_campaigns c JOIN strategy_campaign_versions cv ON cv.org_id=c.org_id AND cv.campaign_id=c.id AND cv.version=c.version WHERE c.org_id=v.org_id AND c.id=v.campaign_id AND c.version=v.campaign_version;
 r:=cfg->'_email_execution';n:=(p->>'step')::integer;
 IF cfg IS NULL OR r->>'status' IS DISTINCT FROM 'approved' OR r->'automatic_enabled' IS DISTINCT FROM 'true'::jsonb OR md5((r->'scope')::text) IS DISTINCT FROM r->>'scope_hash' OR r#>>'{scope,config_hash}' IS DISTINCT FROM md5((cfg-'_email_execution')::text) OR a->>'revision' IS DISTINCT FROM r->>'revision' OR a->>'scope_hash' IS DISTINCT FROM r->>'scope_hash' OR a->>'campaign_id' IS DISTINCT FROM v.campaign_id::text OR a->>'campaign_version' IS DISTINCT FROM v.campaign_version::text OR a->>'target_step' IS DISTINCT FROM n::text OR n NOT BETWEEN 1 AND 10 OR coalesce((r#>>'{scope,end_at}')::timestamptz,'-infinity'::timestamptz)<=clock_timestamp() THEN RETURN '{"allowed":false,"reason":"campaign_authority_not_current"}';END IF;
 IF NOT EXISTS(SELECT 1 FROM org_sender_memberships WHERE org_id=v.org_id AND subject=r->>'actor_subject' AND active AND role IN('owner','admin')) THEN RETURN '{"allowed":false,"reason":"approval_actor_inactive"}';END IF;
 s:=r->'slices'->(v.id::text||':'||n::text);
 IF s IS NULL OR s#>>'{authority,slice_id}' IS DISTINCT FROM a->>'slice_id' OR s#>'{authority,revision}' IS DISTINCT FROM r->'revision' OR s#>>'{plan,content_hash}' IS DISTINCT FROM v.content_hash OR s#>>'{plan,content_hash}' IS DISTINCT FROM p->>'content_hash' OR s#>>'{plan,recipient}' IS DISTINCT FROM p->>'to_email' OR s#>>'{binding,email}' IS DISTINCT FROM p->>'sender_email' OR s#>>'{binding,credential_ref}' IS DISTINCT FROM p->>'credential_ref' OR s->>'expires_at' IS DISTINCT FROM a->>'expires_at' OR coalesce((s->>'expires_at')::timestamptz,'-infinity'::timestamptz)<=clock_timestamp() THEN RETURN '{"allowed":false,"reason":"exact_campaign_slice_required"}';END IF;
 checked:=outreach_email_step_check(p);IF checked->>'ready' IS DISTINCT FROM 'true' THEN RETURN checked||'{"allowed":false}';END IF;
 RETURN '{"allowed":true,"campaign_authority":true}';
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_datetime_format OR datetime_field_overflow THEN RETURN '{"allowed":false,"reason":"invalid_campaign_authority"}';END $$;

DO $patch$
DECLARE name text;definition text;needle text;
BEGIN
 FOREACH name IN ARRAY ARRAY['outreach_email_begin','outreach_email_step_begin','outreach_smtp_begin'] LOOP
  definition:=pg_get_functiondef(to_regprocedure(name||'(jsonb)'));
  IF position('email_campaign_dispatch_gate(p)' IN definition)=0 THEN
   needle:=substring(definition FROM E'BEGIN\r?\n');IF needle IS NULL THEN RAISE EXCEPTION 'EMAIL_BEGIN_BASELINE_REVIEW_REQUIRED: %',name;END IF;
   EXECUTE regexp_replace(definition,E'BEGIN\r?\n',needle||E' DECLARE campaign_check jsonb; BEGIN campaign_check:=email_campaign_dispatch_gate(p); IF campaign_check->>''allowed'' IS DISTINCT FROM ''true'' THEN RETURN campaign_check||''{"ready":false,"execution_authorized":false}''::jsonb;END IF;END;\n');
  END IF;
 END LOOP;
END $patch$;
REVOKE ALL ON FUNCTION email_campaign_automation_control(integer,text,bigint,integer,integer,boolean),email_campaign_renewal_claim(integer,bigint,text),email_campaign_slice_publish(jsonb),email_campaign_renewal_finish(jsonb),email_campaign_dispatch_gate(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION email_campaign_automation_control(integer,text,bigint,integer,integer,boolean),email_campaign_renewal_claim(integer,bigint,text),email_campaign_slice_publish(jsonb),email_campaign_renewal_finish(jsonb),email_campaign_dispatch_gate(jsonb) TO n8n_user;
COMMIT;
