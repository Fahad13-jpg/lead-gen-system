BEGIN;
CREATE TABLE IF NOT EXISTS enrichment_linkedin_controls(id boolean PRIMARY KEY DEFAULT true CHECK(id),enabled boolean NOT NULL DEFAULT false,monthly_cap_usd numeric NOT NULL DEFAULT 0.50 CHECK(monthly_cap_usd>=0));
INSERT INTO enrichment_linkedin_controls(id) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS enrichment_linkedin_policy(org_id integer PRIMARY KEY REFERENCES organizations(id),enabled boolean NOT NULL DEFAULT false,account_id bigint REFERENCES gathering_accounts(id));
CREATE TABLE IF NOT EXISTS enrichment_linkedin_jobs(id bigserial PRIMARY KEY,org_id integer NOT NULL REFERENCES organizations(id),lead_id integer NOT NULL REFERENCES cleaned_leads(id),staging_id integer NOT NULL REFERENCES staging_leads(id),fingerprint text NOT NULL,kind text NOT NULL CHECK(kind IN ('company','person','employees','posts')),target text NOT NULL,actor text NOT NULL,input jsonb NOT NULL,status text NOT NULL DEFAULT 'pending',reason text,reference text UNIQUE,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(org_id,lead_id,fingerprint,kind,target));
CREATE OR REPLACE FUNCTION enrichment_linkedin_reserve(p_id bigint) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE j enrichment_linkedin_jobs%ROWTYPE;cfg enrichment_linkedin_controls%ROWTYPE;pol enrichment_linkedin_policy%ROWTYPE;a gathering_accounts%ROWTYPE;spent numeric;reserved numeric;wallet numeric;charge numeric;cap numeric:=0.05;ref text;
BEGIN
 SELECT * INTO j FROM enrichment_linkedin_jobs WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR j.status NOT IN ('pending','budget_blocked','disabled') THEN RETURN '{"ready":false}';END IF;
 IF NOT contact_eligible(j.org_id,j.lead_id,j.staging_id) OR j.fingerprint IS DISTINCT FROM enrichment_fingerprint(j.org_id,j.lead_id,'basic') THEN UPDATE enrichment_linkedin_jobs SET status='superseded' WHERE id=j.id;RETURN '{"ready":false}';END IF;
 PERFORM 1 FROM organizations WHERE id=j.org_id FOR UPDATE;
 SELECT * INTO cfg FROM enrichment_linkedin_controls WHERE id FOR UPDATE;
 SELECT * INTO pol FROM enrichment_linkedin_policy WHERE org_id=j.org_id;
 IF NOT cfg.enabled OR pol.org_id IS NULL OR NOT pol.enabled THEN UPDATE enrichment_linkedin_jobs SET status='disabled',reason='collection_disabled' WHERE id=j.id;RETURN '{"ready":false}';END IF;
 SELECT * INTO a FROM gathering_accounts WHERE id=pol.account_id AND enabled AND (mode='platform' OR org_id=j.org_id) FOR UPDATE;
 IF NOT FOUND OR a.api_key IS NULL OR a.provider_user_id IS NULL THEN RETURN '{"ready":false}';END IF;
 SELECT coalesce(sum(coalesce(actual_cost_usd,max_cost_usd)),0) INTO spent FROM apify_diagnostic_runs WHERE reference LIKE 'linkedin-job-%' AND (created_at>=date_trunc('month',now()) OR actual_cost_usd IS NULL);
 SELECT coalesce(sum(max_cost_usd),0) INTO reserved FROM scraping_jobs WHERE provider_account_id=a.id AND (status IN ('queued','pending','running','needs_review') OR (actual_cost IS NULL AND apify_actor_run_id IS NOT NULL));
 IF spent+cap>cfg.monthly_cap_usd OR gathering_account_spent(a.id)+reserved+cap>a.monthly_budget_usd THEN UPDATE enrichment_linkedin_jobs SET status='budget_blocked',reason='monthly_budget' WHERE id=j.id;RETURN '{"ready":false}';END IF;
 ref:='linkedin-job-'||j.id;
 IF a.mode='platform' THEN
  charge:=round(cap*a.price_multiplier,6);
  SELECT coalesce(sum(amount_usd),0) INTO wallet FROM gathering_wallet_entries WHERE org_id=j.org_id;
  SELECT coalesce(sum(customer_reserved_usd),0) INTO reserved FROM scraping_jobs WHERE org_id=j.org_id AND billing_mode='platform' AND (status IN ('queued','pending','running','needs_review') OR (actual_cost IS NULL AND apify_actor_run_id IS NOT NULL));
  IF wallet-reserved<charge THEN UPDATE enrichment_linkedin_jobs SET status='budget_blocked',reason='insufficient_platform_credits' WHERE id=j.id;RETURN '{"ready":false}';END IF;
  INSERT INTO gathering_wallet_entries(org_id,amount_usd,reference) VALUES(j.org_id,-charge,ref||'-reserve');
 END IF;
 INSERT INTO apify_diagnostic_runs(reference,provider_account_id,actor_id,input,max_cost_usd) VALUES(ref,a.id,j.actor,j.input,cap);
 UPDATE enrichment_linkedin_jobs SET status='starting',reference=ref,reason=NULL WHERE id=j.id;
 RETURN jsonb_build_object('ready',true,'api_key',a.api_key,'reference',ref,'cap',cap);
END $$;
CREATE OR REPLACE FUNCTION enrichment_linkedin_settle(p_id bigint,p_cost numeric) RETURNS void LANGUAGE plpgsql AS $$
DECLARE j enrichment_linkedin_jobs%ROWTYPE;d apify_diagnostic_runs%ROWTYPE;held numeric;
BEGIN
 SELECT * INTO j FROM enrichment_linkedin_jobs WHERE id=p_id FOR UPDATE;SELECT * INTO d FROM apify_diagnostic_runs WHERE reference=j.reference FOR UPDATE;
 IF d.reference IS NULL OR p_cost IS NULL OR p_cost<0 THEN RAISE EXCEPTION 'Invalid settlement';END IF;
 IF d.actual_cost_usd IS NOT NULL THEN IF d.actual_cost_usd<>p_cost THEN RAISE EXCEPTION 'Cost reconciliation required';END IF;RETURN;END IF;
 SELECT -amount_usd INTO held FROM gathering_wallet_entries WHERE reference=j.reference||'-reserve';
 IF held IS NOT NULL THEN INSERT INTO gathering_wallet_entries(org_id,amount_usd,reference) VALUES(j.org_id,greatest(0,held*(1-p_cost/d.max_cost_usd)),j.reference||'-settle');END IF;
 UPDATE apify_diagnostic_runs SET actual_cost_usd=p_cost,finished_at=now() WHERE reference=j.reference;
END $$;
REVOKE EXECUTE ON FUNCTION enrichment_linkedin_reserve(bigint),enrichment_linkedin_settle(bigint,numeric) FROM PUBLIC;
CREATE OR REPLACE FUNCTION enrichment_report(p_org integer,p_lead integer) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('org_id',c.org_id,'lead_id',c.id,'basic',p.basic,'research',p.research,'tasks',(SELECT coalesce(jsonb_agg(jsonb_build_object('kind',kind,'status',status,'attempts',attempts,'error',error)),'[]') FROM enrichment_tasks WHERE org_id=c.org_id AND lead_id=c.id),'linkedin_jobs',(SELECT coalesce(jsonb_agg(jsonb_build_object('kind',j.kind,'status',j.status,'reason',j.reason,'cost_usd',d.actual_cost_usd)),'[]') FROM enrichment_linkedin_jobs j LEFT JOIN apify_diagnostic_runs d ON d.reference=j.reference WHERE j.org_id=c.org_id AND j.lead_id=c.id),'contact',contact_lead_report(c.org_id,c.id),'outreach_context',CASE WHEN p.research_at>now()-interval '7 days' AND p.research->>'input_fingerprint'=enrichment_fingerprint(c.org_id,c.id,'research') THEN p.research->'personalization' ELSE '[]'::jsonb END,'automatic_linkedin_collection',coalesce((SELECT cfg.enabled AND pol.enabled FROM enrichment_linkedin_controls cfg CROSS JOIN enrichment_linkedin_policy pol WHERE cfg.id AND pol.org_id=c.org_id),false))
 FROM cleaned_leads c LEFT JOIN enrichment_profiles p ON p.org_id=c.org_id AND p.lead_id=c.id WHERE c.org_id=p_org AND c.id=p_lead AND EXISTS(SELECT 1 FROM cleaning_links l WHERE l.org_id=c.org_id AND l.cleaned_id=c.id AND contact_eligible(c.org_id,c.id,l.staging_id))
$$;
COMMIT;
