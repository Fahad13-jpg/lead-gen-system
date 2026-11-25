BEGIN;
ALTER TABLE lead_contacts ADD COLUMN IF NOT EXISTS relevance_status text NOT NULL DEFAULT 'unassessed' CHECK(relevance_status IN ('unassessed','eligible','review','excluded'));
ALTER TABLE contact_tasks ADD COLUMN IF NOT EXISTS input_fingerprint text;
CREATE OR REPLACE FUNCTION contact_input_fingerprint(p_org integer,p_lead integer,p_staging integer) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT md5(jsonb_build_object('name',c.company_name,'website',c.website,'email',c.email,'phone',c.phone,'raw',s.raw_data)::text)
 FROM cleaned_leads c JOIN cleaning_links l ON l.cleaned_id=c.id AND l.org_id=c.org_id JOIN staging_leads s ON s.id=l.staging_id AND s.org_id=l.org_id
 WHERE c.id=p_lead AND c.org_id=p_org AND s.id=p_staging
$$;
CREATE TABLE IF NOT EXISTS contact_social_policy (
 org_id integer PRIMARY KEY REFERENCES organizations(id), enabled boolean NOT NULL DEFAULT false,
 account_id bigint REFERENCES gathering_accounts(id),monthly_cap_usd numeric NOT NULL DEFAULT 0.50 CHECK(monthly_cap_usd>=0)
);
CREATE TABLE IF NOT EXISTS contact_social_jobs (
 id bigserial PRIMARY KEY,org_id integer NOT NULL REFERENCES organizations(id),lead_id integer NOT NULL REFERENCES cleaned_leads(id),staging_id integer NOT NULL REFERENCES staging_leads(id),
 profile text NOT NULL,input_fingerprint text NOT NULL,status text NOT NULL DEFAULT 'pending',reason text,
 account_id bigint REFERENCES gathering_accounts(id),max_cost_usd numeric NOT NULL DEFAULT 0.05,actual_cost_usd numeric,
 run_id text UNIQUE,dataset_id text,result jsonb,created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,
 UNIQUE(org_id,lead_id,profile,input_fingerprint)
);
CREATE UNIQUE INDEX IF NOT EXISTS contact_social_inflight ON contact_social_jobs(org_id,profile) WHERE status IN ('starting','running','needs_review');
CREATE TABLE IF NOT EXISTS contact_social_cache (
 org_id integer NOT NULL REFERENCES organizations(id),profile text NOT NULL,result jsonb NOT NULL,checked_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,
 PRIMARY KEY(org_id,profile)
);
REVOKE ALL ON contact_social_policy,contact_social_jobs,contact_social_cache FROM PUBLIC;

CREATE OR REPLACE FUNCTION contact_sync() RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
 UPDATE cleaned_leads c SET email_valid=false,email_verification_status='expired'
 FROM lead_contacts e WHERE e.lead_id=c.id AND e.org_id=c.org_id AND e.email=lower(trim(c.email)) AND e.expires_at<=now() AND c.email_valid=true;
 UPDATE contact_tasks t SET status='pending',attempts=0,next_attempt=now(),lease=NULL,lease_until=NULL
 FROM lead_contacts e WHERE e.id=t.contact_id AND e.expires_at<=now() AND t.status IN ('verified','invalid','risky','unknown','cached');
 UPDATE lead_contacts SET status='pending' WHERE expires_at<=now() AND status IN ('verified','invalid','risky','unknown');
 UPDATE contact_tasks t SET status='pending',attempts=0,next_attempt=now(),input_fingerprint=contact_input_fingerprint(t.org_id,t.lead_id,t.staging_id)
 WHERE t.kind='discovery' AND t.status<>'processing' AND t.input_fingerprint IS DISTINCT FROM contact_input_fingerprint(t.org_id,t.lead_id,t.staging_id)
 AND contact_eligible(t.org_id,t.lead_id,t.staging_id) AND EXISTS(SELECT 1 FROM cleaned_leads c WHERE c.id=t.lead_id AND coalesce(NULLIF(trim(c.website),''),'record-only')=t.source_value);
 -- Never migrate or spend on ownership-review records or orphaned historical rows.
 INSERT INTO lead_contacts(org_id,lead_id,email,score,method)
 SELECT DISTINCT c.org_id,c.id,lower(trim(c.email)),90,'existing_record' FROM cleaned_leads c
 JOIN cleaning_links l ON l.cleaned_id=c.id AND l.org_id=c.org_id
 WHERE NULLIF(trim(c.email),'') IS NOT NULL AND contact_eligible(l.org_id,l.cleaned_id,l.staging_id)
 ON CONFLICT(org_id,lead_id,email) DO NOTHING;
 INSERT INTO contact_tasks(org_id,lead_id,staging_id,kind,source_value)
 SELECT DISTINCT ON(c.id) c.org_id,c.id,s.id,'discovery',coalesce(NULLIF(trim(c.website),''),'record-only') FROM cleaned_leads c
 JOIN cleaning_links l ON l.cleaned_id=c.id AND l.org_id=c.org_id JOIN staging_leads s ON s.id=l.staging_id
 WHERE contact_eligible(l.org_id,l.cleaned_id,l.staging_id)
 ORDER BY c.id,s.id ON CONFLICT(org_id,lead_id,kind,source_value) DO NOTHING;
 -- Every contact candidate has one shared verification path, including future inferred candidates.
 INSERT INTO contact_tasks(org_id,lead_id,staging_id,contact_id,kind,source_value)
 SELECT DISTINCT ON(c.id) c.org_id,c.lead_id,l.staging_id,c.id,'verification',c.email FROM lead_contacts c
 JOIN cleaning_links l ON l.cleaned_id=c.lead_id AND l.org_id=c.org_id
 WHERE contact_eligible(l.org_id,l.cleaned_id,l.staging_id) AND c.status='pending'
 ORDER BY c.id,l.staging_id ON CONFLICT(org_id,lead_id,kind,source_value) DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;RETURN n;
END $$;
CREATE OR REPLACE FUNCTION contact_claim(p_kind text,p_limit integer DEFAULT 5) RETURNS SETOF jsonb LANGUAGE plpgsql AS $$
DECLARE cfg contact_controls%ROWTYPE;t contact_tasks%ROWTYPE;cached contact_verification_cache%ROWTYPE;r record;used integer;running integer;
BEGIN
 IF p_kind NOT IN ('discovery','verification') THEN RAISE EXCEPTION 'Invalid kind'; END IF;
 SELECT * INTO cfg FROM contact_controls WHERE id FOR UPDATE;
 IF (p_kind='discovery' AND NOT cfg.discovery_enabled) OR (p_kind='verification' AND (NOT cfg.verification_enabled OR cfg.provider_pause IS NOT NULL)) THEN RETURN;END IF;
 PERFORM contact_sync();
 UPDATE contact_tasks SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'pending' END,lease=NULL,lease_until=NULL,
  next_attempt=now()+interval '1 minute',last_error='lease_expired' WHERE kind=p_kind AND status='processing' AND lease_until<now();
 SELECT count(*) INTO used FROM contact_attempts WHERE kind='verification' AND reserved_at>=date_trunc('month',now());
 SELECT count(*) INTO running FROM contact_tasks WHERE kind=p_kind AND status='processing';
 FOR r IN SELECT id FROM (
  SELECT q.id,row_number() OVER(PARTITION BY q.org_id ORDER BY q.id) AS turn,
   coalesce((SELECT max(a.reserved_at) FROM contact_attempts a WHERE a.org_id=q.org_id AND a.kind=p_kind),'-infinity'::timestamptz) AS last_served FROM contact_tasks q
  WHERE q.kind=p_kind AND q.status='pending' AND q.next_attempt<=now()
  AND contact_eligible(q.org_id,q.lead_id,q.staging_id)
  AND (p_kind<>'verification' OR EXISTS(SELECT 1 FROM lead_contacts e WHERE e.id=q.contact_id AND e.relevance_status='eligible'))
  AND (p_kind<>'verification' OR NOT EXISTS(SELECT 1 FROM lead_contacts e WHERE e.org_id=q.org_id AND e.lead_id=q.lead_id AND e.relevance_status='eligible' AND e.status='verified' AND e.expires_at>now()))
  AND (p_kind<>'verification' OR q.contact_id=(SELECT e.id FROM lead_contacts e JOIN contact_tasks et ON et.contact_id=e.id AND et.status='pending' WHERE e.org_id=q.org_id AND e.lead_id=q.lead_id AND e.relevance_status='eligible' ORDER BY e.score DESC,e.id LIMIT 1))
  AND NOT EXISTS(SELECT 1 FROM unsubscribes u JOIN cleaned_leads c ON c.id=q.lead_id WHERE lower(trim(u.email))=lower(trim(c.email)))
  AND (cfg.staging_ids IS NULL OR q.staging_id=ANY(cfg.staging_ids))
 ) ranked ORDER BY turn,last_served,id LIMIT greatest(1,least(p_limit,10)) LOOP
  IF running >= (CASE WHEN p_kind='discovery' THEN 3 ELSE 1 END) THEN EXIT;END IF;
  SELECT * INTO t FROM contact_tasks WHERE id=r.id AND status='pending' FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE;END IF;
  IF p_kind='discovery' AND NOT EXISTS(SELECT 1 FROM cleaned_leads WHERE id=t.lead_id AND org_id=t.org_id AND coalesce(NULLIF(trim(website),''),'record-only')=t.source_value) THEN
   UPDATE contact_tasks SET status='superseded',completed_at=now() WHERE id=t.id;CONTINUE;
  END IF;
  IF p_kind='verification' THEN
   SELECT * INTO cached FROM contact_verification_cache WHERE org_id=t.org_id AND email=t.source_value AND expires_at>now();
   IF FOUND THEN
    UPDATE lead_contacts SET status=cached.status,verification=cached.evidence,verified_at=cached.checked_at,expires_at=cached.expires_at WHERE id=t.contact_id AND org_id=t.org_id;
    UPDATE contact_tasks SET status='cached',completed_at=now() WHERE id=t.id;
    PERFORM contact_promote(t.org_id,t.lead_id);CONTINUE;
   END IF;
   -- One uncached request per minute by default: safe for small provider plans.
   IF used>=cfg.monthly_requests OR cfg.last_provider_claim>now()-interval '1 second' THEN CONTINUE;END IF;
  END IF;
  UPDATE contact_tasks SET status='processing',attempts=attempts+1,lease=md5(random()::text||clock_timestamp()::text),lease_until=now()+interval '5 minutes'
   WHERE id=t.id RETURNING * INTO t;
  UPDATE contact_tasks SET input_fingerprint=contact_input_fingerprint(t.org_id,t.lead_id,t.staging_id) WHERE id=t.id;
  INSERT INTO contact_attempts(lease,task_id,org_id,kind) VALUES(t.lease,t.id,t.org_id,p_kind);
  running:=running+1;
  RETURN NEXT jsonb_build_object('id',t.id,'lease',t.lease,'kind',t.kind);
  IF p_kind='verification' THEN UPDATE contact_controls SET last_provider_claim=now() WHERE id;EXIT;END IF;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION contact_promote(p_org integer,p_lead integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE c cleaned_leads%ROWTYPE;best lead_contacts%ROWTYPE;existing lead_contacts%ROWTYPE;
BEGIN
 SELECT * INTO c FROM cleaned_leads WHERE id=p_lead AND org_id=p_org FOR UPDATE;
 IF NOT FOUND THEN RETURN;END IF;
 SELECT * INTO existing FROM lead_contacts WHERE org_id=p_org AND lead_id=p_lead AND email=lower(trim(c.email));
 IF FOUND AND existing.verified_at IS NOT NULL THEN
  UPDATE cleaned_leads SET email_valid=existing.relevance_status='eligible' AND existing.status='verified' AND existing.expires_at>now(),
   email_verification_status=CASE WHEN existing.expires_at<=now() THEN 'expired' WHEN existing.status='verified' THEN 'valid' ELSE existing.status END WHERE id=p_lead AND org_id=p_org AND lower(trim(email))=existing.email;
 END IF;
 -- A replacement is allowed only for an empty address or an explicitly invalid current address.
 IF NULLIF(trim(c.email),'') IS NULL OR existing.status='invalid' THEN
  SELECT * INTO best FROM lead_contacts WHERE org_id=p_org AND lead_id=p_lead AND relevance_status='eligible' AND status='verified' AND expires_at>now() ORDER BY score DESC,id LIMIT 1;
  IF FOUND THEN
   UPDATE cleaned_leads SET email=best.email,email_valid=true,email_verification_status='valid' WHERE id=p_lead AND org_id=p_org;
   -- Preserve raw source values; the verified contact and evidence live on the canonical lead.
  END IF;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION contact_finish(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE t contact_tasks%ROWTYPE;a contact_attempts%ROWTYPE;item jsonb;v_outcome text;expiry timestamptz;
BEGIN
 SELECT * INTO t FROM contact_tasks WHERE id=(p->>'id')::bigint FOR UPDATE;
 IF NOT FOUND OR t.lease IS DISTINCT FROM p->>'lease' THEN RETURN '{"saved":false,"error":"STALE_LEASE"}';END IF;
 SELECT * INTO a FROM contact_attempts WHERE lease=t.lease;
 IF a.finished_at IS NOT NULL THEN RETURN jsonb_build_object('saved',true,'replayed',true,'status',a.outcome);END IF;
 IF t.status<>'processing' OR t.lease_until<now() THEN RETURN '{"saved":false,"error":"STALE_LEASE"}';END IF;
 v_outcome:=p->>'status';
 IF t.kind='discovery' AND t.input_fingerprint IS DISTINCT FROM contact_input_fingerprint(t.org_id,t.lead_id,t.staging_id) THEN v_outcome:='superseded';END IF;
 IF NOT contact_eligible(t.org_id,t.lead_id,t.staging_id) THEN v_outcome:='superseded'; END IF;
 IF t.kind='discovery' AND NOT EXISTS(SELECT 1 FROM cleaned_leads WHERE id=t.lead_id AND org_id=t.org_id AND coalesce(NULLIF(trim(website),''),'record-only')=t.source_value) THEN v_outcome:='superseded';END IF;
 IF v_outcome NOT IN ('found','not_found','blocked','retry','verified','invalid','risky','unknown','superseded') THEN RAISE EXCEPTION 'Invalid outcome';END IF;
 IF v_outcome='retry' THEN
  UPDATE contact_tasks SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'pending' END,next_attempt=now()+make_interval(secs=>60*power(2,attempts)::integer),last_error=left(p->>'error',100) WHERE id=t.id;
  IF t.kind='verification' AND coalesce((p->>'pause')::boolean,false) THEN UPDATE contact_controls SET provider_pause=left(p->>'error',100) WHERE id;END IF;
 ELSIF t.kind='discovery' AND v_outcome='found' THEN
  FOR item IN SELECT value FROM jsonb_array_elements(p->'candidates') LIMIT 20 LOOP
   IF length(item->>'email')>254 OR item->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN CONTINUE;END IF;
   INSERT INTO lead_contacts(org_id,lead_id,email,score,method,evidence,status,relevance_status)
    VALUES(t.org_id,t.lead_id,item->>'email',least(100,greatest(0,(item->>'score')::integer)),CASE WHEN item->>'method'='source_record' THEN 'source_record' ELSE 'published_website' END,jsonb_build_array(item),CASE WHEN item->>'relevance_status'='eligible' THEN 'pending' ELSE 'review' END,CASE WHEN item->>'relevance_status' IN ('eligible','review','excluded') THEN item->>'relevance_status' ELSE 'review' END)
    ON CONFLICT(org_id,lead_id,email) DO UPDATE SET score=excluded.score,relevance_status=excluded.relevance_status,status=CASE WHEN excluded.relevance_status<>'eligible' THEN 'review' WHEN lead_contacts.status='review' THEN 'pending' ELSE lead_contacts.status END,evidence=CASE WHEN lead_contacts.evidence @> excluded.evidence THEN lead_contacts.evidence ELSE lead_contacts.evidence||excluded.evidence END;
  END LOOP;
  UPDATE contact_tasks SET status='found',completed_at=now() WHERE id=t.id;
 ELSE
  UPDATE contact_tasks SET status=v_outcome,completed_at=now(),last_error=left(p->>'error',100) WHERE id=t.id;
  IF t.kind='verification' AND v_outcome IN ('verified','invalid','risky','unknown') THEN
   expiry:=now()+CASE WHEN v_outcome IN ('verified','invalid') THEN interval '7 days' ELSE interval '1 day' END;
   UPDATE lead_contacts SET status=v_outcome,verification=p->'evidence',verified_at=now(),expires_at=expiry WHERE id=t.contact_id AND org_id=t.org_id AND email=t.source_value;
   INSERT INTO contact_verification_cache(org_id,email,status,evidence,expires_at) VALUES(t.org_id,t.source_value,v_outcome,coalesce(p->'evidence','{}'),expiry)
    ON CONFLICT(org_id,email) DO UPDATE SET status=excluded.status,evidence=excluded.evidence,checked_at=now(),expires_at=excluded.expires_at;
   PERFORM contact_promote(t.org_id,t.lead_id);
  END IF;
 END IF;
 IF t.kind='discovery' AND v_outcome<>'superseded' AND coalesce((p->>'relevant_candidate_count')::integer,0)=0 AND p->>'facebook_profile' ~ '^https://www[.]facebook[.]com/' THEN
  INSERT INTO contact_social_jobs(org_id,lead_id,staging_id,profile,input_fingerprint)
  VALUES(t.org_id,t.lead_id,t.staging_id,p->>'facebook_profile',t.input_fingerprint)
  ON CONFLICT(org_id,lead_id,profile,input_fingerprint) DO NOTHING;
 END IF;
 UPDATE contact_attempts SET finished_at=now(),outcome=v_outcome,result=p-'lease' WHERE lease=t.lease;
 RETURN jsonb_build_object('saved',true,'id',t.id,'status',v_outcome);
END $$;
CREATE OR REPLACE FUNCTION gathering_account_spent(p_account bigint) RETURNS numeric LANGUAGE sql STABLE AS $$
 SELECT (SELECT coalesce(sum(c.amount_usd),0) FROM gathering_costs c JOIN scraping_jobs j ON j.id=c.job_id JOIN gathering_accounts a ON a.id=p_account
 WHERE c.recorded_at>=date_trunc('month',now()) AND (j.provider_account_id=a.id OR (j.billing_mode IS NULL AND a.mode='byok' AND j.org_id=a.org_id)))
 + (SELECT coalesce(sum(coalesce(actual_cost_usd,max_cost_usd)),0) FROM apify_diagnostic_runs WHERE provider_account_id=p_account
 AND (created_at>=date_trunc('month',now()) OR actual_cost_usd IS NULL))
 + (SELECT coalesce(sum(coalesce(actual_cost_usd,max_cost_usd)),0) FROM contact_social_jobs WHERE account_id=p_account AND status IN ('starting','running','needs_review','completed','failed','superseded') AND (created_at>=date_trunc('month',now()) OR actual_cost_usd IS NULL))
$$;
CREATE TABLE IF NOT EXISTS contact_social_controls(id boolean PRIMARY KEY DEFAULT true CHECK(id),enabled boolean NOT NULL DEFAULT false,monthly_cap_usd numeric NOT NULL DEFAULT 0.50 CHECK(monthly_cap_usd>=0));
INSERT INTO contact_social_controls(id) VALUES(true) ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION contact_social_reserve(p_id bigint) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE j contact_social_jobs%ROWTYPE;p contact_social_policy%ROWTYPE;a gathering_accounts%ROWTYPE;cfg contact_social_controls%ROWTYPE;reserved numeric;wallet numeric;charge numeric;spent numeric;
BEGIN
 SELECT * INTO j FROM contact_social_jobs WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR j.status NOT IN ('pending','disabled','budget_blocked') THEN RETURN '{"ready":false}';END IF;
 IF NOT contact_eligible(j.org_id,j.lead_id,j.staging_id) OR j.input_fingerprint IS DISTINCT FROM contact_input_fingerprint(j.org_id,j.lead_id,j.staging_id) THEN UPDATE contact_social_jobs SET status='superseded',actual_cost_usd=0 WHERE id=j.id;RETURN '{"ready":false}';END IF;
 IF EXISTS(SELECT 1 FROM unsubscribes u JOIN cleaned_leads c ON lower(trim(c.email))=lower(trim(u.email)) WHERE c.id=j.lead_id) THEN UPDATE contact_social_jobs SET status='superseded',reason='suppressed',actual_cost_usd=0 WHERE id=j.id;RETURN '{"ready":false}';END IF;
 PERFORM 1 FROM organizations WHERE id=j.org_id FOR UPDATE;
 SELECT * INTO p FROM contact_social_policy WHERE org_id=j.org_id;
 SELECT * INTO cfg FROM contact_social_controls WHERE id FOR UPDATE;
 IF p.org_id IS NULL OR NOT p.enabled OR NOT cfg.enabled THEN UPDATE contact_social_jobs SET status='disabled',reason='paid_discovery_disabled' WHERE id=j.id;RETURN '{"ready":false}';END IF;
 SELECT * INTO a FROM gathering_accounts WHERE id=p.account_id AND enabled AND (mode='platform' OR org_id=j.org_id) FOR UPDATE;
 IF NOT FOUND OR a.api_key IS NULL OR a.provider_user_id IS NULL THEN UPDATE contact_social_jobs SET status='disabled',reason='account_not_configured' WHERE id=j.id;RETURN '{"ready":false}';END IF;
 IF EXISTS(SELECT 1 FROM contact_social_jobs WHERE org_id=j.org_id AND profile=j.profile AND status IN ('starting','running','needs_review')) THEN RETURN '{"ready":false}';END IF;
 SELECT coalesce(sum(coalesce(actual_cost_usd,max_cost_usd)),0) INTO spent FROM contact_social_jobs WHERE account_id IS NOT NULL AND (created_at>=date_trunc('month',now()) OR actual_cost_usd IS NULL) AND status IN ('starting','running','needs_review','completed','failed','superseded');
 IF spent+j.max_cost_usd>cfg.monthly_cap_usd THEN UPDATE contact_social_jobs SET status='budget_blocked',reason='discovery_monthly_cap' WHERE id=j.id;RETURN '{"ready":false}';END IF;
 SELECT coalesce(sum(coalesce(actual_cost_usd,max_cost_usd)),0) INTO spent FROM contact_social_jobs WHERE org_id=j.org_id AND account_id IS NOT NULL AND (created_at>=date_trunc('month',now()) OR actual_cost_usd IS NULL) AND status IN ('starting','running','needs_review','completed','failed','superseded');
 SELECT coalesce(sum(max_cost_usd),0) INTO reserved FROM scraping_jobs WHERE provider_account_id=a.id AND (status IN ('queued','pending','running','needs_review') OR (actual_cost IS NULL AND apify_actor_run_id IS NOT NULL));
 IF spent+j.max_cost_usd>p.monthly_cap_usd OR gathering_account_spent(a.id)+reserved+j.max_cost_usd>a.monthly_budget_usd THEN UPDATE contact_social_jobs SET status='budget_blocked',reason='account_or_organization_budget' WHERE id=j.id;RETURN '{"ready":false}';END IF;
 IF a.mode='platform' THEN
  charge:=round(j.max_cost_usd*a.price_multiplier,6);
  SELECT coalesce(sum(amount_usd),0) INTO wallet FROM gathering_wallet_entries WHERE org_id=j.org_id;
  SELECT coalesce(sum(customer_reserved_usd),0) INTO reserved FROM scraping_jobs WHERE org_id=j.org_id AND billing_mode='platform' AND (status IN ('queued','pending','running','needs_review') OR (actual_cost IS NULL AND apify_actor_run_id IS NOT NULL));
  IF wallet-reserved<charge THEN UPDATE contact_social_jobs SET status='budget_blocked',reason='insufficient_platform_credits' WHERE id=j.id;RETURN '{"ready":false}';END IF;
  INSERT INTO gathering_wallet_entries(org_id,amount_usd,reference) VALUES(j.org_id,-charge,'social-reserve-'||j.id);
 END IF;
 UPDATE contact_social_jobs SET status='starting',account_id=a.id,reason=NULL WHERE id=j.id;
 RETURN jsonb_build_object('ready',true,'api_key',a.api_key);
END $$;
REVOKE EXECUTE ON FUNCTION contact_social_reserve(bigint) FROM PUBLIC;
CREATE OR REPLACE FUNCTION contact_social_settle(p_id bigint,p_cost numeric) RETURNS void LANGUAGE plpgsql AS $$
DECLARE j contact_social_jobs%ROWTYPE;held numeric;
BEGIN
 IF p_cost IS NULL OR p_cost<0 THEN RAISE EXCEPTION 'Invalid cost';END IF;
 SELECT * INTO j FROM contact_social_jobs WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR j.account_id IS NULL THEN RAISE EXCEPTION 'Missing reservation';END IF;
 IF j.actual_cost_usd IS NOT NULL THEN IF j.actual_cost_usd<>p_cost THEN RAISE EXCEPTION 'Cost reconciliation required';END IF;RETURN;END IF;
 SELECT -amount_usd INTO held FROM gathering_wallet_entries WHERE reference='social-reserve-'||j.id;
 IF held IS NOT NULL THEN INSERT INTO gathering_wallet_entries(org_id,amount_usd,reference) VALUES(j.org_id,greatest(0,held*(1-p_cost/j.max_cost_usd)),'social-settle-'||j.id);END IF;
 UPDATE contact_social_jobs SET actual_cost_usd=p_cost,reason=CASE WHEN p_cost>max_cost_usd THEN 'provider_cap_exceeded' ELSE reason END WHERE id=j.id;
END $$;
REVOKE EXECUTE ON FUNCTION contact_social_settle(bigint,numeric) FROM PUBLIC;
CREATE OR REPLACE FUNCTION contact_lead_report(p_org integer,p_lead integer) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('lead_id',c.id,'org_id',c.org_id,'company_name',c.company_name,'website',c.website,'phone',c.phone,'city',c.city,'category',c.category,
 'business_details_source','cleaned_record','email_verification_enabled',(SELECT verification_enabled FROM contact_controls WHERE id),
 'contacts',coalesce((SELECT jsonb_agg(jsonb_build_object('email',e.email,'relevance',e.relevance_status,'verification',e.status,'verified_at',e.verified_at,'expires_at',e.expires_at,'evidence',e.evidence) ORDER BY e.score DESC) FROM lead_contacts e WHERE e.org_id=p_org AND e.lead_id=p_lead),'[]'),
 'discovery',(SELECT a.result-'id' FROM contact_attempts a JOIN contact_tasks t ON t.id=a.task_id WHERE t.org_id=p_org AND t.lead_id=p_lead AND t.kind='discovery' AND a.finished_at IS NOT NULL ORDER BY a.reserved_at DESC LIMIT 1),
 'facebook',(SELECT jsonb_build_object('status',j.status,'reason',j.reason,'result',j.result,'cost_usd',j.actual_cost_usd) FROM contact_social_jobs j WHERE j.org_id=p_org AND j.lead_id=p_lead ORDER BY j.id DESC LIMIT 1),
 'contact_readiness',CASE WHEN EXISTS(SELECT 1 FROM lead_contacts e WHERE e.org_id=p_org AND e.lead_id=p_lead AND e.relevance_status='eligible' AND e.status='verified' AND e.expires_at>now()) THEN 'verified_email_available'
 WHEN EXISTS(SELECT 1 FROM lead_contacts e WHERE e.org_id=p_org AND e.lead_id=p_lead AND e.relevance_status='eligible' AND e.status='pending') THEN 'verification_pending' ELSE 'review_or_alternative_route' END,
 'enrichment_complete',false)
 FROM cleaned_leads c WHERE c.org_id=p_org AND c.id=p_lead AND EXISTS(SELECT 1 FROM cleaning_links l WHERE l.cleaned_id=c.id AND contact_eligible(l.org_id,c.id,l.staging_id))
$$;
CREATE OR REPLACE FUNCTION contact_report(p_org integer) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('org_id',p_org,'strategy','contact_evidence_v2',
 'tasks',coalesce((SELECT jsonb_agg(q) FROM (SELECT kind,status,count(*) AS count FROM contact_tasks WHERE org_id=p_org GROUP BY kind,status ORDER BY kind,status) q),'[]'),
 'contacts',coalesce((SELECT jsonb_object_agg(status,n) FROM (SELECT status,count(*) n FROM lead_contacts WHERE org_id=p_org GROUP BY status) q),'{}'),
 'verification_requests_this_month',(SELECT count(*) FROM contact_attempts WHERE org_id=p_org AND kind='verification' AND reserved_at>=date_trunc('month',now())),
 'verification_paused',(SELECT provider_pause IS NOT NULL OR NOT verification_enabled FROM contact_controls WHERE id),
 'paid_discovery_enabled',coalesce((SELECT g.enabled AND o.enabled FROM contact_social_controls g CROSS JOIN contact_social_policy o WHERE g.id AND o.org_id=p_org),false),
 'discovery_results',(SELECT jsonb_build_object('saved_record_successes',count(*) FILTER(WHERE result->>'stop_reason'='saved_business_contacts_found'),
 'cache_hits',count(*) FILTER(WHERE result->>'cache_hit'='true'),
 'leads_with_alternative_routes',count(*) FILTER(WHERE jsonb_array_length(coalesce(result->'contact_routes','[]'))>0))
 FROM (SELECT DISTINCT ON(task_id) result FROM contact_attempts WHERE org_id=p_org AND kind='discovery' AND finished_at IS NOT NULL ORDER BY task_id,reserved_at DESC) latest))
$$;
COMMIT;
