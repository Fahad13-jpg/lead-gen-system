CREATE OR REPLACE FUNCTION public.enrichment_report_evidence_v1(p_org integer, p_lead integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
 SELECT jsonb_build_object('org_id',c.org_id,'lead_id',c.id,'basic',p.basic,'research',p.research,'tasks',(SELECT coalesce(jsonb_agg(jsonb_build_object('kind',kind,'status',status,'attempts',attempts,'error',error)),'[]') FROM enrichment_tasks WHERE org_id=c.org_id AND lead_id=c.id),'linkedin_jobs',(SELECT coalesce(jsonb_agg(jsonb_build_object('kind',j.kind,'status',j.status,'reason',j.reason,'cost_usd',d.actual_cost_usd)),'[]') FROM enrichment_linkedin_jobs j LEFT JOIN apify_diagnostic_runs d ON d.reference=j.reference WHERE j.org_id=c.org_id AND j.lead_id=c.id),'contact',contact_lead_report(c.org_id,c.id),'outreach_context',CASE WHEN p.research_at>now()-interval '7 days' AND p.research->>'input_fingerprint'=enrichment_fingerprint(c.org_id,c.id,'research') THEN p.research->'personalization' ELSE '[]'::jsonb END,'automatic_linkedin_collection',coalesce((SELECT cfg.enabled AND pol.enabled FROM enrichment_linkedin_controls cfg CROSS JOIN enrichment_linkedin_policy pol WHERE cfg.id AND pol.org_id=c.org_id),false))
 FROM cleaned_leads c LEFT JOIN enrichment_profiles p ON p.org_id=c.org_id AND p.lead_id=c.id WHERE c.org_id=p_org AND c.id=p_lead AND EXISTS(SELECT 1 FROM cleaning_links l WHERE l.org_id=c.org_id AND l.cleaned_id=c.id AND contact_eligible(c.org_id,c.id,l.staging_id))
$function$


CREATE OR REPLACE FUNCTION public.enrichment_report(p_org integer, p_lead integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
 SELECT CASE WHEN r IS NULL OR t IS NULL THEN NULL ELSE r||jsonb_build_object('trust',t,'outreach_context',
 CASE WHEN t->'freshness'->>'website_current'='true' AND t->'freshness'->>'research_current'='true' AND jsonb_array_length(t->'conflicts')=0 THEN coalesce(r->'outreach_context','[]'::jsonb) ELSE '[]'::jsonb END) END
 FROM (SELECT enrichment_report_evidence_v1(p_org,p_lead) r,lead_trust_report(p_org,p_lead) t) q
$function$


CREATE OR REPLACE FUNCTION public.enrichment_project_legacy()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 IF EXISTS(SELECT 1 FROM enriched_leads WHERE lead_id=NEW.lead_id AND org_id IS DISTINCT FROM NEW.org_id) THEN RAISE EXCEPTION 'Legacy enrichment ownership conflict';END IF;
 INSERT INTO enriched_leads(org_id,lead_id,domain,detected_country,website_description,has_contact_form,technologies_detected,ai_company_summary,data_sources_used,enrichment_stage,email_should_use,sms_should_use,whatsapp_should_use,linkedin_should_use,sales_ready)
 VALUES(NEW.org_id,NEW.lead_id,NEW.basic->'business'->>'domain',NEW.basic->'business'->>'country',NEW.basic->>'website_description',CASE WHEN NEW.basic->'observations'->>'contact_form'='observed' THEN true ELSE NULL END,NEW.basic->'technologies',NEW.research->>'summary',jsonb_build_object('version','enrichment_v1','evidence',NEW.basic->'evidence'),CASE WHEN NEW.research IS NULL THEN 1 ELSE 2 END,false,false,false,false,false)
 ON CONFLICT(lead_id) DO UPDATE SET domain=excluded.domain,detected_country=excluded.detected_country,website_description=excluded.website_description,has_contact_form=excluded.has_contact_form,technologies_detected=excluded.technologies_detected,ai_company_summary=excluded.ai_company_summary,data_sources_used=excluded.data_sources_used,enrichment_stage=greatest(enriched_leads.enrichment_stage,excluded.enrichment_stage)
 WHERE enriched_leads.org_id=NEW.org_id;
 RETURN NEW;
END $function$


CREATE OR REPLACE FUNCTION public.strategy_context(p_org integer, p_campaign bigint, p_lead integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE c strategy_campaigns%ROWTYPE;cfg jsonb;l cleaned_leads%ROWTYPE;r jsonb;result jsonb;stopped boolean;answered boolean;
BEGIN
 SELECT * INTO c FROM strategy_campaigns WHERE org_id=p_org AND id=p_campaign;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM organizations WHERE id=p_org AND status='active') THEN RETURN NULL;END IF;
 SELECT config INTO cfg FROM strategy_campaign_versions WHERE org_id=p_org AND campaign_id=c.id AND version=c.version;
 SELECT * INTO l FROM cleaned_leads WHERE id=p_lead AND org_id=p_org;IF NOT FOUND THEN RETURN NULL;END IF;
 r:=enrichment_report(p_org,p_lead);IF r IS NULL OR r->'trust' IS NULL THEN RETURN NULL;END IF;
 SELECT EXISTS(SELECT 1 FROM unsubscribes WHERE lower(email)=lower(l.email)) INTO stopped;
 SELECT EXISTS(SELECT 1 FROM outreach_activities WHERE lead_id=p_lead AND org_id=p_org AND replied_at IS NOT NULL) INTO answered;
 result:=jsonb_build_object('org_id',p_org,'campaign',jsonb_build_object('id',c.id,'version',c.version,'config',cfg),
 'lead',jsonb_build_object('id',l.id,'org_id',l.org_id,'company_name',l.company_name,'category',l.category,'city',l.city,'email',l.email,'phone',l.phone,'website',l.website),
 'report',jsonb_build_object('basic',r->'basic','research',r->'research','outreach_context',r->'outreach_context','trust',(r->'trust')-'evaluated_at'),'suppressed',stopped,'replied',answered);
 RETURN result||jsonb_build_object('fingerprint',md5(result::text));
END $function$
