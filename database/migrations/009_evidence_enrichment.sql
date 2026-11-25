BEGIN;
CREATE TABLE IF NOT EXISTS enrichment_controls(id boolean PRIMARY KEY DEFAULT true CHECK(id),enabled boolean NOT NULL DEFAULT false,lead_ids integer[]);
INSERT INTO enrichment_controls(id) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS enrichment_profiles(org_id integer NOT NULL REFERENCES organizations(id),lead_id integer NOT NULL REFERENCES cleaned_leads(id),basic jsonb,research jsonb,basic_at timestamptz,research_at timestamptz,PRIMARY KEY(org_id,lead_id));
CREATE TABLE IF NOT EXISTS enrichment_linkedin(org_id integer NOT NULL REFERENCES organizations(id),lead_id integer NOT NULL REFERENCES cleaned_leads(id),evidence jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(org_id,lead_id));
CREATE TABLE IF NOT EXISTS enrichment_campaigns(org_id integer NOT NULL REFERENCES organizations(id),lead_id integer NOT NULL REFERENCES cleaned_leads(id),config jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(org_id,lead_id));
CREATE TABLE IF NOT EXISTS enrichment_tasks(id bigserial PRIMARY KEY,org_id integer NOT NULL REFERENCES organizations(id),lead_id integer NOT NULL REFERENCES cleaned_leads(id),staging_id integer NOT NULL REFERENCES staging_leads(id),kind text NOT NULL CHECK(kind IN ('basic','research')),status text NOT NULL DEFAULT 'pending',attempts integer NOT NULL DEFAULT 0,lease text,lease_until timestamptz,next_attempt timestamptz NOT NULL DEFAULT now(),fingerprint text,finished_at timestamptz,error text,UNIQUE(org_id,lead_id,kind));
CREATE TABLE IF NOT EXISTS enrichment_attempts(lease text PRIMARY KEY,task_id bigint NOT NULL REFERENCES enrichment_tasks(id),started_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,result jsonb);
CREATE INDEX IF NOT EXISTS enrichment_queue ON enrichment_tasks(kind,status,next_attempt);
CREATE OR REPLACE FUNCTION enrichment_fingerprint(p_org integer,p_lead integer,p_kind text) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT md5(jsonb_build_object('name',c.company_name,'website',c.website,'phone',c.phone,'city',c.city,'country',c.country,'category',c.category,
 'basic',CASE WHEN p_kind='research' THEN p.basic END,'linkedin',CASE WHEN p_kind='research' THEN l.evidence END,'campaign',CASE WHEN p_kind='research' THEN g.config END)::text)
 FROM cleaned_leads c LEFT JOIN enrichment_profiles p ON p.org_id=c.org_id AND p.lead_id=c.id LEFT JOIN enrichment_linkedin l ON l.org_id=c.org_id AND l.lead_id=c.id LEFT JOIN enrichment_campaigns g ON g.org_id=c.org_id AND g.lead_id=c.id WHERE c.org_id=p_org AND c.id=p_lead
$$;
CREATE OR REPLACE FUNCTION enrichment_claim(p_kind text,p_limit integer DEFAULT 2) RETURNS SETOF jsonb LANGUAGE plpgsql AS $$
DECLARE cfg enrichment_controls%ROWTYPE;t enrichment_tasks%ROWTYPE;
BEGIN
 SELECT * INTO cfg FROM enrichment_controls WHERE id FOR UPDATE;
 IF NOT cfg.enabled OR p_kind NOT IN ('basic','research') THEN RETURN;END IF;
 INSERT INTO enrichment_tasks(org_id,lead_id,staging_id,kind)
 SELECT DISTINCT ON(c.id) c.org_id,c.id,l.staging_id,p_kind FROM cleaned_leads c JOIN cleaning_links l ON l.cleaned_id=c.id AND l.org_id=c.org_id
 WHERE contact_eligible(c.org_id,c.id,l.staging_id) AND (cfg.lead_ids IS NULL OR c.id=ANY(cfg.lead_ids))
 AND (p_kind='basic' OR EXISTS(SELECT 1 FROM enrichment_profiles ep WHERE ep.org_id=c.org_id AND ep.lead_id=c.id AND ep.basic IS NOT NULL AND ep.basic->>'input_fingerprint'=enrichment_fingerprint(c.org_id,c.id,'basic'))) ORDER BY c.id,l.staging_id ON CONFLICT DO NOTHING;
 UPDATE enrichment_tasks SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'pending' END,lease=NULL,lease_until=NULL,error='lease_expired' WHERE status='processing' AND lease_until<now();
 UPDATE enrichment_tasks t0 SET status='pending',attempts=0,next_attempt=now(),lease=NULL WHERE kind=p_kind AND status<>'processing' AND fingerprint IS NOT NULL
 AND (fingerprint IS DISTINCT FROM enrichment_fingerprint(org_id,lead_id,kind) OR status IN ('complete','partial') AND finished_at<now()-CASE WHEN kind='basic' THEN interval '30 days' ELSE interval '7 days' END);
 FOR t IN SELECT q.* FROM enrichment_tasks q JOIN (SELECT id,row_number() OVER(PARTITION BY org_id ORDER BY next_attempt,id) AS turn FROM enrichment_tasks WHERE kind=p_kind AND status='pending') fair ON fair.id=q.id
 WHERE q.kind=p_kind AND q.status='pending' AND q.next_attempt<=now() AND q.attempts<3 AND contact_eligible(q.org_id,q.lead_id,q.staging_id)
 AND (cfg.lead_ids IS NULL OR q.lead_id=ANY(cfg.lead_ids)) ORDER BY fair.turn,q.next_attempt,q.id LIMIT least(greatest(p_limit,1),5) FOR UPDATE OF q SKIP LOCKED LOOP
 UPDATE enrichment_tasks SET status='processing',attempts=attempts+1,lease=md5(random()::text||clock_timestamp()::text||id),lease_until=now()+interval '5 minutes',fingerprint=enrichment_fingerprint(org_id,lead_id,kind) WHERE id=t.id RETURNING * INTO t;
 INSERT INTO enrichment_attempts(lease,task_id) VALUES(t.lease,t.id);RETURN NEXT jsonb_build_object('id',t.id,'lease',t.lease);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION enrichment_task_input(p_id bigint,p_lease text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('kind',t.kind,'lead',jsonb_build_object('id',c.id,'org_id',c.org_id,'company_name',c.company_name,'website',c.website,'phone',c.phone,'city',c.city,'country',c.country,'category',c.category),'basic',p.basic,'linkedin',l.evidence,'campaign',g.config)
 FROM enrichment_tasks t JOIN cleaned_leads c ON c.id=t.lead_id AND c.org_id=t.org_id LEFT JOIN enrichment_profiles p ON p.lead_id=c.id AND p.org_id=c.org_id LEFT JOIN enrichment_linkedin l ON l.lead_id=c.id AND l.org_id=c.org_id LEFT JOIN enrichment_campaigns g ON g.lead_id=c.id AND g.org_id=c.org_id
 WHERE t.id=p_id AND t.lease=p_lease AND t.status='processing' AND t.lease_until>now() AND contact_eligible(t.org_id,t.lead_id,t.staging_id) AND t.fingerprint=enrichment_fingerprint(t.org_id,t.lead_id,t.kind)
$$;
CREATE OR REPLACE FUNCTION enrichment_finish(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE t enrichment_tasks%ROWTYPE;r jsonb:=p->'result';outcome text;
BEGIN
 SELECT * INTO t FROM enrichment_tasks WHERE id=(p->>'id')::bigint FOR UPDATE;
 IF NOT FOUND OR t.status<>'processing' OR t.lease IS DISTINCT FROM p->>'lease' OR t.lease_until<=now() THEN RETURN '{"saved":false,"reason":"stale_lease"}';END IF;
 IF NOT contact_eligible(t.org_id,t.lead_id,t.staging_id) OR t.fingerprint IS DISTINCT FROM enrichment_fingerprint(t.org_id,t.lead_id,t.kind) THEN
 UPDATE enrichment_tasks SET status='pending',attempts=0,next_attempt=now(),lease=NULL,lease_until=NULL WHERE id=t.id;RETURN '{"saved":false,"reason":"source_changed"}';END IF;
 outcome:=p->>'status';IF outcome NOT IN ('complete','partial') OR r->>'version' IS DISTINCT FROM 'enrichment_v1' THEN outcome:='failed';END IF;
 IF outcome IN ('complete','partial') THEN
 r:=r||jsonb_build_object('input_fingerprint',t.fingerprint);
 INSERT INTO enrichment_profiles(org_id,lead_id) VALUES(t.org_id,t.lead_id) ON CONFLICT DO NOTHING;
 IF t.kind='basic' THEN UPDATE enrichment_profiles SET basic=r,basic_at=now(),research=NULL,research_at=NULL WHERE org_id=t.org_id AND lead_id=t.lead_id;
 ELSE UPDATE enrichment_profiles SET research=r,research_at=now() WHERE org_id=t.org_id AND lead_id=t.lead_id;END IF;
 END IF;
 UPDATE enrichment_tasks SET status=CASE WHEN outcome='failed' AND attempts<3 THEN 'pending' ELSE outcome END,next_attempt=now()+interval '10 minutes',finished_at=now(),lease_until=NULL,error=CASE WHEN outcome='failed' THEN 'invalid_worker_result' ELSE NULL END WHERE id=t.id;
 UPDATE enrichment_attempts SET finished_at=now(),result=p WHERE lease=t.lease;
 RETURN jsonb_build_object('saved',outcome IN ('complete','partial'),'status',outcome);
END $$;
CREATE OR REPLACE FUNCTION enrichment_submit(p jsonb,p_kind text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE o integer:=(p->>'org_id')::integer;l integer:=(p->>'lead_id')::integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM cleaning_links WHERE org_id=o AND cleaned_id=l AND contact_eligible(o,l,staging_id)) THEN RETURN '{"error":"NOT_FOUND"}';END IF;
 IF p_kind='linkedin' AND jsonb_typeof(p->'profiles')='array' AND jsonb_array_length(p->'profiles')<=10 THEN
 INSERT INTO enrichment_linkedin(org_id,lead_id,evidence) VALUES(o,l,p-'org_id'-'lead_id') ON CONFLICT(org_id,lead_id) DO UPDATE SET evidence=excluded.evidence,updated_at=now();
 ELSIF p_kind='campaign' AND jsonb_typeof(p->'config')='object' THEN
 INSERT INTO enrichment_campaigns(org_id,lead_id,config) VALUES(o,l,p->'config') ON CONFLICT(org_id,lead_id) DO UPDATE SET config=excluded.config,updated_at=now();
 ELSE RETURN '{"error":"INVALID_REQUEST"}';END IF;
 UPDATE enrichment_profiles SET research=NULL,research_at=NULL WHERE org_id=o AND lead_id=l;
 RETURN '{"saved":true}';
END $$;
CREATE OR REPLACE FUNCTION enrichment_report(p_org integer,p_lead integer) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('org_id',c.org_id,'lead_id',c.id,'basic',p.basic,'research',p.research,'tasks',(SELECT coalesce(jsonb_agg(jsonb_build_object('kind',kind,'status',status,'attempts',attempts,'error',error)),'[]') FROM enrichment_tasks WHERE org_id=c.org_id AND lead_id=c.id),'contact',contact_lead_report(c.org_id,c.id),'outreach_context',CASE WHEN p.research_at>now()-interval '7 days' AND p.research->>'input_fingerprint'=enrichment_fingerprint(c.org_id,c.id,'research') THEN p.research->'personalization' ELSE '[]'::jsonb END,'automatic_linkedin_collection',false)
 FROM cleaned_leads c LEFT JOIN enrichment_profiles p ON p.org_id=c.org_id AND p.lead_id=c.id WHERE c.org_id=p_org AND c.id=p_lead AND EXISTS(SELECT 1 FROM cleaning_links l WHERE l.org_id=c.org_id AND l.cleaned_id=c.id AND contact_eligible(c.org_id,c.id,l.staging_id))
$$;
REVOKE EXECUTE ON FUNCTION enrichment_claim(text,integer),enrichment_task_input(bigint,text),enrichment_finish(jsonb),enrichment_submit(jsonb,text) FROM PUBLIC;
CREATE OR REPLACE FUNCTION enrichment_project_legacy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM enriched_leads WHERE lead_id=NEW.lead_id AND org_id IS DISTINCT FROM NEW.org_id) THEN RAISE EXCEPTION 'Legacy enrichment ownership conflict';END IF;
 INSERT INTO enriched_leads(org_id,lead_id,domain,detected_country,website_description,has_contact_form,technologies_detected,ai_company_summary,data_sources_used,enrichment_stage,email_should_use,sms_should_use,whatsapp_should_use,linkedin_should_use,sales_ready)
 VALUES(NEW.org_id,NEW.lead_id,NEW.basic->'business'->>'domain',NEW.basic->'business'->>'country',NEW.basic->>'website_description',CASE WHEN NEW.basic->'observations'->>'contact_form'='observed' THEN true ELSE NULL END,NEW.basic->'technologies',NEW.research->>'summary',jsonb_build_object('version','enrichment_v1','evidence',NEW.basic->'evidence'),CASE WHEN NEW.research IS NULL THEN 1 ELSE 2 END,false,false,false,false,false)
 ON CONFLICT(lead_id) DO UPDATE SET domain=excluded.domain,detected_country=excluded.detected_country,website_description=excluded.website_description,has_contact_form=excluded.has_contact_form,technologies_detected=excluded.technologies_detected,ai_company_summary=excluded.ai_company_summary,data_sources_used=excluded.data_sources_used,enrichment_stage=greatest(enriched_leads.enrichment_stage,excluded.enrichment_stage)
 WHERE enriched_leads.org_id=NEW.org_id;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enrichment_project_legacy ON enrichment_profiles;
CREATE TRIGGER enrichment_project_legacy AFTER INSERT OR UPDATE OF basic,research ON enrichment_profiles FOR EACH ROW EXECUTE FUNCTION enrichment_project_legacy();
COMMIT;
