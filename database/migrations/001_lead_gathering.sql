-- Additive migration. Historical jobs/leads are never reclassified or deleted.
BEGIN;
ALTER TABLE public.scraping_jobs
  ADD COLUMN IF NOT EXISTS gathering_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS request_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS max_cost_usd numeric(12,4),
  ADD COLUMN IF NOT EXISTS dataset_id text,
  ADD COLUMN IF NOT EXISTS execution_id text,
  ADD COLUMN IF NOT EXISTS fetched_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duplicate_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rejected_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS cost_status text NOT NULL DEFAULT 'unknown';
ALTER TABLE public.staging_leads ADD COLUMN IF NOT EXISTS source_record_id text;
CREATE UNIQUE INDEX IF NOT EXISTS gathering_request_unique ON public.scraping_jobs(org_id,request_id) WHERE request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS gathering_source_unique ON public.staging_leads(org_id,source,source_record_id) WHERE source_record_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS gathering_active_jobs ON public.scraping_jobs(org_id,status) WHERE gathering_version=1;
CREATE TABLE IF NOT EXISTS public.gathering_costs (
  job_id integer PRIMARY KEY REFERENCES public.scraping_jobs(id),
  org_id integer NOT NULL REFERENCES public.organizations(id),
  amount_usd numeric(12,6) NOT NULL CHECK(amount_usd >= 0),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.gathering_enqueue(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE o public.organizations%ROWTYPE; j public.scraping_jobs%ROWTYPE; old public.scraping_jobs%ROWTYPE;
  reserved numeric; budget numeric; active_jobs integer; settings jsonb;
BEGIN
  -- Lock the organization before testing capacity: concurrent requests cannot over-admit.
  SELECT * INTO o FROM public.organizations WHERE id=(p->>'org_id')::integer FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error',true,'http_status',404,'code','ORG_NOT_FOUND','message','Organization not found'); END IF;
  IF o.status IS DISTINCT FROM 'active' OR o.apify_status IS DISTINCT FROM 'active' OR nullif(o.apify_api_key,'') IS NULL THEN
    RETURN jsonb_build_object('error',true,'http_status',409,'code','ORG_NOT_READY','message','Organization and Apify connection must be active');
  END IF;
  IF p->>'source' NOT IN ('google_maps','yellow_pages') OR (p->>'max_results')::integer NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid gathering request'; END IF;
  budget := (p->>'max_cost_usd')::numeric;
  IF budget NOT BETWEEN 0.01 AND 10 OR nullif(p->>'request_id','') IS NULL THEN RAISE EXCEPTION 'Budget and request_id are required'; END IF;
  settings := jsonb_build_object('scrape_contacts',p->'scrape_contacts','website_filter',p->'website_filter','country_code',p->'country_code');
  SELECT * INTO old FROM public.scraping_jobs WHERE org_id=o.id AND request_id=p->>'request_id';
  IF FOUND THEN
    IF old.source IS DISTINCT FROM p->>'source' OR old.search_query IS DISTINCT FROM p->>'search_query' OR old.location IS DISTINCT FROM p->>'location' OR old.max_results IS DISTINCT FROM (p->>'max_results')::integer OR old.max_cost_usd IS DISTINCT FROM budget OR old.request_settings IS DISTINCT FROM settings THEN
      RETURN jsonb_build_object('error',true,'http_status',409,'code','REQUEST_ID_CONFLICT','message','request_id already belongs to another request');
    END IF;
    RETURN jsonb_build_object('error',false,'http_status',200,'job_id',old.id,'org_id',o.id,'source',old.source,'status',old.status,'replayed',true);
  END IF;
  SELECT count(*),coalesce(sum(max_cost_usd),0) INTO active_jobs,reserved FROM public.scraping_jobs WHERE org_id=o.id AND gathering_version=1 AND status IN ('pending','running','needs_review');
  IF active_jobs>=3 THEN RETURN jsonb_build_object('error',true,'http_status',409,'code','CONCURRENCY_LIMIT','message','Three managed jobs are active or awaiting review'); END IF;
  IF o.credits_remaining-reserved < budget THEN RETURN jsonb_build_object('error',true,'http_status',409,'code','INSUFFICIENT_CREDIT','message','Insufficient unreserved organization credit'); END IF;
  SELECT * INTO old FROM public.scraping_jobs WHERE org_id=o.id AND source=p->>'source' AND lower(search_query)=lower(p->>'search_query') AND lower(location)=lower(p->>'location') AND status='completed' AND completed_at>now()-interval '7 days' ORDER BY completed_at DESC LIMIT 1;
  INSERT INTO public.scraping_jobs(org_id,job_name,source,search_query,location,max_results,status,gathering_version,request_id,max_cost_usd,request_settings,heartbeat_at)
  VALUES(o.id,p->>'job_name',p->>'source',p->>'search_query',p->>'location',(p->>'max_results')::integer,'pending',1,p->>'request_id',budget,settings,now()) RETURNING * INTO j;
  RETURN jsonb_build_object('error',false,'http_status',202,'job_id',j.id,'org_id',o.id,'source',j.source,'status',j.status,'replayed',false,'recent_job_id',old.id,'max_cost_usd',budget);
END $$;

CREATE OR REPLACE FUNCTION public.gathering_claim(p_job integer,p_org integer,p_source text,p_execution text) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE j public.scraping_jobs%ROWTYPE; k text;
BEGIN
  SELECT * INTO j FROM public.scraping_jobs WHERE id=p_job AND org_id=p_org AND source=p_source AND gathering_version=1 FOR UPDATE;
  IF NOT FOUND OR j.status <> 'pending' THEN RETURN jsonb_build_object('claimed',false); END IF;
  SELECT apify_api_key INTO k FROM public.organizations WHERE id=p_org AND status='active' AND apify_status='active';
  IF nullif(k,'') IS NULL THEN
    UPDATE public.scraping_jobs SET status='failed',completed_at=now(),error_message='APIFY_NOT_CONNECTED' WHERE id=j.id;
    RETURN jsonb_build_object('claimed',false);
  END IF;
  UPDATE public.scraping_jobs SET status='running',started_at=now(),heartbeat_at=now(),execution_id=p_execution WHERE id=j.id RETURNING * INTO j;
  RETURN to_jsonb(j)||jsonb_build_object('claimed',true,'apify_api_key',k);
END $$;

CREATE OR REPLACE FUNCTION public.gathering_charge(p_job integer,p_org integer,p_amount numeric) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE prior numeric; inserted integer;
BEGIN
  IF p_amount IS NULL THEN RETURN; END IF;
  IF p_amount<0 THEN RAISE EXCEPTION 'Invalid cost'; END IF;
  PERFORM 1 FROM public.organizations WHERE id=p_org FOR UPDATE;
  SELECT coalesce(sum(amount_usd),0) INTO prior FROM public.gathering_costs WHERE org_id=p_org;
  INSERT INTO public.gathering_costs(job_id,org_id,amount_usd) VALUES(p_job,p_org,p_amount) ON CONFLICT(job_id) DO NOTHING;
  GET DIAGNOSTICS inserted=ROW_COUNT;
  IF inserted=1 THEN
    -- Existing account column has two decimal places. Carry fractional costs in the ledger.
    UPDATE public.organizations SET credits_used=credits_used+round(prior+p_amount,2)-round(prior,2) WHERE id=p_org;
    INSERT INTO public.credit_usage_log(org_id,action_type,credits_used,details) VALUES(p_org,'lead_gathering',p_amount,jsonb_build_object('job_id',p_job,'provider','apify'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.gathering_finish(p_job integer,p_org integer,p_rows jsonb,p_cost numeric,p_fetched integer,p_rejected integer) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE j public.scraping_jobs%ROWTYPE; r jsonb; inserted integer; total integer:=0; duplicates integer:=0;
BEGIN
  SELECT * INTO j FROM public.scraping_jobs WHERE id=p_job AND org_id=p_org AND gathering_version=1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown job'; END IF;
  IF j.status='completed' THEN RETURN jsonb_build_object('job_id',j.id,'total_leads',j.total_leads,'replayed',true); END IF;
  IF j.status<>'running' OR j.apify_actor_run_id IS NULL THEN RAISE EXCEPTION 'Job is not ready for completion'; END IF;
  IF jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>j.max_results THEN RAISE EXCEPTION 'Invalid result batch'; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    INSERT INTO public.staging_leads(job_id,org_id,source,company_name,phone,email,website,address,city,state,zip,country,category,raw_data,source_record_id,processing_status,processed)
    VALUES(j.id,j.org_id,j.source,r->>'company_name',r->>'phone',r->>'email',r->>'website',r->>'address',r->>'city',r->>'state',r->>'zip',r->>'country',r->>'category',r->'raw_data',r->>'source_record_id','pending',false)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS inserted=ROW_COUNT;
    total:=total+inserted; duplicates:=duplicates+(1-inserted);
  END LOOP;
  PERFORM public.gathering_charge(j.id,j.org_id,p_cost);
  UPDATE public.scraping_jobs SET status='completed',completed_at=now(),heartbeat_at=now(),total_leads=total,fetched_count=p_fetched,duplicate_count=duplicates,rejected_count=p_rejected,actual_cost=p_cost,cost_status=CASE WHEN p_cost IS NULL THEN 'unknown' ELSE 'reported' END,error_message=NULL WHERE id=j.id;
  RETURN jsonb_build_object('job_id',j.id,'status','completed','total_leads',total,'duplicates',duplicates,'rejected',p_rejected,'actual_cost',p_cost);
END $$;

CREATE OR REPLACE FUNCTION public.gathering_fail(p_job integer,p_org integer,p_code text,p_cost numeric) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE j public.scraping_jobs%ROWTYPE;
BEGIN
  SELECT * INTO j FROM public.scraping_jobs WHERE id=p_job AND org_id=p_org AND gathering_version=1 FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('updated',false); END IF;
  IF j.status NOT IN ('pending','running') THEN RETURN jsonb_build_object('updated',false,'status',j.status); END IF;
  PERFORM public.gathering_charge(j.id,j.org_id,p_cost);
  UPDATE public.scraping_jobs SET status=CASE WHEN p_code LIKE 'APIFY_%' AND p_code<>'APIFY_START_UNKNOWN' THEN 'failed' ELSE 'needs_review' END,completed_at=now(),heartbeat_at=now(),error_message=left(p_code,200),actual_cost=p_cost,cost_status=CASE WHEN p_cost IS NULL THEN 'unknown' ELSE 'reported' END WHERE id=j.id;
  RETURN jsonb_build_object('updated',true,'job_id',j.id,'code',p_code);
END $$;
CREATE OR REPLACE FUNCTION public.gathering_recover() RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE expired_pending integer; interrupted integer;
BEGIN
  UPDATE public.scraping_jobs SET status='failed',completed_at=now(),error_message='DISPATCH_EXPIRED'
  WHERE gathering_version=1 AND status='pending' AND created_at<now()-interval '10 minutes';
  GET DIAGNOSTICS expired_pending=ROW_COUNT;
  UPDATE public.scraping_jobs SET status='needs_review',completed_at=now(),error_message='WORKER_INTERRUPTED'
  WHERE gathering_version=1 AND status='running' AND heartbeat_at<now()-interval '20 minutes';
  GET DIAGNOSTICS interrupted=ROW_COUNT;
  RETURN jsonb_build_object('expired_pending',expired_pending,'interrupted',interrupted);
END $$;
COMMIT;
