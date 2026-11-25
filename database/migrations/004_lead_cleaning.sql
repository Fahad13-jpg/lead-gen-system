-- Independent cleaning state; no historical ownership repair or outreach activation.
BEGIN;
ALTER TABLE staging_leads ADD COLUMN IF NOT EXISTS cleaning_status text NOT NULL DEFAULT 'pending',
 ADD COLUMN IF NOT EXISTS cleaning_lease text, ADD COLUMN IF NOT EXISTS cleaning_lease_until timestamptz,
 ADD COLUMN IF NOT EXISTS cleaning_attempts integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS cleaning_next_attempt timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN IF NOT EXISTS cleaning_error text;
ALTER TABLE cleaned_leads ADD COLUMN IF NOT EXISTS longitude numeric(11,8),
 ADD COLUMN IF NOT EXISTS cleaning_metadata jsonb NOT NULL DEFAULT '{}';
-- Shared reception numbers and mailboxes do not establish business identity.
DROP INDEX IF EXISTS idx_cleaned_leads_org_email;
DROP INDEX IF EXISTS idx_cleaned_leads_org_phone;
CREATE INDEX IF NOT EXISTS cleaning_email_lookup ON cleaned_leads(org_id,email);
CREATE INDEX IF NOT EXISTS cleaning_phone_lookup ON cleaned_leads(org_id,phone);
CREATE INDEX IF NOT EXISTS cleaning_queue ON staging_leads(cleaning_status,cleaning_next_attempt,org_id,id);
CREATE TABLE IF NOT EXISTS cleaning_history (
 id bigserial PRIMARY KEY, staging_id integer NOT NULL, org_id integer NOT NULL,
 cleaned_id integer, lease_token text NOT NULL UNIQUE, rule_version text NOT NULL,
 outcome text NOT NULL, before_data jsonb NOT NULL, proposal jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cleaning_history_org ON cleaning_history(org_id,staging_id,id);
CREATE TABLE IF NOT EXISTS cleaning_links (
 staging_id integer PRIMARY KEY REFERENCES staging_leads(id), org_id integer NOT NULL REFERENCES organizations(id),
 cleaned_id integer NOT NULL REFERENCES cleaned_leads(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cleaning_controls (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), enabled boolean NOT NULL DEFAULT false
);
INSERT INTO cleaning_controls(id) VALUES(true) ON CONFLICT DO NOTHING;
-- Optional allowlist makes a production canary bounded without changing source rows.
ALTER TABLE cleaning_controls ADD COLUMN IF NOT EXISTS staging_ids integer[];

CREATE OR REPLACE FUNCTION cleaning_source_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.company_name,NEW.email,NEW.phone,NEW.website,NEW.address,NEW.city,NEW.state,NEW.zip,NEW.country,NEW.category,NEW.raw_data)
  IS DISTINCT FROM ROW(OLD.company_name,OLD.email,OLD.phone,OLD.website,OLD.address,OLD.city,OLD.state,OLD.zip,OLD.country,OLD.category,OLD.raw_data) THEN
  NEW.cleaning_status:='pending';NEW.cleaning_attempts:=0;NEW.cleaning_next_attempt:=now();
  NEW.cleaning_lease:=NULL;NEW.cleaning_lease_until:=NULL;NEW.cleaning_error:=NULL;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cleaning_source_changed ON staging_leads;
CREATE TRIGGER cleaning_source_changed BEFORE UPDATE OF company_name,email,phone,website,address,city,state,zip,country,category,raw_data ON staging_leads
 FOR EACH ROW EXECUTE FUNCTION cleaning_source_changed();

CREATE OR REPLACE FUNCTION cleaning_claim(p_worker text,p_limit integer DEFAULT 50,p_org integer DEFAULT NULL)
RETURNS SETOF jsonb LANGUAGE plpgsql AS $$
DECLARE s staging_leads%ROWTYPE; r record;
BEGIN
 IF NOT (SELECT enabled FROM cleaning_controls WHERE id) THEN RETURN; END IF;
 IF length(coalesce(p_worker,'')) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid worker'; END IF;
 -- Recover expired leases, with bounded exponential retry after crashes.
 UPDATE staging_leads SET cleaning_status=CASE WHEN cleaning_attempts>=3 THEN 'failed' ELSE 'pending' END,
  cleaning_lease=NULL,cleaning_lease_until=NULL,cleaning_next_attempt=now()+interval '1 minute',cleaning_error='lease_expired'
 WHERE cleaning_status='processing' AND cleaning_lease_until<now() AND (p_org IS NULL OR org_id=p_org);
 -- Round-robin rank bounds each organization's share of every batch.
 FOR r IN SELECT id FROM (
   SELECT s0.id,row_number() OVER(PARTITION BY s0.org_id ORDER BY s0.id) AS turn
   FROM staging_leads s0 JOIN organizations o ON o.id=s0.org_id AND o.status='active'
   WHERE cleaning_status='pending' AND cleaning_next_attempt<=now() AND (p_org IS NULL OR s0.org_id=p_org)
    AND ((SELECT staging_ids FROM cleaning_controls WHERE id) IS NULL OR s0.id=ANY((SELECT staging_ids FROM cleaning_controls WHERE id)::integer[]))
 ) q ORDER BY turn,id LIMIT greatest(1,least(coalesce(p_limit,50),100))
 LOOP
  SELECT * INTO s FROM staging_leads WHERE id=r.id AND cleaning_status='pending' FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE; END IF;
  UPDATE staging_leads SET cleaning_status='processing',cleaning_attempts=cleaning_attempts+1,
   cleaning_lease=p_worker||':'||id||':'||md5(random()::text||clock_timestamp()::text),cleaning_lease_until=now()+interval '5 minutes',cleaning_error=NULL
   WHERE id=s.id RETURNING * INTO s;
  RETURN NEXT to_jsonb(s);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION cleaning_finish(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE s staging_leads%ROWTYPE;c cleaned_leads%ROWTYPE;f jsonb;prior jsonb;outcome text;cid integer;candidate integer;token text;hist cleaning_history%ROWTYPE;
BEGIN
 token:=p->>'lease_token';f:=p->'fields';
 SELECT * INTO hist FROM cleaning_history WHERE lease_token=token;
 IF FOUND THEN
  IF hist.org_id<>(p->>'org_id')::integer OR hist.staging_id<>(p->>'staging_id')::integer THEN RETURN '{"saved":false,"error":"TENANT_MISMATCH"}'; END IF;
  RETURN jsonb_build_object('saved',true,'replayed',true,'outcome',hist.outcome,'cleaned_id',hist.cleaned_id);
 END IF;
 -- Organization serialization prevents concurrent business identity races.
 PERFORM pg_advisory_xact_lock(49302813,(p->>'org_id')::integer);
 SELECT * INTO s FROM staging_leads WHERE id=(p->>'staging_id')::integer AND org_id=(p->>'org_id')::integer FOR UPDATE;
 IF NOT FOUND OR s.cleaning_status<>'processing' OR s.cleaning_lease IS DISTINCT FROM token OR s.cleaning_lease_until<now() THEN RETURN '{"saved":false,"error":"STALE_LEASE"}'; END IF;
 outcome:=p->>'outcome';
 IF outcome NOT IN ('cleaned','needs_discovery','review') OR p->>'rule_version'<>'cleaning-v1' OR jsonb_typeof(f)<>'object' THEN RAISE EXCEPTION 'Invalid cleaning result'; END IF;
 SELECT * INTO c FROM cleaned_leads WHERE staging_id=s.id FOR UPDATE;
 -- Legacy ownership inconsistencies require an explicit reviewed repair.
 IF FOUND AND c.org_id IS DISTINCT FROM s.org_id THEN outcome:='review';p:=p||jsonb_build_object('issues',coalesce(p->'issues','[]')||'"historical_org_mismatch"'::jsonb);c:=NULL;
 ELSE
  IF c.id IS NULL THEN
   SELECT cl.* INTO c FROM cleaning_links l JOIN cleaned_leads cl ON cl.id=l.cleaned_id AND cl.org_id=l.org_id WHERE l.staging_id=s.id AND l.org_id=s.org_id FOR UPDATE OF cl;
  END IF;
  IF c.id IS NULL AND s.source_record_id IS NOT NULL THEN
   SELECT cl.* INTO c FROM cleaning_links l JOIN staging_leads old ON old.id=l.staging_id JOIN cleaned_leads cl ON cl.id=l.cleaned_id AND cl.org_id=l.org_id
    WHERE l.org_id=s.org_id AND old.source=s.source AND old.source_record_id=s.source_record_id LIMIT 1 FOR UPDATE OF cl;
  END IF;
  IF c.id IS NULL AND outcome<>'review' THEN
   -- Fuzzy matches are suggestions only, never automatic merges.
   SELECT id INTO candidate FROM cleaned_leads WHERE org_id=s.org_id AND normalized_name IS NOT NULL
    AND f->>'normalized_name' IS NOT NULL AND city IS NOT DISTINCT FROM f->>'city'
    AND similarity(normalized_name,f->>'normalized_name')>=0.7
    AND (phone=f->>'phone' OR address=f->>'address') ORDER BY similarity(normalized_name,f->>'normalized_name') DESC,id LIMIT 1;
   INSERT INTO cleaned_leads(staging_id,org_id,company_name,normalized_name,email,email_valid,email_verification_status,email_type,
    phone,phone_valid,website,address,city,state,zip_code,country,category,rating,review_count,latitude,longitude,data_quality_score,possible_duplicate_of,cleaning_metadata)
   VALUES(s.id,s.org_id,f->>'company_name',f->>'normalized_name',f->>'email',false,CASE WHEN f->>'email' IS NULL THEN 'no_email' ELSE 'pending' END,f->>'email_type',
    f->>'phone',false,f->>'website',f->>'address',f->>'city',f->>'state',f->>'zip_code',f->>'country',f->>'category',(f->>'rating')::numeric,(f->>'review_count')::integer,
    (f->>'latitude')::numeric,(f->>'longitude')::numeric,(f->>'data_quality_score')::integer,candidate,p-'lease_token') RETURNING * INTO c;
  ELSIF c.id IS NOT NULL THEN
   prior:=to_jsonb(c);
   -- Fill missing values only; preserve verified contacts and customer edits.
   UPDATE cleaned_leads SET email=coalesce(NULLIF(email,''),f->>'email'),phone=coalesce(NULLIF(phone,''),f->>'phone'),
    website=coalesce(NULLIF(website,''),f->>'website'),address=coalesce(NULLIF(address,''),f->>'address'),
    email_verification_status=CASE WHEN NULLIF(email,'') IS NULL AND f->>'email' IS NOT NULL THEN 'pending' ELSE email_verification_status END,
    email_valid=CASE WHEN email_verification_status='valid' THEN email_valid ELSE false END,
    cleaning_metadata=coalesce(cleaning_metadata,'{}')||jsonb_build_object('latest_proposal',p-'lease_token','preserved_existing',true)
    WHERE id=c.id AND org_id=s.org_id;
  END IF;
 END IF;
 cid:=c.id;
 IF cid IS NOT NULL THEN
  UPDATE cleaned_leads SET data_quality_score=
   (CASE WHEN NULLIF(company_name,'') IS NOT NULL THEN 15 ELSE 0 END)+
   (CASE WHEN NULLIF(email,'') IS NOT NULL THEN 20 ELSE 0 END)+(CASE WHEN NULLIF(phone,'') IS NOT NULL THEN 20 ELSE 0 END)+
   (CASE WHEN NULLIF(website,'') IS NOT NULL THEN 15 ELSE 0 END)+(CASE WHEN NULLIF(address,'') IS NOT NULL THEN 15 ELSE 0 END)+
   (CASE WHEN NULLIF(country,'') IS NOT NULL THEN 5 ELSE 0 END)+(CASE WHEN NULLIF(category,'') IS NOT NULL THEN 10 ELSE 0 END)
   WHERE id=cid AND org_id=s.org_id;
  INSERT INTO cleaning_links(staging_id,org_id,cleaned_id) VALUES(s.id,s.org_id,cid) ON CONFLICT(staging_id) DO NOTHING;
 END IF;
 INSERT INTO cleaning_history(staging_id,org_id,cleaned_id,lease_token,rule_version,outcome,before_data,proposal)
 VALUES(s.id,s.org_id,cid,token,p->>'rule_version',outcome,jsonb_build_object('staging',to_jsonb(s)-'cleaning_lease','cleaned',prior),p-'lease_token');
 UPDATE staging_leads SET cleaning_status=outcome,cleaning_lease=NULL,cleaning_lease_until=NULL,cleaning_error=NULL WHERE id=s.id AND org_id=s.org_id;
 RETURN jsonb_build_object('saved',true,'staging_id',s.id,'cleaned_id',cid,'outcome',outcome,'possible_duplicate_of',candidate);
END $$;

CREATE OR REPLACE FUNCTION cleaning_retry(p_org integer,p_staging integer) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
 UPDATE staging_leads SET cleaning_status='pending',cleaning_attempts=0,cleaning_next_attempt=now(),cleaning_error=NULL,
  cleaning_lease=NULL,cleaning_lease_until=NULL WHERE id=p_staging AND org_id=p_org AND cleaning_status<>'processing';
 RETURN jsonb_build_object('queued',FOUND);
END $$;
-- Audit tokens must remain unique across explicit reprocessing runs.
CREATE OR REPLACE FUNCTION cleaning_report(p_org integer,p_job integer DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('org_id',p_org,'job_id',p_job,'counts',coalesce((
  SELECT jsonb_object_agg(cleaning_status,n) FROM (SELECT cleaning_status,count(*) n FROM staging_leads WHERE org_id=p_org AND (p_job IS NULL OR job_id=p_job) GROUP BY cleaning_status) q),'{}'::jsonb),
  'issues',coalesce((SELECT jsonb_agg(jsonb_build_object('staging_id',s.id,'status',s.cleaning_status,'error',s.cleaning_error,
    'reasons',(SELECT proposal->'issues' FROM cleaning_history WHERE staging_id=s.id AND org_id=p_org ORDER BY id DESC LIMIT 1)))
   FROM (SELECT * FROM staging_leads WHERE org_id=p_org AND (p_job IS NULL OR job_id=p_job) AND cleaning_status IN ('review','failed','needs_discovery') ORDER BY id LIMIT 100) s),'[]'::jsonb))
$$;
REVOKE EXECUTE ON FUNCTION cleaning_retry(integer,integer) FROM PUBLIC;
COMMIT;
