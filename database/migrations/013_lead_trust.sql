BEGIN;
CREATE OR REPLACE FUNCTION lead_trust_report(p_org integer,p_lead integer) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE c cleaned_leads%ROWTYPE;p enrichment_profiles%ROWTYPE;basic_fresh boolean;research_fresh boolean;
 flags jsonb; emails jsonb; verified_email boolean; identity_status text; reasons jsonb:='[]';has_evidence boolean;
BEGIN
 SELECT * INTO c FROM cleaned_leads WHERE id=p_lead AND org_id=p_org;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM cleaning_links l WHERE l.cleaned_id=p_lead AND l.org_id=p_org AND contact_eligible(l.org_id,l.cleaned_id,l.staging_id)) THEN RETURN NULL; END IF;
 SELECT * INTO p FROM enrichment_profiles WHERE org_id=p_org AND lead_id=p_lead;
 basic_fresh:=coalesce(p.basic_at<=now() AND p.basic_at>now()-interval '30 days' AND p.basic->>'input_fingerprint'=enrichment_fingerprint(p_org,p_lead,'basic'),false);
 research_fresh:=coalesce(p.research_at<=now() AND p.research_at>now()-interval '7 days' AND p.research->>'input_fingerprint'=enrichment_fingerprint(p_org,p_lead,'research'),false);
 has_evidence:=coalesce(basic_fresh AND (jsonb_array_length(coalesce(p.basic->'evidence','[]'))>0 OR jsonb_array_length(coalesce(p.basic->'services','[]'))>0)
 OR research_fresh AND jsonb_array_length(coalesce(p.research->'linkedin'->'profiles','[]'))>0,false);
 flags:=coalesce(p.basic->'quality_flags','[]'::jsonb);
 SELECT coalesce(jsonb_agg(jsonb_build_object('value',e.email,'relevance',e.relevance_status,
 'status',CASE WHEN e.expires_at<=now() THEN 'expired'
 WHEN e.status='verified' AND e.verified_at<=now() AND e.expires_at>now() AND e.relevance_status='eligible' AND e.verification->>'deliverability'='DELIVERABLE'
 AND e.verification->>'smtp'='true' AND e.verification->>'format'='true' AND e.verification->>'mx'='true'
 AND e.verification->>'disposable'='false' AND e.verification->>'catch_all'='false' THEN 'provider_verified'
 WHEN e.status IN ('invalid','risky') THEN e.status ELSE 'deliverability_unknown' END,
 'source_evidence',e.evidence,'verification_method','external_email_provider','checked_at',e.verified_at,'expires_at',e.expires_at) ORDER BY e.id),'[]'::jsonb)
 INTO emails FROM lead_contacts e WHERE e.org_id=p_org AND e.lead_id=p_lead;
 verified_email:=EXISTS(SELECT 1 FROM jsonb_array_elements(emails) e WHERE e->>'status'='provider_verified');
 identity_status:=CASE WHEN jsonb_array_length(flags)>0 THEN 'conflict_needs_review'
 WHEN research_fresh AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p.research->'linkedin'->'profiles','[]')) x WHERE x->>'kind'='company') THEN 'source_correlated_not_independently_verified'
 ELSE 'unconfirmed' END;
 IF NOT has_evidence THEN reasons:=reasons||'"missing_or_stale_business_evidence"'::jsonb;END IF;
 IF identity_status='unconfirmed' THEN reasons:=reasons||'"business_identity_unconfirmed"'::jsonb;END IF;
 IF jsonb_array_length(flags)>0 THEN reasons:=reasons||'"conflicting_business_evidence"'::jsonb;END IF;
 IF NOT verified_email THEN reasons:=reasons||'"no_fresh_provider_verified_email"'::jsonb;END IF;
 RETURN jsonb_build_object('version','lead_trust_v1','fully_verified',false,
 'overall_status',CASE WHEN jsonb_array_length(flags)>0 THEN 'needs_review' WHEN NOT has_evidence THEN 'insufficient_fresh_evidence' WHEN verified_email THEN 'contact_verified_business_review_required' ELSE 'evidence_available_contacts_unverified' END,
 'identity',jsonb_build_object('status',identity_status,'method','name_and_website_matching_only','independent_verification',false),
 'fields',jsonb_build_object(
 'company_name',jsonb_build_object('value',c.company_name,'status','recorded_not_independently_verified','source','cleaned_record'),
 'category',jsonb_build_object('value',c.category,'status','recorded_not_independently_verified','source','cleaned_record'),
 'location',jsonb_build_object('city',c.city,'country',c.country,'status','recorded_not_independently_verified','source','cleaned_record'),
 'phone',jsonb_build_object('value',c.phone,'status',CASE WHEN c.phone IS NULL THEN 'missing' ELSE 'ownership_and_reachability_unknown' END,'source','cleaned_record'),
 'website',jsonb_build_object('value',c.website,'status',CASE WHEN c.website IS NULL THEN 'missing' WHEN NOT basic_fresh THEN 'stale_or_unchecked' WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p.basic->'pages','[]')) x WHERE x->>'status'='200') THEN 'page_observed_ownership_unverified' ELSE 'unavailable_or_blocked' END,'observed_at',p.basic_at,'sources',p.basic->'pages'),
 'emails',emails),
 'freshness',jsonb_build_object('website_current',basic_fresh,'research_current',research_fresh),
 'conflicts',flags,'blocking_reasons',reasons,'usable_for',jsonb_build_object('manual_research',has_evidence,'automatic_outreach',false),
 'ai_policy','source_excerpts_only_no_verified_recommendations','evaluated_at',now());
END $$;
DO $$ BEGIN
 IF to_regprocedure('enrichment_report_evidence_v1(integer,integer)') IS NULL THEN
 ALTER FUNCTION enrichment_report(integer,integer) RENAME TO enrichment_report_evidence_v1;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION enrichment_report(p_org integer,p_lead integer) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT CASE WHEN r IS NULL OR t IS NULL THEN NULL ELSE r||jsonb_build_object('trust',t,'outreach_context',
 CASE WHEN t->'freshness'->>'website_current'='true' AND t->'freshness'->>'research_current'='true' AND jsonb_array_length(t->'conflicts')=0 THEN coalesce(r->'outreach_context','[]'::jsonb) ELSE '[]'::jsonb END) END
 FROM (SELECT enrichment_report_evidence_v1(p_org,p_lead) r,lead_trust_report(p_org,p_lead) t) q
$$;
REVOKE ALL ON FUNCTION lead_trust_report(integer,integer) FROM PUBLIC;
COMMIT;
