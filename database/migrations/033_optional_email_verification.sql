-- Optional paid verification, explicit campaign policy; no schema or sending activation.
BEGIN;
CREATE OR REPLACE FUNCTION outreach_email_eligibility(x jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE mode text:=coalesce(x->'campaign'->'config'->>'email_verification_policy','provider_required');
 recipient text:=x->'lead'->>'email'; c cleaned_leads%ROWTYPE; e lead_contacts%ROWTYPE; domain text;
BEGIN
 IF mode NOT IN ('basic','provider_required') THEN RETURN '{"allowed":false,"reason":"invalid_email_verification_policy"}';END IF;
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
 AND status IN ('pending','verified','unknown') AND method IN ('source_record','published_website','published_facebook')
 AND created_at<=now() AND created_at>now()-interval '30 days';
 IF NOT FOUND THEN RETURN '{"allowed":false,"reason":"email_published_contact_required"}';END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(e.evidence)='array' THEN e.evidence ELSE '[]'::jsonb END) proof
 WHERE proof->>'email'=recipient AND proof->>'method'=e.method AND (
 (e.method IN ('published_website','published_facebook') AND proof->>'source_url' ~ '^https?://[^[:space:]]+') OR
 (e.method='source_record' AND nullif(proof->>'source_field','') IS NOT NULL AND EXISTS(SELECT 1 FROM cleaning_links l WHERE l.org_id=c.org_id AND l.cleaned_id=c.id AND l.staging_id::text=proof->>'staging_id' AND contact_eligible(l.org_id,l.cleaned_id,l.staging_id))))) THEN
 RETURN '{"allowed":false,"reason":"email_published_evidence_required"}';END IF;
 RETURN '{"allowed":true,"classification":"basic_unverified","deliverability":"unknown","dns_checked":false,"provider_verification":false}';
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
 RETURN '{"allowed":false,"reason":"invalid_email_identity"}';
END $$;
REVOKE ALL ON FUNCTION outreach_email_eligibility(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_email_eligibility(jsonb) TO n8n_user;

CREATE OR REPLACE FUNCTION outreach_dispatch_check(p jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE v strategy_plans%ROWTYPE; a strategy_approvals%ROWTYPE; x jsonb; o integer; pid bigint; eligibility jsonb;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR coalesce(p->>'org_id','') !~ '^[1-9][0-9]{0,9}$'
 OR coalesce(p->>'plan_id','') !~ '^[1-9][0-9]{0,18}$' OR p->>'step' IS DISTINCT FROM '1' THEN
  RETURN '{"ready":false,"reason":"invalid_request_or_unreviewed_followup","execution_authorized":false}'; END IF;
 o:=(p->>'org_id')::integer;pid:=(p->>'plan_id')::bigint;
 SELECT * INTO v FROM strategy_plans WHERE org_id=o AND id=pid;
 IF NOT FOUND THEN RETURN '{"ready":false,"reason":"not_found","execution_authorized":false}';END IF;
 IF p->>'content_hash' IS DISTINCT FROM v.content_hash OR md5(v.body::text) IS DISTINCT FROM v.content_hash THEN
  RETURN '{"ready":false,"reason":"content_changed","execution_authorized":false}';END IF;
 IF v.body->>'version' IS DISTINCT FROM 'strategy_v2' OR coalesce(v.body->>'state','') NOT IN ('ai_completed','template_completed','template_fallback')
 OR (CASE WHEN jsonb_typeof(v.body->'blocking_reasons')='array' THEN jsonb_array_length(v.body->'blocking_reasons')<>0 ELSE true END)
 OR (CASE WHEN jsonb_typeof(v.body->'validation_errors')='array' THEN jsonb_array_length(v.body->'validation_errors')<>0 ELSE true END) THEN
  RETURN '{"ready":false,"reason":"plan_blocked","execution_authorized":false}';END IF;
 SELECT * INTO a FROM strategy_approvals WHERE org_id=o AND plan_id=pid ORDER BY id DESC LIMIT 1;
 IF NOT FOUND OR a.action<>'approve' OR a.content_hash IS DISTINCT FROM v.content_hash THEN
  RETURN '{"ready":false,"reason":"approval_required","execution_authorized":false}';END IF;
 x:=strategy_context(o,v.campaign_id,v.lead_id);
 IF x IS NULL OR v.fingerprint IS DISTINCT FROM x->>'fingerprint' OR v.expires_at<=now() THEN
  RETURN '{"ready":false,"reason":"stale_plan","execution_authorized":false}';END IF;
 IF x->>'suppressed' IS DISTINCT FROM 'false' OR x->>'replied' IS DISTINCT FROM 'false'
 OR EXISTS(SELECT 1 FROM outreach_activities WHERE org_id=o AND lead_id=v.lead_id AND (replied_at IS NOT NULL OR bounced_at IS NOT NULL)) THEN
  RETURN '{"ready":false,"reason":"suppressed_replied_or_bounced","execution_authorized":false}';END IF;
 IF v.body->'strategy'->'step1'->>'channel' IS DISTINCT FROM 'email' THEN
  RETURN '{"ready":false,"reason":"channel_not_integrated","execution_authorized":false}';END IF;
 eligibility:=outreach_email_eligibility(x);
 IF eligibility->>'allowed' IS DISTINCT FROM 'true' THEN RETURN jsonb_build_object('ready',false,'reason',eligibility->>'reason','execution_authorized',false);END IF;
 RETURN jsonb_build_object('ready',true,'org_id',o,'plan_id',pid,'lead_id',v.lead_id,'content_hash',v.content_hash,'channel','email','email_eligibility',eligibility,
 'execution_authorized',false,'reason','eligible_for_reservation_only');
EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN
 RETURN '{"ready":false,"reason":"invalid_request_or_unreviewed_followup","execution_authorized":false}';
END $$;
CREATE OR REPLACE FUNCTION strategy_context(p_org integer,p_campaign bigint,p_lead integer) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
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
 result:=result||jsonb_build_object('email_eligibility',outreach_email_eligibility(result));
 RETURN result||jsonb_build_object('fingerprint',md5(result::text));
END $$;
COMMIT;
