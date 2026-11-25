-- Gathering controls and history. Existing leads and legacy job states are retained.
BEGIN;
ALTER TABLE scraping_jobs ADD COLUMN IF NOT EXISTS cancel_requested boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS reused_from_job_id integer REFERENCES scraping_jobs(id),
 ADD COLUMN IF NOT EXISTS partial_results boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS gathering_results (
 job_id integer NOT NULL REFERENCES scraping_jobs(id),
 ordinal integer NOT NULL,
 org_id integer NOT NULL REFERENCES organizations(id),
 lead_id integer REFERENCES staging_leads(id),
 disposition text NOT NULL CHECK(disposition IN ('new','existing','rejected','reused')),
 reason text,
 snapshot jsonb NOT NULL,
 PRIMARY KEY(job_id,ordinal)
);
CREATE INDEX IF NOT EXISTS gathering_results_org_job ON gathering_results(org_id,job_id);
-- A shared website or switchboard is not a branch identity. Keep provider identity
-- unique and serialize fallback matching under the organization lock below.
DROP INDEX IF EXISTS idx_staging_leads_org_phone;
DROP INDEX IF EXISTS idx_staging_leads_org_website;
DROP INDEX IF EXISTS idx_staging_leads_org_name_address;
CREATE INDEX IF NOT EXISTS gathering_phone_lookup ON staging_leads(org_id,phone);
CREATE INDEX IF NOT EXISTS gathering_name_lookup ON staging_leads(org_id,lower(company_name));

CREATE OR REPLACE FUNCTION gathering_norm(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT nullif(regexp_replace(lower(coalesce(t,'')),'[^[:alnum:]]','','g'),'')
$$;

CREATE OR REPLACE FUNCTION gathering_enqueue(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE o organizations%ROWTYPE; j scraping_jobs%ROWTYPE; old scraping_jobs%ROWTYPE;
 reserved numeric; budget numeric; active_jobs integer; settings jsonb; reused integer; request_settings_value jsonb;
BEGIN
 SELECT * INTO o FROM organizations WHERE id=(p->>'org_id')::integer FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error',true,'http_status',404,'code','ORG_NOT_FOUND'); END IF;
 IF o.status IS DISTINCT FROM 'active' THEN RETURN jsonb_build_object('error',true,'http_status',409,'code','ORG_NOT_READY'); END IF;
 IF p->>'source' NOT IN ('google_maps','yellow_pages') OR (p->>'max_results')::integer NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid gathering request'; END IF;
 budget:=(p->>'max_cost_usd')::numeric;
 IF budget IS NULL OR budget NOT BETWEEN 0.01 AND 10 OR nullif(p->>'request_id','') IS NULL THEN RAISE EXCEPTION 'Budget and request_id required'; END IF;
 settings:=jsonb_build_object('scrape_contacts',coalesce(p->'scrape_contacts','true'::jsonb),'website_filter',coalesce(p->'website_filter','"allPlaces"'::jsonb),'country_code',p->'country_code',
 'search_terms',coalesce(p->'search_terms',jsonb_build_array(p->>'search_query')),'locations',coalesce(p->'locations',jsonb_build_array(p->>'location')),
 'include_categories',coalesce(p->'include_categories','[]'::jsonb),'exclude_categories',coalesce(p->'exclude_categories','[]'::jsonb),'center',p->'center','radius_km',p->'radius_km',
 'require_contact',coalesce(p->'require_contact','false'::jsonb),'exclude_closed',coalesce(p->'exclude_closed','true'::jsonb));
 request_settings_value:=settings||jsonb_build_object('refresh',coalesce((p->>'refresh')::boolean,false),'reuse_hours',coalesce((p->>'reuse_hours')::integer,24));
 SELECT * INTO old FROM scraping_jobs WHERE org_id=o.id AND request_id=p->>'request_id';
 IF FOUND THEN
  IF old.source IS DISTINCT FROM p->>'source' OR old.max_results IS DISTINCT FROM (p->>'max_results')::integer OR old.max_cost_usd IS DISTINCT FROM budget OR old.request_settings IS DISTINCT FROM request_settings_value THEN
   RETURN jsonb_build_object('error',true,'http_status',409,'code','REQUEST_ID_CONFLICT');
  END IF;
  RETURN jsonb_build_object('error',false,'http_status',200,'job_id',old.id,'org_id',o.id,'source',old.source,'status',old.status,'replayed',true,'dispatch',false);
 END IF;
 IF NOT coalesce((p->>'refresh')::boolean,false) AND coalesce((p->>'reuse_hours')::integer,24)>0 THEN
  SELECT id INTO reused FROM scraping_jobs WHERE org_id=o.id AND source=p->>'source' AND status='completed' AND NOT partial_results AND reused_from_job_id IS NULL
   AND request_settings-'refresh'-'reuse_hours'=settings AND max_results=(p->>'max_results')::integer
   AND completed_at>now()-make_interval(hours=>coalesce((p->>'reuse_hours')::integer,24))
   ORDER BY completed_at DESC LIMIT 1;
 END IF;
 IF reused IS NULL THEN
  IF o.apify_status IS DISTINCT FROM 'active' OR nullif(o.apify_api_key,'') IS NULL THEN RETURN jsonb_build_object('error',true,'http_status',409,'code','APIFY_NOT_CONNECTED'); END IF;
  SELECT count(*),coalesce(sum(max_cost_usd),0) INTO active_jobs,reserved FROM scraping_jobs WHERE org_id=o.id AND gathering_version=1 AND status IN ('pending','running','needs_review');
  IF active_jobs>=3 THEN RETURN jsonb_build_object('error',true,'http_status',409,'code','CONCURRENCY_LIMIT'); END IF;
  IF o.credits_remaining-reserved<budget THEN RETURN jsonb_build_object('error',true,'http_status',409,'code','INSUFFICIENT_CREDIT'); END IF;
 END IF;
 INSERT INTO scraping_jobs(org_id,job_name,source,search_query,location,max_results,status,gathering_version,request_id,max_cost_usd,request_settings,heartbeat_at,reused_from_job_id)
 VALUES(o.id,p->>'job_name',p->>'source',p->>'search_query',p->>'location',(p->>'max_results')::integer,CASE WHEN reused IS NULL THEN 'pending' ELSE 'completed' END,1,p->>'request_id',budget,request_settings_value,now(),reused) RETURNING * INTO j;
 IF reused IS NOT NULL THEN
  INSERT INTO gathering_results SELECT j.id,ordinal,o.id,lead_id,CASE WHEN disposition='rejected' THEN 'rejected' ELSE 'reused' END,reason,snapshot FROM gathering_results WHERE job_id=reused AND org_id=o.id;
  UPDATE scraping_jobs SET completed_at=now(),total_leads=0,duplicate_count=(SELECT count(*) FROM gathering_results WHERE job_id=j.id AND lead_id IS NOT NULL),rejected_count=(SELECT count(*) FROM gathering_results WHERE job_id=j.id AND disposition='rejected'),fetched_count=(SELECT fetched_count FROM scraping_jobs WHERE id=reused),actual_cost=0,cost_status='reused' WHERE id=j.id;
 END IF;
 RETURN jsonb_build_object('error',false,'http_status',CASE WHEN reused IS NULL THEN 202 ELSE 200 END,'job_id',j.id,'org_id',o.id,'source',j.source,'status',j.status,'replayed',false,'dispatch',reused IS NULL,'reused_from_job_id',reused,'max_cost_usd',budget);
END $$;

CREATE OR REPLACE FUNCTION gathering_claim(p_job integer,p_org integer,p_source text,p_execution text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE j scraping_jobs%ROWTYPE; k text;
BEGIN
 SELECT apify_api_key INTO k FROM organizations WHERE id=p_org AND status='active' AND apify_status='active' FOR UPDATE;
 IF nullif(k,'') IS NULL THEN RETURN jsonb_build_object('claimed',false); END IF;
 SELECT * INTO j FROM scraping_jobs WHERE id=p_job AND org_id=p_org AND source=p_source AND gathering_version=1 FOR UPDATE;
 IF NOT FOUND OR j.status<>'pending' THEN RETURN jsonb_build_object('claimed',false); END IF;
 UPDATE scraping_jobs SET status='running',started_at=coalesce(started_at,now()),heartbeat_at=now(),execution_id=p_execution,completed_at=NULL WHERE id=j.id RETURNING * INTO j;
 RETURN to_jsonb(j)||jsonb_build_object('claimed',true,'apify_api_key',k);
END $$;

CREATE OR REPLACE FUNCTION gathering_control(p_job integer,p_org integer,p_action text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE j scraping_jobs%ROWTYPE; dispatch boolean:=false;
BEGIN
 PERFORM 1 FROM organizations WHERE id=p_org FOR UPDATE;
 SELECT * INTO j FROM scraping_jobs WHERE id=p_job AND org_id=p_org AND gathering_version=1 FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error',true,'http_status',404,'code','JOB_NOT_FOUND'); END IF;
 IF p_action NOT IN ('resume','cancel') THEN RETURN jsonb_build_object('error',true,'http_status',400,'code','INVALID_ACTION'); END IF;
 IF j.status IN ('completed','failed','cancelled') THEN RETURN jsonb_build_object('error',true,'http_status',409,'code','JOB_TERMINAL'); END IF;
 IF p_action='resume' THEN
  IF j.status<>'needs_review' OR j.apify_actor_run_id IS NULL OR j.dataset_id IS NULL THEN RETURN jsonb_build_object('error',true,'http_status',409,'code','RUN_NOT_RESUMABLE','message','Only interrupted jobs with saved provider identities can resume'); END IF;
  UPDATE scraping_jobs SET status='pending',heartbeat_at=now(),error_message=NULL WHERE id=j.id; dispatch:=true;
 ELSE
  IF j.status='needs_review' AND j.apify_actor_run_id IS NULL THEN RETURN jsonb_build_object('error',true,'http_status',409,'code','RUN_ID_UNKNOWN','message','Check Apify before releasing an ambiguous paid-start reservation'); END IF;
  IF j.status='pending' AND j.apify_actor_run_id IS NULL THEN
   UPDATE scraping_jobs SET status='cancelled',cancel_requested=true,completed_at=now(),actual_cost=0,cost_status='not_started' WHERE id=j.id;
  ELSE
   dispatch:=j.status='needs_review';
   UPDATE scraping_jobs SET cancel_requested=true,status=CASE WHEN dispatch THEN 'pending' ELSE status END,heartbeat_at=CASE WHEN dispatch THEN now() ELSE heartbeat_at END WHERE id=j.id;
  END IF;
 END IF;
 RETURN jsonb_build_object('error',false,'http_status',202,'job_id',j.id,'org_id',p_org,'source',j.source,'action',p_action,'dispatch',dispatch,'replayed',NOT dispatch);
END $$;

CREATE OR REPLACE FUNCTION gathering_worker_failed(p_job integer,p_org integer,p_code text,p_cost numeric,p_execution text) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
 -- Preserve the saved run for resume even when result retrieval/finalization failed
 -- after the provider completed. Charge only after terminal results are reconciled.
 UPDATE scraping_jobs SET status='needs_review',error_message=left(p_code,200),heartbeat_at=now(),actual_cost=p_cost,cost_status='unreconciled'
 WHERE id=p_job AND org_id=p_org AND gathering_version=1 AND status='running' AND execution_id=p_execution;
 RETURN jsonb_build_object('updated',FOUND);
END $$;

CREATE OR REPLACE FUNCTION gathering_recover() RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE expired_pending integer; interrupted integer;
BEGIN
 UPDATE scraping_jobs SET status=CASE WHEN apify_actor_run_id IS NULL THEN 'failed' ELSE 'needs_review' END,completed_at=now(),error_message='DISPATCH_EXPIRED'
 WHERE gathering_version=1 AND status='pending' AND heartbeat_at<now()-interval '10 minutes';
 GET DIAGNOSTICS expired_pending=ROW_COUNT;
 UPDATE scraping_jobs SET status='needs_review',error_message='WORKER_INTERRUPTED'
 WHERE gathering_version=1 AND status='running' AND heartbeat_at<now()-interval '20 minutes';
 GET DIAGNOSTICS interrupted=ROW_COUNT;
 RETURN jsonb_build_object('expired_pending',expired_pending,'interrupted',interrupted);
END $$;

CREATE OR REPLACE FUNCTION gathering_finish_v2(p_job integer,p_org integer,p_rows jsonb,p_cost numeric,p_fetched integer,p_excluded jsonb,p_terminal text,p_execution text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE j scraping_jobs%ROWTYPE; r jsonb; lead integer; total integer:=0; duplicates integer:=0; seq integer:=0; state text; why text;
BEGIN
 PERFORM 1 FROM organizations WHERE id=p_org FOR UPDATE;
 SELECT * INTO j FROM scraping_jobs WHERE id=p_job AND org_id=p_org AND gathering_version=1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown job'; END IF;
 IF j.status IN ('completed','cancelled','failed') THEN RETURN jsonb_build_object('job_id',j.id,'replayed',true); END IF;
 IF p_execution IS NOT NULL AND j.execution_id IS DISTINCT FROM p_execution THEN RAISE EXCEPTION 'Worker lease replaced'; END IF;
 IF j.status<>'running' OR j.apify_actor_run_id IS NULL THEN RAISE EXCEPTION 'Job not ready'; END IF;
 IF p_terminal NOT IN ('SUCCEEDED','ABORTED','FAILED','TIMED-OUT') OR jsonb_typeof(p_rows)<>'array' OR jsonb_typeof(p_excluded)<>'array' OR jsonb_array_length(p_rows)>j.max_results THEN RAISE EXCEPTION 'Invalid result batch'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  lead:=NULL; why:=NULL;
  SELECT s.id,CASE WHEN s.source=j.source AND s.source_record_id=r->>'source_record_id' THEN 'provider_identity' ELSE 'name_address_or_phone' END INTO lead,why
   FROM staging_leads s WHERE s.org_id=p_org AND (
    (nullif(r->>'source_record_id','') IS NOT NULL AND s.source=j.source AND s.source_record_id=r->>'source_record_id') OR
    (NOT (s.source=j.source AND s.source_record_id IS NOT NULL AND nullif(r->>'source_record_id','') IS NOT NULL AND s.source_record_id<>r->>'source_record_id') AND
     gathering_norm(s.company_name)=gathering_norm(r->>'company_name') AND (
      (gathering_norm(s.address)=gathering_norm(r->>'address') AND (gathering_norm(s.city)=gathering_norm(r->>'city') OR s.city IS NULL OR r->>'city' IS NULL)) OR
      (gathering_norm(s.phone)=gathering_norm(r->>'phone') AND (gathering_norm(s.address)=gathering_norm(r->>'address') OR (s.address IS NULL AND r->>'address' IS NULL)))
     ))) ORDER BY (s.source=j.source AND s.source_record_id=r->>'source_record_id') DESC NULLS LAST,s.id LIMIT 1;
  IF lead IS NULL THEN
   INSERT INTO staging_leads(job_id,org_id,source,company_name,phone,email,website,address,city,state,zip,country,category,raw_data,source_record_id,processing_status,processed)
    VALUES(j.id,p_org,j.source,r->>'company_name',r->>'phone',r->>'email',r->>'website',r->>'address',r->>'city',r->>'state',r->>'zip',r->>'country',r->>'category',r->'raw_data',r->>'source_record_id','pending',false) RETURNING id INTO lead;
   total:=total+1;state:='new';
  ELSE duplicates:=duplicates+1;state:='existing'; END IF;
  INSERT INTO gathering_results VALUES(j.id,coalesce((r->>'ordinal')::integer,seq),p_org,lead,state,why,r);seq:=seq+1;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(p_excluded) LOOP
  INSERT INTO gathering_results VALUES(j.id,coalesce((r->>'ordinal')::integer,seq),p_org,NULL,'rejected',r->>'reason',r);seq:=seq+1;
 END LOOP;
 PERFORM gathering_charge(j.id,p_org,p_cost);
 state:=CASE WHEN j.cancel_requested THEN 'cancelled' WHEN p_terminal='SUCCEEDED' THEN 'completed' ELSE 'failed' END;
 UPDATE scraping_jobs SET status=state,partial_results=(state<>'completed'),completed_at=now(),heartbeat_at=now(),total_leads=total,fetched_count=p_fetched,duplicate_count=duplicates,rejected_count=jsonb_array_length(p_excluded),actual_cost=p_cost,cost_status=CASE WHEN p_cost IS NULL THEN 'unknown' ELSE 'reported' END,error_message=CASE WHEN state='completed' THEN NULL ELSE 'APIFY_'||p_terminal END WHERE id=j.id;
 RETURN jsonb_build_object('job_id',j.id,'status',state,'total_leads',total,'duplicates',duplicates,'rejected',jsonb_array_length(p_excluded),'actual_cost',p_cost,'partial_results',state<>'completed');
END $$;

CREATE OR REPLACE FUNCTION gathering_report(p_job integer,p_org integer) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('job_id',j.id,'org_id',j.org_id,'source',j.source,'status',j.status,'new_leads',j.total_leads,'existing_matches',j.duplicate_count,'rejected',j.rejected_count,'fetched',j.fetched_count,'actual_cost',j.actual_cost,'cost_status',j.cost_status,'reused_from_job_id',j.reused_from_job_id,'partial_results',j.partial_results,'cancel_requested',j.cancel_requested,'error',j.error_message,'duration_seconds',extract(epoch FROM coalesce(j.completed_at,now())-j.started_at),
 'unique_leads',q.unique_leads,'phone_coverage',q.phone_coverage,'email_coverage',q.email_coverage,'website_coverage',q.website_coverage,
 'relevance_rate',CASE WHEN j.fetched_count>0 THEN (j.fetched_count-j.rejected_count)::numeric/j.fetched_count ELSE NULL END,
 'cost_per_unique_lead',CASE WHEN q.unique_leads>0 THEN coalesce((SELECT amount_usd FROM gathering_costs WHERE job_id=j.id),j.actual_cost)/q.unique_leads ELSE NULL END,
 'exclusion_reasons',(SELECT coalesce(jsonb_object_agg(reason,n),'{}'::jsonb) FROM (SELECT reason,count(*) n FROM gathering_results WHERE job_id=j.id AND disposition='rejected' GROUP BY reason) e))
 FROM scraping_jobs j CROSS JOIN LATERAL (
  SELECT count(*) unique_leads,avg((nullif(snapshot->>'phone','') IS NOT NULL)::integer) phone_coverage,avg((nullif(snapshot->>'email','') IS NOT NULL)::integer) email_coverage,avg((nullif(snapshot->>'website','') IS NOT NULL)::integer) website_coverage
  FROM (SELECT DISTINCT ON (lead_id) lead_id,snapshot FROM gathering_results WHERE job_id=j.id AND lead_id IS NOT NULL ORDER BY lead_id,ordinal) u
 ) q WHERE j.id=p_job AND j.org_id=p_org
$$;
CREATE OR REPLACE FUNCTION gathering_source_report(p_org integer) RETURNS jsonb LANGUAGE sql STABLE AS $$
 WITH jobs AS (
  SELECT j.*,coalesce(c.amount_usd,j.actual_cost) AS precise_cost FROM scraping_jobs j LEFT JOIN gathering_costs c ON c.job_id=j.id
  WHERE j.org_id=p_org AND j.gathering_version=1 AND j.created_at>now()-interval '30 days'
 ), contacts AS (
  SELECT source,count(*) unique_leads,avg((nullif(snapshot->>'phone','') IS NOT NULL)::integer) phone_coverage,
   avg((nullif(snapshot->>'email','') IS NOT NULL)::integer) email_coverage,avg((nullif(snapshot->>'website','') IS NOT NULL)::integer) website_coverage
  FROM (SELECT DISTINCT ON(j.source,r.lead_id) j.source,r.lead_id,r.snapshot FROM jobs j JOIN gathering_results r ON r.job_id=j.id WHERE r.lead_id IS NOT NULL ORDER BY j.source,r.lead_id,j.completed_at DESC,r.ordinal) u GROUP BY source
 ), totals AS (
  SELECT source,count(*) searches,count(*) FILTER(WHERE reused_from_job_id IS NOT NULL) reused_searches,count(*) FILTER(WHERE status='completed') completed_searches,
   sum(fetched_count) fetched,sum(rejected_count) excluded,sum(total_leads) new_leads,sum(duplicate_count) existing_matches,sum(precise_cost) reported_cost,
   count(*) FILTER(WHERE actual_cost IS NULL) unknown_cost_searches,avg(extract(epoch FROM completed_at-started_at)) average_duration_seconds
  FROM jobs GROUP BY source
 ) SELECT coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object('unique_leads',coalesce(c.unique_leads,0),'phone_coverage',c.phone_coverage,'email_coverage',c.email_coverage,'website_coverage',c.website_coverage,
   'relevance_rate',CASE WHEN t.fetched>0 THEN (t.fetched-t.excluded)::numeric/t.fetched END)), '[]'::jsonb)
 FROM totals t LEFT JOIN contacts c USING(source)
$$;
COMMIT;
