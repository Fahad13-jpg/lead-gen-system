BEGIN;
CREATE TABLE IF NOT EXISTS contact_controls (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), discovery_enabled boolean NOT NULL DEFAULT false,
 verification_enabled boolean NOT NULL DEFAULT false, monthly_requests integer NOT NULL DEFAULT 0 CHECK(monthly_requests>=0),
 provider_pause text, staging_ids integer[], last_provider_claim timestamptz
);
INSERT INTO contact_controls(id) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS lead_contacts (
 id bigserial PRIMARY KEY, org_id integer NOT NULL REFERENCES organizations(id), lead_id integer NOT NULL REFERENCES cleaned_leads(id),
 email text NOT NULL, score integer NOT NULL DEFAULT 0, method text NOT NULL,
 evidence jsonb NOT NULL DEFAULT '[]', status text NOT NULL DEFAULT 'pending',
 verification jsonb, verified_at timestamptz, expires_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(org_id,lead_id,email)
);
CREATE TABLE IF NOT EXISTS contact_tasks (
 id bigserial PRIMARY KEY, org_id integer NOT NULL REFERENCES organizations(id), lead_id integer NOT NULL REFERENCES cleaned_leads(id),
 staging_id integer NOT NULL REFERENCES staging_leads(id), contact_id bigint REFERENCES lead_contacts(id),
 kind text NOT NULL CHECK(kind IN ('discovery','verification')), source_value text NOT NULL,
 status text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0,
 lease text, lease_until timestamptz, next_attempt timestamptz NOT NULL DEFAULT now(), last_error text,
 created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 UNIQUE(org_id,lead_id,kind,source_value)
);
CREATE INDEX IF NOT EXISTS contact_task_queue ON contact_tasks(kind,status,next_attempt,org_id,id);
CREATE TABLE IF NOT EXISTS contact_attempts (
 lease text PRIMARY KEY,task_id bigint NOT NULL REFERENCES contact_tasks(id),org_id integer NOT NULL,
 kind text NOT NULL,reserved_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,outcome text,result jsonb
);
CREATE INDEX IF NOT EXISTS contact_request_month ON contact_attempts(kind,reserved_at);
CREATE TABLE IF NOT EXISTS contact_verification_cache (
 org_id integer NOT NULL,email text NOT NULL,status text NOT NULL,evidence jsonb NOT NULL,
 checked_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,PRIMARY KEY(org_id,email)
);

CREATE OR REPLACE FUNCTION contact_eligible(p_org integer,p_lead integer,p_staging integer) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM cleaning_links l JOIN staging_leads s ON s.id=l.staging_id AND s.org_id=l.org_id
 JOIN cleaned_leads c ON c.id=l.cleaned_id AND c.org_id=l.org_id JOIN organizations o ON o.id=l.org_id
 WHERE l.org_id=p_org AND l.cleaned_id=p_lead AND l.staging_id=p_staging AND o.status='active'
 AND s.cleaning_status IN ('cleaned','needs_discovery'))
$$;

CREATE OR REPLACE FUNCTION contact_sync() RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
 UPDATE cleaned_leads c SET email_valid=false,email_verification_status='expired'
 FROM lead_contacts e WHERE e.lead_id=c.id AND e.org_id=c.org_id AND e.email=lower(trim(c.email)) AND e.expires_at<=now() AND c.email_valid=true;
 UPDATE contact_tasks t SET status='pending',attempts=0,next_attempt=now(),lease=NULL,lease_until=NULL
 FROM lead_contacts e WHERE e.id=t.contact_id AND e.expires_at<=now() AND t.status IN ('verified','invalid','risky','unknown','cached');
 UPDATE lead_contacts SET status='pending' WHERE expires_at<=now() AND status IN ('verified','invalid','risky','unknown');
 -- Never migrate or spend on ownership-review records or orphaned historical rows.
 INSERT INTO lead_contacts(org_id,lead_id,email,score,method)
 SELECT DISTINCT c.org_id,c.id,lower(trim(c.email)),90,'existing_record' FROM cleaned_leads c
 JOIN cleaning_links l ON l.cleaned_id=c.id AND l.org_id=c.org_id
 WHERE NULLIF(trim(c.email),'') IS NOT NULL AND contact_eligible(l.org_id,l.cleaned_id,l.staging_id)
 ON CONFLICT(org_id,lead_id,email) DO NOTHING;
 INSERT INTO contact_tasks(org_id,lead_id,staging_id,kind,source_value)
 SELECT DISTINCT ON(c.id) c.org_id,c.id,s.id,'discovery',trim(c.website) FROM cleaned_leads c
 JOIN cleaning_links l ON l.cleaned_id=c.id AND l.org_id=c.org_id JOIN staging_leads s ON s.id=l.staging_id
 WHERE contact_eligible(l.org_id,l.cleaned_id,l.staging_id) AND NULLIF(trim(c.website),'') IS NOT NULL
 AND (NULLIF(trim(c.email),'') IS NULL OR c.email_verification_status='invalid')
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
  AND (cfg.staging_ids IS NULL OR q.staging_id=ANY(cfg.staging_ids))
 ) ranked ORDER BY turn,last_served,id LIMIT greatest(1,least(p_limit,10)) LOOP
  IF running >= (CASE WHEN p_kind='discovery' THEN 3 ELSE 1 END) THEN EXIT;END IF;
  SELECT * INTO t FROM contact_tasks WHERE id=r.id AND status='pending' FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE;END IF;
  IF p_kind='discovery' AND NOT EXISTS(SELECT 1 FROM cleaned_leads WHERE id=t.lead_id AND org_id=t.org_id AND trim(website)=t.source_value) THEN
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
  UPDATE cleaned_leads SET email_valid=existing.status='verified' AND existing.expires_at>now(),
   email_verification_status=CASE WHEN existing.expires_at<=now() THEN 'expired' WHEN existing.status='verified' THEN 'valid' ELSE existing.status END WHERE id=p_lead AND org_id=p_org AND lower(trim(email))=existing.email;
 END IF;
 -- A replacement is allowed only for an empty address or an explicitly invalid current address.
 IF NULLIF(trim(c.email),'') IS NULL OR existing.status='invalid' THEN
  SELECT * INTO best FROM lead_contacts WHERE org_id=p_org AND lead_id=p_lead AND status='verified' AND expires_at>now() ORDER BY score DESC,id LIMIT 1;
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
 IF NOT contact_eligible(t.org_id,t.lead_id,t.staging_id) THEN v_outcome:='superseded'; END IF;
 IF t.kind='discovery' AND NOT EXISTS(SELECT 1 FROM cleaned_leads WHERE id=t.lead_id AND org_id=t.org_id AND trim(website)=t.source_value) THEN v_outcome:='superseded';END IF;
 IF v_outcome NOT IN ('found','not_found','blocked','retry','verified','invalid','risky','unknown','superseded') THEN RAISE EXCEPTION 'Invalid outcome';END IF;
 IF v_outcome='retry' THEN
  UPDATE contact_tasks SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'pending' END,next_attempt=now()+make_interval(secs=>60*power(2,attempts)::integer),last_error=left(p->>'error',100) WHERE id=t.id;
  IF t.kind='verification' AND coalesce((p->>'pause')::boolean,false) THEN UPDATE contact_controls SET provider_pause=left(p->>'error',100) WHERE id;END IF;
 ELSIF t.kind='discovery' AND v_outcome='found' THEN
  FOR item IN SELECT value FROM jsonb_array_elements(p->'candidates') LIMIT 20 LOOP
   IF length(item->>'email')>254 OR item->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN CONTINUE;END IF;
   INSERT INTO lead_contacts(org_id,lead_id,email,score,method,evidence,status)
    VALUES(t.org_id,t.lead_id,item->>'email',least(100,greatest(0,(item->>'score')::integer)),'published_website',jsonb_build_array(item),CASE WHEN (item->>'score')::integer>=40 THEN 'pending' ELSE 'review' END)
    ON CONFLICT(org_id,lead_id,email) DO UPDATE SET score=greatest(lead_contacts.score,excluded.score),evidence=CASE WHEN lead_contacts.evidence @> excluded.evidence THEN lead_contacts.evidence ELSE lead_contacts.evidence||excluded.evidence END;
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
 UPDATE contact_attempts SET finished_at=now(),outcome=v_outcome,result=p-'lease' WHERE lease=t.lease;
 RETURN jsonb_build_object('saved',true,'id',t.id,'status',v_outcome);
END $$;

CREATE OR REPLACE FUNCTION contact_report(p_org integer) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('org_id',p_org,'tasks',coalesce((SELECT jsonb_agg(q) FROM (SELECT kind,status,count(*) AS count FROM contact_tasks WHERE org_id=p_org GROUP BY kind,status ORDER BY kind,status) q),'[]'),
 'contacts',coalesce((SELECT jsonb_object_agg(status,n) FROM (SELECT status,count(*) n FROM lead_contacts WHERE org_id=p_org GROUP BY status) q),'{}'),
 'verification_requests_this_month',(SELECT count(*) FROM contact_attempts WHERE org_id=p_org AND kind='verification' AND reserved_at>=date_trunc('month',now())),
 'verification_paused',(SELECT provider_pause IS NOT NULL OR NOT verification_enabled FROM contact_controls WHERE id),'paid_discovery_enabled',false)
$$;
CREATE OR REPLACE FUNCTION contact_retry(p_org integer,p_task bigint) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
 UPDATE contact_tasks SET status='pending',attempts=0,next_attempt=now(),last_error=NULL,lease=NULL,lease_until=NULL
 WHERE id=p_task AND org_id=p_org AND status<>'processing' AND contact_eligible(org_id,lead_id,staging_id);
 RETURN FOUND;
END $$;
REVOKE EXECUTE ON FUNCTION contact_retry(integer,bigint) FROM PUBLIC;
COMMIT;
