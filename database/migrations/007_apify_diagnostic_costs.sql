BEGIN;
CREATE TABLE IF NOT EXISTS apify_diagnostic_runs (
 reference text PRIMARY KEY,provider_account_id bigint NOT NULL REFERENCES gathering_accounts(id),
 actor_id text NOT NULL,input jsonb NOT NULL,max_cost_usd numeric(14,6) NOT NULL CHECK(max_cost_usd>0),
 actual_cost_usd numeric(14,6) CHECK(actual_cost_usd>=0),run_id text UNIQUE,dataset_id text,status text NOT NULL DEFAULT 'reserved',
 created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz
);
REVOKE ALL ON apify_diagnostic_runs FROM PUBLIC;
CREATE OR REPLACE FUNCTION gathering_account_spent(p_account bigint) RETURNS numeric LANGUAGE sql STABLE AS $$
 SELECT (SELECT coalesce(sum(c.amount_usd),0) FROM gathering_costs c JOIN scraping_jobs j ON j.id=c.job_id JOIN gathering_accounts a ON a.id=p_account
 WHERE c.recorded_at>=date_trunc('month',now()) AND (j.provider_account_id=a.id OR (j.billing_mode IS NULL AND a.mode='byok' AND j.org_id=a.org_id)))
 + (SELECT coalesce(sum(coalesce(actual_cost_usd,max_cost_usd)),0) FROM apify_diagnostic_runs WHERE provider_account_id=p_account
 AND (created_at>=date_trunc('month',now()) OR actual_cost_usd IS NULL))
$$;
COMMIT;
