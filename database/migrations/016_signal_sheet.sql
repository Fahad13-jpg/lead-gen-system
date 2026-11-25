-- Applied/tested in scratch only; NOT applied to live. No new tables, webhooks, gates, leases or billing changes.
BEGIN;
-- Function source for migration 016; no table writes. Stored-payload observations only.
CREATE OR REPLACE FUNCTION enrichment_stamp_source(p_source text,p_raw jsonb,p_website text)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE src text:=CASE WHEN p_source='google_maps' THEN 'maps_listing' ELSE p_source END;
 url text; observed text:=p_raw->>'scrapedAt';valid_time boolean:=false; valid_url boolean:=false;
 maps boolean:=false; yellow boolean:=false; website text;social boolean:=false;
 result text:='unknown';reason text:='insufficient_detail_or_unverified_source';
BEGIN
 url:=CASE WHEN src='maps_listing' THEN p_raw->>'url' WHEN src='yellow_pages' THEN coalesce(nullif(p_raw->>'profileUrl',''),p_raw->>'sourceUrl') END;
 BEGIN valid_time:=observed IS NOT NULL AND observed::timestamptz IS NOT NULL; EXCEPTION WHEN others THEN valid_time:=false; END;
 valid_url:=coalesce(CASE WHEN src='maps_listing' THEN url ~* '^https?://([a-z0-9-]+\.)*google\.[a-z.]+(/|$)' WHEN src='yellow_pages' THEN url ~* '^https?://([a-z0-9-]+\.)*yellowpages\.com(/|$)' ELSE false END,false);
 website:=CASE WHEN jsonb_typeof(p_raw->'website')='string' THEN trim(p_raw->>'website') END;
 maps:=coalesce(src='maps_listing' AND valid_url AND valid_time AND jsonb_typeof(p_raw->'placeId')='string' AND length(p_raw->>'placeId')>0
 AND jsonb_typeof(p_raw->'title')='string' AND length(p_raw->>'title')>0 AND jsonb_typeof(p_raw->'address')='string' AND length(p_raw->>'address')>0
 AND jsonb_typeof(p_raw->'categoryName')='string' AND CASE WHEN jsonb_typeof(p_raw->'openingHours')='array' THEN jsonb_array_length(p_raw->'openingHours')>0 ELSE false END
 AND jsonb_typeof(p_raw->'reviewsCount')='number' AND (p_raw->>'reviewsCount') ~ '^\d+$'
 AND jsonb_typeof(p_raw->'permanentlyClosed')='boolean' AND jsonb_typeof(p_raw->'temporarilyClosed')='boolean',false);
 yellow:=coalesce(src='yellow_pages' AND valid_url AND valid_time AND jsonb_typeof(p_raw->'name')='string' AND length(p_raw->>'name')>0
 AND nullif(p_raw->'yellowPagesId','null'::jsonb) IS NOT NULL AND nullif(p_raw->'address','null'::jsonb) IS NOT NULL AND nullif(p_raw->'hours','null'::jsonb) IS NOT NULL
 AND p_raw ? 'description' AND jsonb_typeof(p_raw->'paymentMethods')='array',false);
 social:=coalesce(website ~* '^https?://([a-z0-9-]+\.)*(facebook|instagram)\.com(/|$)',false);
 IF src<>'yelp' AND valid_url AND valid_time AND website ~* '^https?://[^ /]+(/|$)' THEN result:=CASE WHEN social THEN 'social_only' ELSE 'present' END;reason:=CASE WHEN social THEN 'social_profile_in_website_field' ELSE 'explicit_website' END;
 ELSIF maps AND (NOT p_raw ? 'website' OR p_raw->'website'='null'::jsonb OR website='') AND coalesce(p_website,'')='' THEN result:='none_found';reason:='maps_detail_record_no_website_listed';
 ELSIF yellow AND coalesce(website,'')='' THEN reason:='yellow_pages_absence_semantics_UNVERIFIED';END IF;
 RETURN jsonb_build_object('stamp_version','source_website_check_v1','source',src,'status',CASE WHEN url IS NOT NULL AND valid_time THEN 'checked' ELSE 'unknown' END,
 'source_url',url,'observed_at',observed,'website_result',result,'reason',reason,'detail_level',maps OR yellow,
 'website_field',CASE WHEN NOT p_raw ? 'website' THEN 'missing' WHEN p_raw->'website'='null'::jsonb THEN 'null' WHEN website='' THEN 'empty' ELSE 'present' END,
 'social_profiles',CASE WHEN social THEN jsonb_build_array(website) ELSE '[]'::jsonb END,
 'rating',coalesce(nullif(p_raw->'totalScore','null'::jsonb),p_raw->'rating','null'::jsonb),'reviews',coalesce(nullif(p_raw->'reviewsCount','null'::jsonb),p_raw->'reviewCount','null'::jsonb),
 'limitations',jsonb_build_array('Stored source record only; live listing and provider omission semantics remain UNVERIFIED.','none_found means no website listed in the checked record, not no website anywhere.'));
END $$;
REVOKE ALL ON FUNCTION enrichment_stamp_source(text,jsonb,text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION enrichment_source_checks(p_org integer,p_lead integer) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT coalesce(jsonb_agg(enrichment_stamp_source(s.source,s.raw_data,s.website) ORDER BY s.id),'[]'::jsonb)
 FROM cleaning_links l JOIN staging_leads s ON s.id=l.staging_id AND s.org_id=l.org_id
 WHERE l.org_id=p_org AND l.cleaned_id=p_lead AND s.source IN ('google_maps','yellow_pages','yelp') AND contact_eligible(l.org_id,l.cleaned_id,l.staging_id)
$$;
REVOKE ALL ON FUNCTION enrichment_source_checks(integer,integer) FROM PUBLIC;
CREATE OR REPLACE FUNCTION enrichment_fingerprint(p_org integer,p_lead integer,p_kind text) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT md5(jsonb_build_object('source_checks',enrichment_source_checks(p_org,p_lead),'name',c.company_name,'website',c.website,'phone',c.phone,'city',c.city,'country',c.country,'category',c.category,
 'basic',CASE WHEN p_kind='research' THEN p.basic END,'linkedin',CASE WHEN p_kind='research' THEN l.evidence END,'campaign',CASE WHEN p_kind='research' THEN g.config END)::text)
 FROM cleaned_leads c LEFT JOIN enrichment_profiles p ON p.org_id=c.org_id AND p.lead_id=c.id LEFT JOIN enrichment_linkedin l ON l.org_id=c.org_id AND l.lead_id=c.id LEFT JOIN enrichment_campaigns g ON g.org_id=c.org_id AND g.lead_id=c.id WHERE c.org_id=p_org AND c.id=p_lead
$$;
CREATE OR REPLACE FUNCTION enrichment_task_input(p_id bigint,p_lease text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('source_checks',enrichment_source_checks(c.org_id,c.id),'kind',t.kind,'lead',jsonb_build_object('id',c.id,'org_id',c.org_id,'company_name',c.company_name,'website',c.website,'phone',c.phone,'city',c.city,'country',c.country,'category',c.category),'basic',p.basic,'linkedin',l.evidence,'campaign',g.config)
 FROM enrichment_tasks t JOIN cleaned_leads c ON c.id=t.lead_id AND c.org_id=t.org_id LEFT JOIN enrichment_profiles p ON p.lead_id=c.id AND p.org_id=c.org_id LEFT JOIN enrichment_linkedin l ON l.lead_id=c.id AND l.org_id=c.org_id LEFT JOIN enrichment_campaigns g ON g.lead_id=c.id AND g.org_id=c.org_id
 WHERE t.id=p_id AND t.lease=p_lease AND t.status='processing' AND t.lease_until>now() AND contact_eligible(t.org_id,t.lead_id,t.staging_id) AND t.fingerprint=enrichment_fingerprint(t.org_id,t.lead_id,t.kind)
$$;

CREATE OR REPLACE FUNCTION lead_trust_report(p_org integer,p_lead integer) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE c cleaned_leads%ROWTYPE;p enrichment_profiles%ROWTYPE;basic_fresh boolean;research_fresh boolean;
 flags jsonb; emails jsonb; verified_email boolean; identity_status text; reasons jsonb:='[]';has_evidence boolean; presence text; warnings jsonb; malformed boolean;
BEGIN
 SELECT * INTO c FROM cleaned_leads WHERE id=p_lead AND org_id=p_org;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM cleaning_links l WHERE l.cleaned_id=p_lead AND l.org_id=p_org AND contact_eligible(l.org_id,l.cleaned_id,l.staging_id)) THEN RETURN NULL; END IF;
 SELECT * INTO p FROM enrichment_profiles WHERE org_id=p_org AND lead_id=p_lead;
 malformed:=jsonb_typeof(p.basic) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM (VALUES(p.basic->'pages'),(p.basic->'evidence'),(p.basic->'services'),(p.basic->'quality_flags'),(p.basic->'signals'->'social'->'facebook'),(p.basic->'signals'->'social'->'instagram'),(p.basic->'signals'->'web_presence'->'checks')) a(v) WHERE jsonb_typeof(v) IS DISTINCT FROM 'array');
 basic_fresh:=NOT malformed AND coalesce(p.basic_at<=now() AND p.basic_at>now()-interval '30 days' AND p.basic->>'input_fingerprint'=enrichment_fingerprint(p_org,p_lead,'basic'),false);
 research_fresh:=coalesce(p.research_at<=now() AND p.research_at>now()-interval '7 days' AND p.research->>'input_fingerprint'=enrichment_fingerprint(p_org,p_lead,'research'),false);
 has_evidence:=coalesce(basic_fresh AND (jsonb_array_length(CASE WHEN jsonb_typeof(p.basic->'evidence')='array' THEN p.basic->'evidence' ELSE '[]'::jsonb END)>0 OR jsonb_array_length(CASE WHEN jsonb_typeof(p.basic->'services')='array' THEN p.basic->'services' ELSE '[]'::jsonb END)>0)
 OR research_fresh AND jsonb_array_length(CASE WHEN jsonb_typeof(p.research->'linkedin'->'profiles')='array' THEN p.research->'linkedin'->'profiles' ELSE '[]'::jsonb END)>0,false);
 flags:=CASE WHEN jsonb_typeof(p.basic->'quality_flags')='array' THEN p.basic->'quality_flags' ELSE '[]'::jsonb END;
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
 WHEN research_fresh AND EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p.research->'linkedin'->'profiles')='array' THEN p.research->'linkedin'->'profiles' ELSE '[]'::jsonb END) x WHERE x->>'kind'='company') THEN 'source_correlated_not_independently_verified'
 ELSE 'unconfirmed' END;
 IF NOT has_evidence THEN reasons:=reasons||'"missing_or_stale_business_evidence"'::jsonb;END IF;
 IF identity_status='unconfirmed' THEN reasons:=reasons||'"business_identity_unconfirmed"'::jsonb;END IF;
 IF jsonb_array_length(flags)>0 THEN reasons:=reasons||'"conflicting_business_evidence"'::jsonb;END IF;
 IF NOT verified_email THEN reasons:=reasons||'"no_fresh_provider_verified_email"'::jsonb;END IF;
 presence:=CASE WHEN NOT basic_fresh THEN 'unknown' WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p.basic->'pages')='array' THEN p.basic->'pages' ELSE '[]'::jsonb END) x WHERE x->>'usable_html'='true' AND x->>'status'='200') THEN 'present' WHEN p.basic->'signals'->'web_presence'->>'state'='social_only' AND jsonb_array_length(CASE WHEN jsonb_typeof(p.basic->'pages')='array' THEN p.basic->'pages' ELSE '[]'::jsonb END)=0 AND (jsonb_array_length(CASE WHEN jsonb_typeof(p.basic->'signals'->'social'->'facebook')='array' THEN p.basic->'signals'->'social'->'facebook' ELSE '[]'::jsonb END)>0 OR jsonb_array_length(CASE WHEN jsonb_typeof(p.basic->'signals'->'social'->'instagram')='array' THEN p.basic->'signals'->'social'->'instagram' ELSE '[]'::jsonb END)>0) THEN 'social_only' WHEN c.website IS NULL AND p.basic->'signals'->'web_presence'->>'state'='none_found' AND jsonb_array_length(CASE WHEN jsonb_typeof(p.basic->'pages')='array' THEN p.basic->'pages' ELSE '[]'::jsonb END)=0 AND jsonb_array_length(CASE WHEN jsonb_typeof(p.basic->'signals'->'web_presence'->'checks')='array' THEN p.basic->'signals'->'web_presence'->'checks' ELSE '[]'::jsonb END)>0 AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p.basic->'signals'->'web_presence'->'checks')='array' THEN p.basic->'signals'->'web_presence'->'checks' ELSE '[]'::jsonb END) x WHERE x->>'website_result' IS DISTINCT FROM 'none_found' OR x->>'source' NOT IN ('maps_listing','yellow_pages') OR x->>'source_url' IS NULL) THEN 'none_found' ELSE 'unknown' END;
 warnings:=CASE WHEN malformed THEN '["malformed_basic_evidence"]'::jsonb ELSE '[]'::jsonb END || CASE WHEN p.basic->'signals'->'site_quality_flags'->'placeholder_text'->>'observed'='true' THEN '["template_site_suspected"]'::jsonb ELSE '[]'::jsonb END;
 RETURN jsonb_build_object('assessment_status',CASE WHEN p.basic IS NOT NULL OR EXISTS(SELECT 1 FROM enrichment_attempts a JOIN enrichment_tasks t ON t.id=a.task_id WHERE t.org_id=p_org AND t.lead_id=p_lead AND t.kind='basic' AND a.result IS NOT NULL) THEN 'assessed' ELSE 'not_assessed' END,'website_presence',presence,'warnings',warnings,'website_current_meaning','Freshness of the website assessment, not evidence that a website exists.','version','lead_trust_v1','fully_verified',false,
 'overall_status',CASE WHEN jsonb_array_length(flags)>0 THEN 'needs_review' WHEN NOT has_evidence THEN 'insufficient_fresh_evidence' WHEN verified_email THEN 'contact_verified_business_review_required' ELSE 'evidence_available_contacts_unverified' END,
 'identity',jsonb_build_object('status',identity_status,'method','name_and_website_matching_only','independent_verification',false),
 'fields',jsonb_build_object(
 'company_name',jsonb_build_object('value',c.company_name,'status','recorded_not_independently_verified','source','cleaned_record'),
 'category',jsonb_build_object('value',c.category,'status','recorded_not_independently_verified','source','cleaned_record'),
 'location',jsonb_build_object('city',c.city,'country',c.country,'status','recorded_not_independently_verified','source','cleaned_record'),
 'phone',jsonb_build_object('value',c.phone,'status',CASE WHEN c.phone IS NULL THEN 'missing' ELSE 'ownership_and_reachability_unknown' END,'source','cleaned_record'),
 'website',jsonb_build_object('value',c.website,'status',CASE WHEN c.website IS NULL THEN 'missing' WHEN NOT basic_fresh THEN 'stale_or_unchecked' WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p.basic->'pages')='array' THEN p.basic->'pages' ELSE '[]'::jsonb END) x WHERE x->>'status'='200') THEN 'page_observed_ownership_unverified' ELSE 'unavailable_or_blocked' END,'observed_at',p.basic_at,'sources',p.basic->'pages'),
 'emails',emails),
 'freshness',jsonb_build_object('website_current',basic_fresh,'research_current',research_fresh),
 'conflicts',flags,'blocking_reasons',reasons,'usable_for',jsonb_build_object('manual_research',has_evidence,'automatic_outreach',false),
 'ai_policy','source_excerpts_only_no_verified_recommendations','evaluated_at',now());
END $$;

CREATE OR REPLACE FUNCTION enrichment_finish(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE t enrichment_tasks%ROWTYPE;r jsonb:=p->'result';outcome text;
BEGIN
 IF (CASE WHEN jsonb_typeof(p)='object' THEN coalesce(p->>'id' ~ '^[0-9]{1,18}$',false) ELSE false END) THEN NULL; ELSE RETURN '{"saved":false,"status":"failed","reason":"invalid_payload"}';END IF;
 SELECT * INTO t FROM enrichment_tasks WHERE id=(p->>'id')::bigint FOR UPDATE;
 IF NOT FOUND OR t.status<>'processing' OR t.lease IS DISTINCT FROM p->>'lease' OR t.lease_until<=now() THEN RETURN '{"saved":false,"reason":"stale_lease"}';END IF;
 IF NOT contact_eligible(t.org_id,t.lead_id,t.staging_id) OR t.fingerprint IS DISTINCT FROM enrichment_fingerprint(t.org_id,t.lead_id,t.kind) THEN
 UPDATE enrichment_tasks SET status='pending',attempts=0,next_attempt=now(),lease=NULL,lease_until=NULL WHERE id=t.id;RETURN '{"saved":false,"reason":"source_changed"}';END IF;
 outcome:=CASE WHEN p->>'status' IN ('complete','partial') AND r->>'version'='enrichment_v1' THEN p->>'status' ELSE 'failed' END;
 IF t.kind='basic' AND (jsonb_typeof(r) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM (VALUES(r->'pages'),(r->'evidence'),(r->'services'),(r->'quality_flags'),(r->'signals'->'social'->'facebook'),(r->'signals'->'social'->'instagram'),(r->'signals'->'web_presence'->'checks')) a(v) WHERE jsonb_typeof(v) IS DISTINCT FROM 'array')) THEN outcome:='failed';END IF;
 IF t.kind='basic' AND (r->>'status'='failed' OR r->>'reason'='blocked_target' OR
 (CASE WHEN jsonb_typeof(r->'pages')='array' THEN jsonb_array_length(r->'pages')>0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'pages') x WHERE x->>'usable_html'='true') ELSE true END)) THEN outcome:='failed';END IF;
 -- Failed refreshes are recorded only in attempt history. Preserve last good evidence and its timestamps.
 IF outcome IN ('complete','partial') THEN
 r:=r||jsonb_build_object('input_fingerprint',t.fingerprint);
 INSERT INTO enrichment_profiles(org_id,lead_id) VALUES(t.org_id,t.lead_id) ON CONFLICT DO NOTHING;
 IF t.kind='basic' THEN UPDATE enrichment_profiles SET basic=r,basic_at=now(),research=NULL,research_at=NULL WHERE org_id=t.org_id AND lead_id=t.lead_id;
 ELSE UPDATE enrichment_profiles SET research=r,research_at=now() WHERE org_id=t.org_id AND lead_id=t.lead_id;END IF;
 END IF;
 UPDATE enrichment_tasks SET status=CASE WHEN outcome='failed' AND attempts<3 THEN 'pending' ELSE outcome END,next_attempt=now()+interval '10 minutes',finished_at=now(),lease_until=NULL,error=CASE WHEN outcome='failed' THEN CASE WHEN r->>'reason'='temporary_source_failure' AND r->>'retryable'='true' THEN 'temporary_source_failure' ELSE 'invalid_worker_result' END ELSE NULL END WHERE id=t.id;
 UPDATE enrichment_attempts SET finished_at=now(),result=p WHERE lease=t.lease;
 RETURN jsonb_build_object('saved',outcome IN ('complete','partial'),'status',outcome);
END $$;

-- Production n8n and helpers use this existing role. Explicit grants also cover a separate migration owner.
GRANT EXECUTE ON FUNCTION enrichment_stamp_source(text,jsonb,text),enrichment_source_checks(integer,integer) TO n8n_user;
COMMIT;
