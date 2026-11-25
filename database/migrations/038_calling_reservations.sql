-- LOCAL / UNAPPLIED. Reservation only: this migration cannot authorize a phone call.
-- Uses existing dispatch_metadata and unique plan/step index. No new tables/webhooks.
BEGIN;
CREATE OR REPLACE FUNCTION outreach_call_amount(v text) RETURNS bigint
LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN v ~ '^[0-9]{1,12}$' THEN v::bigint ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION outreach_call_reserve(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE o integer; pid bigint; v strategy_plans%ROWTYPE; cfg jsonb; ck jsonb;
 a outreach_activities%ROWTYPE; cost bigint; ceiling bigint; buffer bigint; spent numeric;
 daily integer; used bigint; funding text; lease text; month text; d text; n integer;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR coalesce(p->>'org_id','') !~ '^[1-9][0-9]{0,8}$'
 OR coalesce(p->>'plan_id','') !~ '^[1-9][0-9]{0,17}$'
 THEN RETURN '{"reserved":false,"execution_authorized":false,"reason":"invalid_request"}';END IF;
 o:=(p->>'org_id')::integer;pid:=(p->>'plan_id')::bigint;
 IF coalesce(p->>'step','1') !~ '^([1-9]|10)$' THEN RETURN '{"reserved":false,"execution_authorized":false,"reason":"invalid_step"}';END IF;
 n:=coalesce(p->>'step','1')::integer;
 -- Every caller, organization and funding source uses the SAME transaction lock.
 PERFORM pg_advisory_xact_lock(727411,1);
 SELECT * INTO v FROM strategy_plans WHERE org_id=o AND id=pid FOR UPDATE;
 IF NOT FOUND OR p->>'content_hash' IS DISTINCT FROM v.content_hash
 THEN RETURN '{"reserved":false,"execution_authorized":false,"reason":"plan_binding_invalid"}';END IF;
 IF n=1 THEN ck:=outreach_call_preview(o,pid);
 ELSE ck:=outreach_call_step_check(o,pid,n);END IF;
 IF ck->>'plan_eligible' IS DISTINCT FROM 'true' THEN
  RETURN ck||'{"reserved":false,"reason":"plan_not_eligible"}'::jsonb;END IF;
 -- Uncertain or expired reservations continue to block. Expiry is NEVER redial permission.
 IF EXISTS(SELECT 1 FROM outreach_activities WHERE channel='call'
 AND coalesce(dispatch_metadata->>'state','unknown') NOT IN ('settled','cancelled_before_send'))
 THEN RETURN '{"reserved":false,"execution_authorized":false,"reason":"call_active_or_uncertain"}';END IF;
 SELECT cv.config->'call_dispatch' INTO cfg FROM strategy_campaigns c JOIN strategy_campaign_versions cv
 ON cv.org_id=c.org_id AND cv.campaign_id=c.id AND cv.version=c.version
 WHERE c.org_id=o AND c.id=v.campaign_id AND c.version=v.campaign_version;
 funding:=cfg->>'funding';cost:=outreach_call_amount(cfg->'quote'->>'max_call_micro_usd');
 buffer:=outreach_call_amount(cfg->>'safety_buffer_micro_usd');
 IF coalesce(funding,'') NOT IN ('platform','byok') OR coalesce(cfg->>'connection_ref','')=''
 OR cost IS NULL OR cost<1 OR buffer IS NULL
 OR cfg->'quote'->>'verified' IS DISTINCT FROM 'true'
 OR coalesce(cfg->'quote'->>'expires_at','')=''
 OR (cfg->'quote'->>'expires_at')::timestamptz<=now()
 THEN RETURN '{"reserved":false,"execution_authorized":false,"reason":"funding_or_quote_unconfigured"}';END IF;
 -- Smallest configured current campaign cap applies across the organization.
 SELECT min(CASE WHEN outreach_call_amount(cv.config->'call_dispatch'->>'org_daily_calls') BETWEEN 1 AND 1000
 THEN outreach_call_amount(cv.config->'call_dispatch'->>'org_daily_calls')::integer ELSE 0 END)
 INTO daily FROM strategy_campaigns c JOIN strategy_campaign_versions cv
 ON cv.org_id=c.org_id AND cv.campaign_id=c.id AND cv.version=c.version
 WHERE c.org_id=o AND cv.config->'call_dispatch'->>'enabled'='true';
 IF coalesce(daily,0)=0 THEN RETURN '{"reserved":false,"execution_authorized":false,"reason":"daily_limit_unconfigured"}';END IF;
 -- Explicit UTC accounting days/months; customer local windows remain a begin-time gate.
 month:=to_char(now() AT TIME ZONE 'UTC','YYYY-MM');d:=to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD');
 SELECT count(*) INTO used FROM outreach_activities WHERE org_id=o AND channel='call'
 AND dispatch_metadata->>'accounting_day'=d AND dispatch_metadata->>'state' IS DISTINCT FROM 'cancelled_before_send';
 IF used>=daily THEN RETURN '{"reserved":false,"execution_authorized":false,"reason":"daily_allowance_exhausted"}';END IF;
 IF funding='platform' THEN ceiling:=10000000;
 ELSE
  SELECT min(coalesce(outreach_call_amount(cv.config->'call_dispatch'->>'monthly_ceiling_micro_usd'),0))
  INTO ceiling FROM strategy_campaigns c JOIN strategy_campaign_versions cv
  ON cv.org_id=c.org_id AND cv.campaign_id=c.id AND cv.version=c.version
  WHERE c.org_id=o AND cv.config->'call_dispatch'->>'enabled'='true' AND cv.config->'call_dispatch'->>'funding'='byok';
 END IF;
 -- Missing/malformed existing cost records block instead of silently making funds available.
 IF EXISTS(SELECT 1 FROM outreach_activities WHERE channel='call'
 AND dispatch_metadata->>'state'='settled'
 AND (coalesce(dispatch_metadata->>'funding','') NOT IN ('platform','byok')
 OR coalesce(dispatch_metadata->>'accounting_month','') !~ '^[0-9]{4}-[0-9]{2}$'
 OR outreach_call_amount(dispatch_metadata->>'actual_micro_usd') IS NULL))
 THEN RETURN '{"reserved":false,"execution_authorized":false,"reason":"cost_reconciliation_required"}';END IF;
 IF EXISTS(SELECT 1 FROM outreach_activities WHERE channel='call'
 AND dispatch_metadata->>'cost_review_required'='true'
 AND (dispatch_metadata->>'funding'='platform' OR org_id=o))
 THEN RETURN '{"reserved":false,"execution_authorized":false,"reason":"cost_review_required"}';END IF;
 SELECT coalesce(sum(outreach_call_amount(dispatch_metadata->>'actual_micro_usd')),0) INTO spent
 FROM outreach_activities WHERE channel='call' AND dispatch_metadata->>'state'='settled'
 AND dispatch_metadata->>'accounting_month'=month AND dispatch_metadata->>'funding'=funding
 AND (funding='platform' OR org_id=o);
 IF ceiling IS NULL OR spent+cost+buffer>ceiling
 THEN RETURN '{"reserved":false,"execution_authorized":false,"reason":"waiting_for_calling_credits"}';END IF;
 lease:=md5(random()::text||clock_timestamp()::text||pid::text);
 INSERT INTO outreach_activities(org_id,lead_id,channel,status,dispatch_metadata)
 VALUES(o,v.lead_id,'call','reserved',jsonb_build_object('version','calling_v1','plan_id',pid::text,'step',n::text,
 'state','reserved','content_hash',v.content_hash,'lease',lease,'lease_until',now()+interval '5 minutes',
 'attempts',0,'funding',funding,'connection_ref',cfg->>'connection_ref','reserved_micro_usd',cost,
 'accounting_month',month,'accounting_day',d,'execution_authorized',false))
 ON CONFLICT DO NOTHING RETURNING * INTO a;
 IF NOT FOUND THEN RETURN '{"reserved":false,"execution_authorized":false,"reason":"dispatch_already_recorded"}';END IF;
 RETURN jsonb_build_object('reserved',true,'execution_authorized',false,'activity_id',a.id,'lease',lease,
 'lease_until',a.dispatch_metadata->'lease_until','reserved_micro_usd',cost,'reason','transport_still_disabled');
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_datetime_format OR datetime_field_overflow THEN
 RETURN '{"reserved":false,"execution_authorized":false,"reason":"invalid_configuration"}';
END $$;

CREATE OR REPLACE FUNCTION outreach_call_cancel_reserved(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE a outreach_activities%ROWTYPE;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR coalesce(p->>'org_id','') !~ '^[1-9][0-9]{0,8}$'
 OR coalesce(p->>'activity_id','') !~ '^[1-9][0-9]{0,8}$'
 THEN RETURN '{"cancelled":false,"reason":"invalid_request"}';END IF;
 PERFORM pg_advisory_xact_lock(727411,1);
 SELECT * INTO a FROM outreach_activities WHERE org_id=(p->>'org_id')::integer
 AND id=(p->>'activity_id')::integer AND channel='call' FOR UPDATE;
 IF NOT FOUND OR a.dispatch_metadata->>'lease' IS DISTINCT FROM p->>'lease'
 OR a.dispatch_metadata->>'version' IS DISTINCT FROM 'calling_v1'
 THEN RETURN '{"cancelled":false,"reason":"reservation_binding_invalid"}';END IF;
 IF a.dispatch_metadata->>'state'='cancelled_before_send' THEN RETURN '{"cancelled":true,"replayed":true}';END IF;
 IF a.dispatch_metadata->>'state' IS DISTINCT FROM 'reserved'
 OR a.dispatch_metadata->>'attempts' IS DISTINCT FROM '0' OR a.dispatch_metadata ? 'provider_call_id'
 OR a.dispatch_metadata->>'execution_authorized' IS DISTINCT FROM 'false'
 THEN RETURN '{"cancelled":false,"reason":"reconciliation_required"}';END IF;
 UPDATE outreach_activities SET status='cancelled',dispatch_metadata=dispatch_metadata||jsonb_build_object(
 'state','cancelled_before_send','cancelled_at',now(),'reserved_micro_usd',0)
 WHERE id=a.id AND org_id=a.org_id;
 RETURN '{"cancelled":true,"execution_authorized":false}';
END $$;
REVOKE ALL ON FUNCTION outreach_call_amount(text),outreach_call_reserve(jsonb),outreach_call_cancel_reserved(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_call_amount(text),outreach_call_reserve(jsonb),outreach_call_cancel_reserved(jsonb) TO n8n_user;
COMMIT;
