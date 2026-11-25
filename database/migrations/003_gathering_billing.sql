-- Versioned entry points let the currently active v2 workflows finish unchanged.
BEGIN;
CREATE TABLE IF NOT EXISTS gathering_accounts (
 id bigserial PRIMARY KEY,
 mode text NOT NULL CHECK(mode IN ('platform','byok')),
 org_id integer UNIQUE REFERENCES organizations(id),
 provider_user_id text UNIQUE,
 api_key text,
 enabled boolean NOT NULL DEFAULT false,
 monthly_budget_usd numeric(14,6) NOT NULL DEFAULT 0 CHECK(monthly_budget_usd>=0),
 max_concurrent integer NOT NULL DEFAULT 2 CHECK(max_concurrent BETWEEN 1 AND 100),
 price_multiplier numeric(8,4) NOT NULL DEFAULT 1 CHECK(price_multiplier>=1),
 CHECK((mode='platform' AND org_id IS NULL) OR (mode='byok' AND org_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS gathering_one_platform ON gathering_accounts(mode) WHERE mode='platform';
CREATE TABLE IF NOT EXISTS gathering_dispatch_settings(id boolean PRIMARY KEY DEFAULT true CHECK(id),max_workers integer NOT NULL CHECK(max_workers BETWEEN 1 AND 100));
INSERT INTO gathering_dispatch_settings VALUES(true,4) ON CONFLICT DO NOTHING;
INSERT INTO gathering_accounts(mode) VALUES('platform') ON CONFLICT DO NOTHING;
INSERT INTO gathering_accounts(mode,org_id,api_key,enabled,monthly_budget_usd)
 SELECT 'byok',id,apify_api_key,apify_status='active',greatest(coalesce(monthly_credit_limit,0),0)
 FROM organizations WHERE nullif(apify_api_key,'') IS NOT NULL ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS gathering_wallet_entries (
 id bigserial PRIMARY KEY,org_id integer NOT NULL REFERENCES organizations(id),
 amount_usd numeric(14,6) NOT NULL,
 reference text NOT NULL UNIQUE,
 job_id integer UNIQUE REFERENCES scraping_jobs(id),created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE scraping_jobs ADD COLUMN IF NOT EXISTS billing_mode text CHECK(billing_mode IN ('platform','byok')),
 ADD COLUMN IF NOT EXISTS provider_account_id bigint REFERENCES gathering_accounts(id),
 ADD COLUMN IF NOT EXISTS result_mode text CHECK(result_mode IN ('new','matching')),
 ADD COLUMN IF NOT EXISTS candidate_limit integer,
 ADD COLUMN IF NOT EXISTS customer_reserved_usd numeric(14,6),
 ADD COLUMN IF NOT EXISTS customer_charge_usd numeric(14,6),
 ADD COLUMN IF NOT EXISTS price_multiplier numeric(8,4),
 ADD COLUMN IF NOT EXISTS completion_reason text,
 ADD COLUMN IF NOT EXISTS dispatched_at timestamptz;
CREATE INDEX IF NOT EXISTS gathering_queue ON scraping_jobs(provider_account_id,status,created_at) WHERE billing_mode IS NOT NULL;
REVOKE ALL ON gathering_accounts,gathering_wallet_entries FROM PUBLIC;

CREATE OR REPLACE FUNCTION gathering_wallet_credit(p_org integer,p_amount numeric,p_reference text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE e gathering_wallet_entries%ROWTYPE;
BEGIN
 IF p_amount IS NULL OR p_amount<=0 OR p_reference IS NULL OR length(p_reference)<8 THEN RAISE EXCEPTION 'Positive credit and an external payment reference required'; END IF;
 PERFORM 1 FROM organizations WHERE id=p_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown organization'; END IF;
 SELECT * INTO e FROM gathering_wallet_entries WHERE reference=p_reference;
 IF FOUND THEN
  IF e.org_id<>p_org OR e.amount_usd<>p_amount OR e.job_id IS NOT NULL THEN RAISE EXCEPTION 'Payment reference conflict'; END IF;
  RETURN;
 END IF;
 INSERT INTO gathering_wallet_entries(org_id,amount_usd,reference) VALUES(p_org,p_amount,p_reference);
END $$;
REVOKE EXECUTE ON FUNCTION gathering_wallet_credit(integer,numeric,text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION gathering_account_spent(p_account bigint) RETURNS numeric LANGUAGE sql STABLE AS $$
 SELECT coalesce(sum(c.amount_usd),0) FROM gathering_costs c JOIN scraping_jobs j ON j.id=c.job_id JOIN gathering_accounts a ON a.id=p_account
 WHERE c.recorded_at>=date_trunc('month',now()) AND (j.provider_account_id=a.id OR (j.billing_mode IS NULL AND a.mode='byok' AND j.org_id=a.org_id))
$$;

CREATE OR REPLACE FUNCTION gathering_quote_v3(p_org integer,p_mode text,p_budget numeric) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE a gathering_accounts%ROWTYPE; account_reserved numeric; wallet numeric; wallet_reserved numeric;
BEGIN
 SELECT * INTO a FROM gathering_accounts WHERE mode=p_mode AND (p_mode='platform' OR org_id=p_org);
 IF NOT FOUND OR NOT a.enabled OR nullif(a.api_key,'') IS NULL THEN RETURN jsonb_build_object('ready',false,'reason',CASE WHEN p_mode='platform' THEN 'PLATFORM_NOT_CONFIGURED' ELSE 'BYOK_NOT_CONNECTED' END); END IF;
 SELECT coalesce(sum(max_cost_usd),0) INTO account_reserved FROM scraping_jobs WHERE provider_account_id=a.id AND (status IN ('queued','pending','running','needs_review') OR (actual_cost IS NULL AND apify_actor_run_id IS NOT NULL));
 SELECT coalesce(sum(amount_usd),0) INTO wallet FROM gathering_wallet_entries WHERE org_id=p_org;
 SELECT coalesce(sum(customer_reserved_usd),0) INTO wallet_reserved FROM scraping_jobs WHERE org_id=p_org AND billing_mode='platform' AND (status IN ('queued','pending','running','needs_review') OR (actual_cost IS NULL AND apify_actor_run_id IS NOT NULL));
 RETURN jsonb_build_object('ready',true,'can_submit',a.monthly_budget_usd-gathering_account_spent(a.id)-account_reserved>=p_budget AND (p_mode='byok' OR wallet-wallet_reserved>=round(p_budget*a.price_multiplier,6)),'billing_mode',p_mode,'maximum_customer_charge_usd',CASE WHEN p_mode='platform' THEN round(p_budget*a.price_multiplier,6) ELSE 0 END,
 'customer_pays_provider_directly',p_mode='byok','wallet_available_usd',wallet-wallet_reserved,
 'provider_budget_available',a.monthly_budget_usd-gathering_account_spent(a.id)-account_reserved>=p_budget);
END $$;

CREATE OR REPLACE FUNCTION gathering_enqueue_v3(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a gathering_accounts%ROWTYPE;o organizations%ROWTYPE;j scraping_jobs%ROWTYPE;old scraping_jobs%ROWTYPE;
 settings jsonb;mode text:=coalesce(p->>'billing_mode','platform'); result_kind text:=coalesce(p->>'result_mode','new');
 budget numeric:=(p->>'max_cost_usd')::numeric; target integer:=(p->>'max_results')::integer; candidates integer;
 reserved numeric; customer_reserved numeric; available numeric; wallet_reserved numeric; cached integer;
BEGIN
 IF mode NOT IN ('platform','byok') OR result_kind NOT IN ('new','matching') OR budget IS NULL OR budget NOT BETWEEN 0.01 AND 10 OR target IS NULL OR target NOT BETWEEN 1 AND 500 OR p->>'source' NOT IN ('google_maps','yellow_pages') OR nullif(p->>'request_id','') IS NULL THEN RAISE EXCEPTION 'Invalid gathering request'; END IF;
 candidates:=coalesce((p->>'candidate_limit')::integer,CASE WHEN result_kind='new' THEN least(1500,target*3) ELSE target END);
 IF candidates NOT BETWEEN target AND 1500 THEN RAISE EXCEPTION 'Invalid candidate limit'; END IF;
 -- Every operation needing both locks takes provider account, organization, then job.
 SELECT * INTO a FROM gathering_accounts WHERE gathering_accounts.mode=coalesce(p->>'billing_mode','platform') AND (gathering_accounts.mode='platform' OR org_id=(p->>'org_id')::integer) FOR UPDATE;
 SELECT * INTO o FROM organizations WHERE id=(p->>'org_id')::integer FOR UPDATE;
 IF NOT FOUND OR o.status IS DISTINCT FROM 'active' THEN RETURN jsonb_build_object('error',true,'http_status',409,'code','ORG_NOT_READY'); END IF;
 settings:=p-ARRAY['error','org_id','job_name','request_id'];
 settings:=settings||jsonb_build_object('billing_mode',mode,'result_mode',result_kind,'candidate_limit',candidates);
 SELECT * INTO old FROM scraping_jobs WHERE org_id=o.id AND request_id=p->>'request_id';
 IF FOUND THEN
  IF old.request_settings IS DISTINCT FROM settings THEN RETURN jsonb_build_object('error',true,'http_status',409,'code','REQUEST_ID_CONFLICT'); END IF;
  RETURN jsonb_build_object('error',false,'http_status',200,'job_id',old.id,'org_id',o.id,'source',old.source,'status',old.status,'dispatch',false,'replayed',true,'billing_mode',old.billing_mode);
 END IF;
 IF result_kind='matching' AND NOT coalesce((p->>'refresh')::boolean,false) AND coalesce((p->>'reuse_hours')::integer,24)>0 THEN
  SELECT id INTO cached FROM scraping_jobs WHERE org_id=o.id AND status='completed' AND billing_mode=mode AND result_mode='matching' AND reused_from_job_id IS NULL AND NOT partial_results
  AND request_settings-'refresh'-'reuse_hours'=settings-'refresh'-'reuse_hours' AND completed_at>now()-make_interval(hours=>coalesce((p->>'reuse_hours')::integer,24)) ORDER BY completed_at DESC LIMIT 1;
 END IF;
 customer_reserved:=CASE WHEN mode='platform' THEN round(budget*coalesce(a.price_multiplier,1),6) ELSE 0 END;
 IF cached IS NULL THEN
  IF a.id IS NULL OR NOT a.enabled OR nullif(a.api_key,'') IS NULL THEN RETURN jsonb_build_object('error',true,'http_status',409,'code',CASE WHEN mode='platform' THEN 'PLATFORM_NOT_CONFIGURED' ELSE 'BYOK_NOT_CONNECTED' END); END IF;
  IF (SELECT count(*) FROM scraping_jobs WHERE org_id=o.id AND billing_mode IS NOT NULL AND status IN ('queued','pending','running','needs_review'))>=20 THEN RETURN jsonb_build_object('error',true,'http_status',409,'code','ORG_QUEUE_FULL'); END IF;
  SELECT coalesce(sum(max_cost_usd),0) INTO reserved FROM scraping_jobs WHERE provider_account_id=a.id AND (status IN ('queued','pending','running','needs_review') OR (actual_cost IS NULL AND apify_actor_run_id IS NOT NULL));
  IF a.monthly_budget_usd-gathering_account_spent(a.id)-reserved<budget THEN RETURN jsonb_build_object('error',true,'http_status',409,'code','PROVIDER_BUDGET_EXHAUSTED'); END IF;
  IF mode='platform' THEN
   IF coalesce((p->>'max_customer_cost_usd')::numeric,budget)<customer_reserved THEN RETURN jsonb_build_object('error',true,'http_status',409,'code','PRICE_CONFIRMATION_REQUIRED','maximum_customer_charge_usd',customer_reserved); END IF;
   SELECT coalesce(sum(amount_usd),0) INTO available FROM gathering_wallet_entries WHERE org_id=o.id;
   SELECT coalesce(sum(customer_reserved_usd),0) INTO wallet_reserved FROM scraping_jobs WHERE org_id=o.id AND billing_mode='platform' AND (status IN ('queued','pending','running','needs_review') OR (actual_cost IS NULL AND apify_actor_run_id IS NOT NULL));
   IF available-wallet_reserved<customer_reserved THEN RETURN jsonb_build_object('error',true,'http_status',409,'code','INSUFFICIENT_PLATFORM_CREDITS'); END IF;
  END IF;
 END IF;
 INSERT INTO scraping_jobs(org_id,job_name,source,search_query,location,max_results,status,gathering_version,request_id,max_cost_usd,request_settings,heartbeat_at,billing_mode,provider_account_id,result_mode,candidate_limit,customer_reserved_usd,price_multiplier,reused_from_job_id)
 VALUES(o.id,p->>'job_name',p->>'source',p->>'search_query',p->>'location',target,CASE WHEN cached IS NULL THEN 'queued' ELSE 'completed' END,1,p->>'request_id',budget,settings,now(),mode,a.id,result_kind,candidates,CASE WHEN cached IS NULL THEN customer_reserved ELSE 0 END,a.price_multiplier,cached) RETURNING * INTO j;
 IF cached IS NOT NULL THEN
  INSERT INTO gathering_results SELECT j.id,ordinal,o.id,lead_id,CASE WHEN disposition='rejected' THEN 'rejected' ELSE 'reused' END,reason,snapshot FROM gathering_results WHERE job_id=cached AND org_id=o.id;
  UPDATE scraping_jobs SET completed_at=now(),total_leads=0,duplicate_count=(SELECT count(*) FROM gathering_results WHERE job_id=j.id AND lead_id IS NOT NULL),rejected_count=(SELECT count(*) FROM gathering_results WHERE job_id=j.id AND disposition='rejected'),fetched_count=(SELECT fetched_count FROM scraping_jobs WHERE id=cached),actual_cost=0,cost_status='reused',customer_charge_usd=0,completion_reason='cached_matches' WHERE id=j.id;
 END IF;
 RETURN jsonb_build_object('error',false,'http_status',CASE WHEN cached IS NULL THEN 202 ELSE 200 END,'job_id',j.id,'org_id',o.id,'source',j.source,'status',j.status,'dispatch',false,'replayed',false,'billing_mode',mode,'result_mode',result_kind,'maximum_customer_charge_usd',j.customer_reserved_usd,'reused_from_job_id',cached);
END $$;

CREATE OR REPLACE FUNCTION gathering_dispatch_v3() RETURNS SETOF jsonb LANGUAGE plpgsql AS $$
DECLARE a gathering_accounts%ROWTYPE;j scraping_jobs%ROWTYPE;occupied integer;global_used integer;global_limit integer;
BEGIN
 IF NOT pg_try_advisory_xact_lock(49302812) THEN RETURN; END IF;
 SELECT max_workers INTO global_limit FROM gathering_dispatch_settings WHERE id=true;
 SELECT count(*) INTO global_used FROM scraping_jobs WHERE billing_mode IS NOT NULL AND status IN ('pending','running','needs_review');
 FOR a IN SELECT * FROM gathering_accounts WHERE enabled AND nullif(api_key,'') IS NOT NULL ORDER BY id FOR UPDATE SKIP LOCKED LOOP
  SELECT count(*) INTO occupied FROM scraping_jobs WHERE provider_account_id=a.id AND status IN ('pending','running','needs_review');
  WHILE occupied<a.max_concurrent AND global_used<global_limit LOOP
   -- Least recently served organization first; FIFO within an organization.
   SELECT s.* INTO j FROM scraping_jobs s JOIN organizations o ON o.id=s.org_id AND o.status='active'
    WHERE s.provider_account_id=a.id AND s.status='queued'
    ORDER BY coalesce((SELECT max(h.dispatched_at) FROM scraping_jobs h WHERE h.provider_account_id=a.id AND h.org_id=s.org_id),'-infinity'::timestamptz),s.created_at,s.id LIMIT 1 FOR UPDATE OF s SKIP LOCKED;
   EXIT WHEN NOT FOUND;
   UPDATE scraping_jobs SET status='pending',heartbeat_at=now(),dispatched_at=now() WHERE id=j.id;
   occupied:=occupied+1;global_used:=global_used+1;
   RETURN NEXT jsonb_build_object('job_id',j.id,'org_id',j.org_id,'source',j.source);
  END LOOP;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION gathering_claim_v3(p_job integer,p_org integer,p_source text,p_execution text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a gathering_accounts%ROWTYPE;j scraping_jobs%ROWTYPE;
BEGIN
 SELECT ac.* INTO a FROM gathering_accounts ac JOIN scraping_jobs s ON s.provider_account_id=ac.id WHERE s.id=p_job AND s.org_id=p_org FOR UPDATE OF ac;
 PERFORM 1 FROM organizations WHERE id=p_org AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('claimed',false); END IF;
 SELECT * INTO j FROM scraping_jobs WHERE id=p_job AND org_id=p_org AND source=p_source FOR UPDATE;
 IF NOT FOUND OR j.billing_mode IS NULL OR j.status<>'pending' OR a.id IS NULL OR NOT a.enabled OR nullif(a.api_key,'') IS NULL THEN RETURN jsonb_build_object('claimed',false); END IF;
 UPDATE scraping_jobs SET status='running',started_at=coalesce(started_at,now()),heartbeat_at=now(),execution_id=p_execution,completed_at=NULL WHERE id=j.id RETURNING * INTO j;
 RETURN to_jsonb(j)||jsonb_build_object('claimed',true,'apify_api_key',a.api_key);
END $$;

CREATE OR REPLACE FUNCTION gathering_charge_v3(p_job integer,p_org integer,p_amount numeric) RETURNS void LANGUAGE plpgsql AS $$
DECLARE j scraping_jobs%ROWTYPE; inserted integer; customer_amount numeric;
BEGIN
 IF p_amount IS NULL THEN RETURN; END IF;
 IF p_amount<0 THEN RAISE EXCEPTION 'Invalid provider cost'; END IF;
 SELECT * INTO j FROM scraping_jobs WHERE id=p_job AND org_id=p_org;
 IF NOT FOUND OR j.billing_mode IS NULL THEN RAISE EXCEPTION 'Unknown billing job'; END IF;
 INSERT INTO gathering_costs(job_id,org_id,amount_usd) VALUES(p_job,p_org,p_amount) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 IF inserted=0 THEN RETURN; END IF;
 customer_amount:=CASE WHEN j.billing_mode='platform' THEN least(j.customer_reserved_usd,round(p_amount*j.price_multiplier,6)) ELSE 0 END;
 IF customer_amount>0 THEN INSERT INTO gathering_wallet_entries(org_id,amount_usd,reference,job_id) VALUES(p_org,-customer_amount,'gathering_job_'||p_job,p_job); END IF;
 UPDATE scraping_jobs SET customer_charge_usd=customer_amount WHERE id=p_job;
END $$;

CREATE OR REPLACE FUNCTION gathering_match_v3(p_org integer,p_source text,r jsonb) RETURNS integer LANGUAGE sql STABLE AS $$
 SELECT s.id FROM staging_leads s WHERE s.org_id=p_org AND (
  (nullif(r->>'source_record_id','') IS NOT NULL AND s.source=p_source AND s.source_record_id=r->>'source_record_id') OR
  (NOT (s.source=p_source AND s.source_record_id IS NOT NULL AND nullif(r->>'source_record_id','') IS NOT NULL AND s.source_record_id<>r->>'source_record_id') AND gathering_norm(s.company_name)=gathering_norm(r->>'company_name') AND (
   (gathering_norm(s.address)=gathering_norm(r->>'address') AND (gathering_norm(s.city)=gathering_norm(r->>'city') OR s.city IS NULL OR r->>'city' IS NULL)) OR
   (gathering_norm(s.phone)=gathering_norm(r->>'phone') AND (gathering_norm(s.address)=gathering_norm(r->>'address') OR (s.address IS NULL AND r->>'address' IS NULL)))
  ))) ORDER BY (s.source=p_source AND s.source_record_id=r->>'source_record_id') DESC NULLS LAST,s.id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION gathering_finish_v3(p_job integer,p_org integer,p_rows jsonb,p_cost numeric,p_fetched integer,p_excluded jsonb,p_terminal text,p_execution text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE j scraping_jobs%ROWTYPE;r jsonb;lead integer;total integer:=0;duplicates integer:=0;excluded integer:=0;matches integer:=0;seq integer:=0;state text;why text;seen integer[]:='{}';reason text;
BEGIN
 PERFORM 1 FROM gathering_accounts a JOIN scraping_jobs s ON s.provider_account_id=a.id WHERE s.id=p_job AND s.org_id=p_org FOR UPDATE OF a;
 PERFORM 1 FROM organizations WHERE id=p_org FOR UPDATE;
 SELECT * INTO j FROM scraping_jobs WHERE id=p_job AND org_id=p_org AND billing_mode IS NOT NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown job'; END IF;
 IF j.status IN ('completed','cancelled','failed') THEN RETURN jsonb_build_object('job_id',j.id,'replayed',true); END IF;
 IF j.execution_id IS DISTINCT FROM p_execution OR p_execution IS NULL OR j.status<>'running' OR j.apify_actor_run_id IS NULL THEN RAISE EXCEPTION 'Job or worker is not ready'; END IF;
 IF p_terminal NOT IN ('SUCCEEDED','ABORTED','FAILED','TIMED-OUT') OR jsonb_typeof(p_rows)<>'array' OR jsonb_typeof(p_excluded)<>'array' OR jsonb_array_length(p_rows)>j.candidate_limit THEN RAISE EXCEPTION 'Invalid result batch'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  lead:=gathering_match_v3(p_org,j.source,r);why:=NULL;
  IF (j.result_mode='new' AND lead IS NULL AND total>=j.max_results) OR (j.result_mode='matching' AND matches>=j.max_results AND (lead IS NULL OR NOT lead=ANY(seen))) THEN
   state:='rejected';why:='target_already_reached';lead:=NULL;excluded:=excluded+1;
  ELSIF lead IS NULL THEN
   INSERT INTO staging_leads(job_id,org_id,source,company_name,phone,email,website,address,city,state,zip,country,category,raw_data,source_record_id,processing_status,processed)
    VALUES(j.id,p_org,j.source,r->>'company_name',r->>'phone',r->>'email',r->>'website',r->>'address',r->>'city',r->>'state',r->>'zip',r->>'country',r->>'category',r->'raw_data',r->>'source_record_id','pending',false) RETURNING id INTO lead;
   total:=total+1;matches:=matches+1;seen:=array_append(seen,lead);state:='new';
  ELSE
   duplicates:=duplicates+1;state:='existing';why:=CASE WHEN lead=ANY(seen) THEN 'duplicate_in_search' ELSE 'organization_already_has_business' END;
   IF NOT lead=ANY(seen) THEN matches:=matches+1;seen:=array_append(seen,lead); END IF;
  END IF;
  INSERT INTO gathering_results VALUES(j.id,coalesce((r->>'ordinal')::integer,seq),p_org,lead,state,why,r);seq:=seq+1;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(p_excluded) LOOP
  INSERT INTO gathering_results VALUES(j.id,coalesce((r->>'ordinal')::integer,seq),p_org,NULL,'rejected',r->>'reason',r);seq:=seq+1;excluded:=excluded+1;
 END LOOP;
 PERFORM gathering_charge_v3(j.id,p_org,p_cost);
 state:=CASE WHEN j.cancel_requested THEN 'cancelled' WHEN p_terminal='SUCCEEDED' THEN 'completed' ELSE 'failed' END;
 reason:=CASE WHEN state='cancelled' THEN 'cancelled' WHEN state='failed' THEN 'provider_failed'
  WHEN (CASE WHEN j.result_mode='new' THEN total ELSE matches END)>=j.max_results THEN 'target_reached'
  WHEN p_fetched>=j.candidate_limit THEN 'candidate_limit_reached' ELSE 'source_or_provider_limit' END;
 UPDATE scraping_jobs SET status=state,partial_results=(state<>'completed' OR reason<>'target_reached'),completion_reason=reason,completed_at=now(),heartbeat_at=now(),total_leads=total,fetched_count=p_fetched,duplicate_count=duplicates,rejected_count=excluded,actual_cost=p_cost,cost_status=CASE WHEN p_cost IS NULL THEN 'unknown' ELSE 'reported' END,error_message=CASE WHEN state='failed' THEN 'APIFY_'||p_terminal ELSE NULL END WHERE id=j.id;
 RETURN jsonb_build_object('job_id',j.id,'status',state,'new_leads',total,'existing_matches',duplicates,'completion_reason',reason,'shortfall',greatest(0,j.max_results-CASE WHEN j.result_mode='new' THEN total ELSE matches END));
END $$;

CREATE OR REPLACE FUNCTION gathering_control_v3(p_job integer,p_org integer,p_action text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE j scraping_jobs%ROWTYPE;
BEGIN
 PERFORM 1 FROM gathering_accounts a JOIN scraping_jobs s ON s.provider_account_id=a.id WHERE s.id=p_job AND s.org_id=p_org FOR UPDATE OF a;
 PERFORM 1 FROM organizations WHERE id=p_org FOR UPDATE;
 SELECT * INTO j FROM scraping_jobs WHERE id=p_job AND org_id=p_org AND billing_mode IS NOT NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error',true,'http_status',404,'code','JOB_NOT_FOUND'); END IF;
 IF p_action='cancel' AND j.status='queued' THEN
  UPDATE scraping_jobs SET status='cancelled',cancel_requested=true,completed_at=now(),actual_cost=0,customer_charge_usd=0,cost_status='not_started',completion_reason='cancelled' WHERE id=j.id;
  RETURN jsonb_build_object('error',false,'http_status',200,'job_id',j.id,'dispatch',false,'status','cancelled');
 END IF;
 -- Existing implementation preserves provider identities and rejects unsafe restarts.
 RETURN gathering_control(p_job,p_org,p_action);
END $$;

CREATE OR REPLACE FUNCTION gathering_recover_v3() RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a gathering_accounts%ROWTYPE;requeued integer:=0;n integer;
BEGIN
 FOR a IN SELECT * FROM gathering_accounts ORDER BY id FOR UPDATE SKIP LOCKED LOOP
  UPDATE scraping_jobs SET status='queued',heartbeat_at=now(),error_message='DISPATCH_RETRY'
   WHERE provider_account_id=a.id AND status='pending' AND started_at IS NULL AND heartbeat_at<now()-interval '2 minutes';
  GET DIAGNOSTICS n=ROW_COUNT;requeued:=requeued+n;
  UPDATE scraping_jobs SET status='needs_review',error_message='WORKER_INTERRUPTED' WHERE provider_account_id=a.id AND status IN ('pending','running') AND started_at IS NOT NULL AND heartbeat_at<now()-interval '20 minutes';
  UPDATE scraping_jobs SET status='cancelled',completed_at=now(),actual_cost=0,customer_charge_usd=0,cost_status='not_started',completion_reason='queue_expired' WHERE provider_account_id=a.id AND status='queued' AND created_at<now()-interval '1 day';
 END LOOP;
 RETURN jsonb_build_object('requeued',requeued);
END $$;

CREATE OR REPLACE FUNCTION gathering_report_v3(p_job integer,p_org integer) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT gathering_report(p_job,p_org)||jsonb_build_object('billing_mode',j.billing_mode,'result_mode',j.result_mode,'target',j.max_results,'candidate_limit',j.candidate_limit,
 'existing_matches',(SELECT count(DISTINCT lead_id) FROM gathering_results WHERE job_id=j.id AND (reason='organization_already_has_business' OR disposition='reused')),'duplicate_records',j.duplicate_count,
 'customer_charge_usd',j.customer_charge_usd,'maximum_customer_charge_usd',j.customer_reserved_usd,'provider_cost_usd',coalesce(c.amount_usd,j.actual_cost),'completion_reason',j.completion_reason,
 'billing_needs_attention',j.actual_cost IS NULL AND j.apify_actor_run_id IS NOT NULL AND j.status IN ('completed','failed','cancelled'),'provider_budget_exceeded',coalesce(c.amount_usd,j.actual_cost)>j.max_cost_usd,
 'target_achieved',CASE WHEN j.result_mode='new' THEN coalesce(j.total_leads,0) ELSE (SELECT count(DISTINCT lead_id) FROM gathering_results WHERE job_id=j.id) END,
 'shortfall',greatest(0,j.max_results-CASE WHEN j.result_mode='new' THEN coalesce(j.total_leads,0) ELSE (SELECT count(DISTINCT lead_id) FROM gathering_results WHERE job_id=j.id) END),
 'stage',CASE j.status WHEN 'queued' THEN 'waiting_for_capacity' WHEN 'pending' THEN 'dispatching' WHEN 'running' THEN 'searching' WHEN 'needs_review' THEN 'needs_attention' ELSE j.status END)
 FROM scraping_jobs j LEFT JOIN gathering_costs c ON c.job_id=j.id WHERE j.id=p_job AND j.org_id=p_org
$$;

CREATE OR REPLACE FUNCTION gathering_connect_byok(p_org integer,p_key text,p_provider_user text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a gathering_accounts%ROWTYPE;
BEGIN
 -- Serialize account linking so one provider account cannot bypass concurrency via aliases.
 PERFORM pg_advisory_xact_lock(49302811);
 SELECT * INTO a FROM gathering_accounts WHERE mode='byok' AND org_id=p_org FOR UPDATE;
 PERFORM 1 FROM organizations WHERE id=p_org AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'code','ORG_NOT_READY','http_status',409); END IF;
 IF EXISTS(SELECT 1 FROM gathering_accounts WHERE provider_user_id=p_provider_user AND id IS DISTINCT FROM a.id) THEN RETURN jsonb_build_object('success',false,'code','PROVIDER_ACCOUNT_ALREADY_LINKED','http_status',409); END IF;
 IF EXISTS(SELECT 1 FROM scraping_jobs WHERE provider_account_id=a.id AND (status IN ('queued','pending','running','needs_review') OR (actual_cost IS NULL AND apify_actor_run_id IS NOT NULL))) THEN RETURN jsonb_build_object('success',false,'code','ACCOUNT_HAS_UNSETTLED_JOBS','http_status',409); END IF;
 INSERT INTO gathering_accounts(mode,org_id,provider_user_id,api_key,enabled,monthly_budget_usd)
  SELECT 'byok',p_org,p_provider_user,p_key,true,greatest(coalesce(monthly_credit_limit,0),0) FROM organizations WHERE id=p_org
 ON CONFLICT(org_id) DO UPDATE SET provider_user_id=excluded.provider_user_id,api_key=excluded.api_key,enabled=true;
 UPDATE organizations SET apify_api_key=p_key,apify_status='active',updated_at=now() WHERE id=p_org;
 RETURN jsonb_build_object('success',true,'org_id',p_org,'billing_mode','byok','http_status',200);
END $$;
CREATE OR REPLACE FUNCTION gathering_dispatch_failed_v3(p_job integer,p_org integer) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
 -- An HTTP error may follow a successful claim. Never overwrite a running worker.
 UPDATE scraping_jobs SET status='queued',heartbeat_at=now(),error_message='DISPATCH_RETRY'
 WHERE id=p_job AND org_id=p_org AND billing_mode IS NOT NULL AND status='pending' AND started_at IS NULL;
 RETURN jsonb_build_object('requeued',FOUND);
END $$;
CREATE OR REPLACE FUNCTION gathering_reconcile_cost_v3(p_job integer,p_org integer,p_amount numeric) RETURNS void LANGUAGE plpgsql AS $$
DECLARE j scraping_jobs%ROWTYPE;recorded numeric;
BEGIN
 -- Administrative only: caller must first verify terminal cost with the provider.
 IF p_amount IS NULL OR p_amount<0 THEN RAISE EXCEPTION 'Verified nonnegative provider cost required'; END IF;
 PERFORM 1 FROM gathering_accounts a JOIN scraping_jobs s ON s.provider_account_id=a.id WHERE s.id=p_job AND s.org_id=p_org FOR UPDATE OF a;
 PERFORM 1 FROM organizations WHERE id=p_org FOR UPDATE;
 SELECT * INTO j FROM scraping_jobs WHERE id=p_job AND org_id=p_org AND billing_mode IS NOT NULL FOR UPDATE;
 IF NOT FOUND OR j.status NOT IN ('completed','failed','cancelled') OR j.apify_actor_run_id IS NULL THEN RAISE EXCEPTION 'Terminal provider job required'; END IF;
 SELECT amount_usd INTO recorded FROM gathering_costs WHERE job_id=j.id;
 IF recorded IS NOT NULL AND recorded<>round(p_amount,6) THEN RAISE EXCEPTION 'Previously settled cost differs'; END IF;
 PERFORM gathering_charge_v3(j.id,p_org,p_amount);
 UPDATE scraping_jobs SET actual_cost=p_amount,cost_status='reported' WHERE id=j.id;
END $$;
REVOKE EXECUTE ON FUNCTION gathering_reconcile_cost_v3(integer,integer,numeric) FROM PUBLIC;
COMMIT;
