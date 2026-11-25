-- Evidence-based legacy contact eligibility. No contact promotion or activation.
BEGIN;
CREATE OR REPLACE FUNCTION outreach_email_eligibility(x jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE mode text:=coalesce(x->'campaign'->'config'->>'email_verification_policy','provider_required');
 recipient text:=x->'lead'->>'email'; c cleaned_leads%ROWTYPE; e lead_contacts%ROWTYPE; domain text;
BEGIN
 IF mode NOT IN ('basic','provider_required') THEN RETURN '{"allowed":false,"reason":"invalid_email_verification_policy"}';END IF;
 IF recipient IS NULL OR trim(recipient)='' THEN RETURN '{"allowed":false,"reason":"email_missing"}';END IF;
 SELECT * INTO c FROM cleaned_leads WHERE org_id=(x->>'org_id')::integer AND id=(x->'lead'->>'id')::integer AND email=recipient;
 IF NOT FOUND THEN RETURN '{"allowed":false,"reason":"email_identity_changed"}';END IF;
 IF c.email_verification_status='invalid' OR EXISTS(SELECT 1 FROM lead_contacts WHERE org_id=c.org_id AND lead_id=c.id AND email=recipient
 AND (status IN ('invalid','risky','review') OR relevance_status IN ('excluded','review') OR verification->>'disposable'='true' OR verification->>'catch_all'='true'
 OR verification->>'deliverability'='UNDELIVERABLE' OR verification->>'format'='false' OR verification->>'mx'='false' OR verification->>'smtp'='false')) THEN
 RETURN '{"allowed":false,"reason":"email_known_invalid_risky_or_review"}';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(x->'report'->'trust'->'fields'->'emails')='array'
 THEN x->'report'->'trust'->'fields'->'emails' ELSE '[]'::jsonb END) item WHERE item->>'value'=recipient AND item->>'status'='provider_verified') THEN
 RETURN '{"allowed":true,"classification":"provider_verified"}';END IF;
 IF mode='provider_required' THEN RETURN '{"allowed":false,"reason":"email_not_freshly_verified"}';END IF;
 IF recipient IS NULL OR recipient<>lower(trim(recipient)) OR length(recipient)>254 OR length(split_part(recipient,'@',1))>64
 OR recipient !~ '^[a-z0-9!#$%&''*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&''*+/=?^_`{|}~-]+)*@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' THEN
 RETURN '{"allowed":false,"reason":"email_basic_format_failed"}';END IF;
 domain:=split_part(recipient,'@',2);
 IF domain IN ('example.com','example.org','example.net','mailinator.com','tempmail.com','guerrillamail.com') OR domain ~ '\.(invalid|test|localhost|example)$'
 OR split_part(recipient,'@',1) ~ '^(no[._-]?reply|donotreply|mailer-daemon|postmaster)([+._-]|$)' THEN RETURN '{"allowed":false,"reason":"email_non_contact_address"}';END IF;
 IF x->'report'->'trust' IS NULL OR x->'report'->'trust'='null'::jsonb
 OR (CASE WHEN jsonb_typeof(x->'report'->'trust'->'conflicts')='array' THEN jsonb_array_length(x->'report'->'trust'->'conflicts')>0 ELSE true END) THEN
 RETURN '{"allowed":false,"reason":"email_business_review_required"}';END IF;
 SELECT * INTO e FROM lead_contacts WHERE org_id=c.org_id AND lead_id=c.id AND email=recipient AND relevance_status='eligible'
 AND status IN ('pending','verified','unknown') AND method IN ('existing_record','source_record','published_website','published_facebook')
 AND created_at<=now() AND created_at>now()-interval '30 days';
 IF NOT FOUND THEN RETURN '{"allowed":false,"reason":"email_published_contact_required"}';END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(e.evidence)='array' THEN e.evidence ELSE '[]'::jsonb END) proof
 WHERE proof->>'email'=recipient AND coalesce(proof->>'relevance_status','eligible')='eligible' AND (
 (proof->>'method' IN ('published_website','published_facebook') AND proof->>'source_url' ~ '^https?://[^[:space:]]+') OR
 (proof->>'method'='source_record' AND nullif(proof->>'source_field','') IS NOT NULL AND EXISTS(SELECT 1 FROM cleaning_links l JOIN staging_leads s ON s.id=l.staging_id AND s.org_id=l.org_id WHERE l.org_id=c.org_id AND l.cleaned_id=c.id AND l.staging_id::text=proof->>'staging_id' AND lower(trim(s.email))=recipient AND contact_eligible(l.org_id,l.cleaned_id,l.staging_id))))) THEN
 RETURN '{"allowed":false,"reason":"email_published_evidence_required"}';END IF;
 RETURN '{"allowed":true,"classification":"basic_unverified","deliverability":"unknown","dns_checked":false,"provider_verification":false}';
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
 RETURN '{"allowed":false,"reason":"invalid_email_identity"}';
END $$;
REVOKE ALL ON FUNCTION outreach_email_eligibility(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_email_eligibility(jsonb) TO n8n_user;

COMMIT;
