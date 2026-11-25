\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE s integer;l integer;a jsonb;t jsonb;
BEGIN
 ASSERT current_database()='lead_gathering_test_20260926';
 INSERT INTO organizations(id,org_name,status) VALUES(940067,'Trust fixture','active');
 INSERT INTO staging_leads(org_id,company_name,source,cleaning_status,raw_data) VALUES(940067,'Clinic','google_maps','cleaned','{}') RETURNING id INTO s;
 INSERT INTO cleaned_leads(org_id,staging_id,company_name,website) VALUES(940067,s,'Clinic','https://clinic.example') RETURNING id INTO l;
 INSERT INTO cleaning_links(staging_id,org_id,cleaned_id) VALUES(s,940067,l);
 ASSERT lead_trust_report(1,l) IS NULL;
 ASSERT lead_trust_report(940067,l)->>'overall_status'='insufficient_fresh_evidence';
 UPDATE enrichment_controls SET enabled=true,lead_ids=ARRAY[l];
 SELECT value INTO a FROM enrichment_claim('basic',1) value;
 ASSERT enrichment_finish(a||'{"status":"complete","result":{"version":"enrichment_v1","status":"complete","evidence":[{"source_url":"https://clinic.example","type":"website_description","value":"Clinic services"}],"pages":[{"url":"https://clinic.example","status":200}],"quality_flags":[]}}')->>'saved'='true';
 t:=lead_trust_report(940067,l);ASSERT t->>'fully_verified'='false';ASSERT t->>'overall_status'='evidence_available_contacts_unverified';
 INSERT INTO lead_contacts(org_id,lead_id,email,method,status,relevance_status,verified_at,expires_at)
 VALUES(940067,l,'test@clinic.example','website','verified','eligible',now(),now()+interval '7 days');
 -- A naked status flag without provider evidence must never be accepted.
 ASSERT lead_trust_report(940067,l)->'fields'->'emails'->0->>'status'='deliverability_unknown';
 UPDATE lead_contacts SET verification='{"deliverability":"DELIVERABLE","smtp":true,"format":true,"mx":true,"disposable":false,"catch_all":false}' WHERE org_id=940067 AND lead_id=l;
 ASSERT lead_trust_report(940067,l)->'fields'->'emails'->0->>'status'='provider_verified';
 ASSERT lead_trust_report(940067,l)->>'fully_verified'='false';
 UPDATE lead_contacts SET verified_at=now()+interval '1 day' WHERE org_id=940067 AND lead_id=l;
 ASSERT lead_trust_report(940067,l)->'fields'->'emails'->0->>'status'='deliverability_unknown';
 UPDATE lead_contacts SET verified_at=now(),relevance_status='review' WHERE org_id=940067 AND lead_id=l;
 ASSERT lead_trust_report(940067,l)->'fields'->'emails'->0->>'status'='deliverability_unknown';
 UPDATE lead_contacts SET relevance_status='eligible' WHERE org_id=940067 AND lead_id=l;
 UPDATE lead_contacts SET expires_at=now()-interval '1 second' WHERE org_id=940067 AND lead_id=l;
 ASSERT lead_trust_report(940067,l)->'fields'->'emails'->0->>'status'='expired';
 UPDATE enrichment_profiles SET basic=basic||'{"quality_flags":[{"code":"conflicting_phone_numbers"}]}' WHERE org_id=940067 AND lead_id=l;
 ASSERT lead_trust_report(940067,l)->>'overall_status'='needs_review';
 ASSERT enrichment_report(940067,l)->'outreach_context'='[]'::jsonb;
 UPDATE enrichment_profiles SET basic=basic||'{"quality_flags":[]}',basic_at=now()-interval '31 days' WHERE org_id=940067 AND lead_id=l;
 ASSERT lead_trust_report(940067,l)->>'overall_status'='insufficient_fresh_evidence';
 UPDATE enrichment_profiles SET research_at=now(),research=jsonb_build_object('input_fingerprint',enrichment_fingerprint(940067,l,'research'),'personalization',jsonb_build_array(jsonb_build_object('excerpt','Old website context'))) WHERE org_id=940067 AND lead_id=l;
 ASSERT lead_trust_report(940067,l)->'freshness'->>'research_current'='true';
 ASSERT enrichment_report(940067,l)->'outreach_context'='[]'::jsonb;
 UPDATE enrichment_profiles SET basic_at=now() WHERE org_id=940067 AND lead_id=l;
 UPDATE cleaned_leads SET website='https://different.example' WHERE id=l;
 ASSERT lead_trust_report(940067,l)->'freshness'->>'website_current'='false';
 ASSERT enrichment_report(940067,l)->'outreach_context'='[]'::jsonb;
 ASSERT enrichment_report(1,l) IS NULL;
 RAISE NOTICE 'PASS: ownership, missing evidence, raw flags rejected, verified evidence, expiry, conflicts, freshness and no automatic promotion';
END $$;
ROLLBACK;
