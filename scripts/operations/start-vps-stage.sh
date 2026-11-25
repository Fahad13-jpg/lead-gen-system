#!/usr/bin/env bash
set -euo pipefail
cd /opt/leadmorrow
BASE='n8nio/n8n@sha256:d055b7a9ea7da77fbcac60f17ba8517657648b0915a36dde818e44892a718964'
test -f private-migration/RESTORE_COMPLETE
test -f private-migration/CONFIG_COMPLETE
docker run --rm --user 0 --network none --entrypoint node -v /opt/leadmorrow:/work -w /work "$BASE" -e '
const fs=require("fs");
const dir="private-migration/secrets/",p=fs.readFileSync(dir+"gateway-database-password","utf8").trim();
if(!/^[a-f0-9]{64}$/.test(p))throw Error("PASSWORD_FORMAT");
const file=dir+"gmail-client.json",cfg=JSON.parse(fs.readFileSync(file));
if(!cfg.web||!Array.isArray(cfg.web.redirect_uris))throw Error("OAUTH_CONFIG_FORMAT");
const callback="https://leadmorrow.tech/oauth/gmail/callback";
if(!cfg.web.redirect_uris.includes(callback)){cfg.web.redirect_uris.push(callback);fs.writeFileSync(file,JSON.stringify(cfg,null,2),{mode:420});}
const reviewMigration=fs.existsSync("database/migrations/075_cleaning_review_decisions.sql")?fs.readFileSync("database/migrations/075_cleaning_review_decisions.sql","utf8"):"";
const sql="DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=\u0027lead_dashboard\u0027) THEN CREATE ROLE lead_dashboard LOGIN; END IF; END $$;\n"+
"ALTER ROLE lead_dashboard NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD \u0027"+p+"\u0027;\n"+
reviewMigration+"\n"+
"GRANT CONNECT ON DATABASE lead_db TO lead_dashboard; GRANT USAGE ON SCHEMA public TO lead_dashboard;\n"+
"DO $$ DECLARE t record; BEGIN FOR t IN SELECT tablename FROM pg_tables WHERE schemaname=\u0027public\u0027 AND (tablename IN (\u0027organizations\u0027,\u0027users\u0027,\u0027staging_leads\u0027,\u0027cleaned_leads\u0027,\u0027enriched_leads\u0027,\u0027scraping_jobs\u0027,\u0027outreach_activities\u0027,\u0027sales_queue\u0027,\u0027workflow_entity\u0027,\u0027apify_diagnostic_runs\u0027) OR tablename ~ \u0027^(organization_|org_|workspace_|strategy_|enrichment_|lead_|cleaning_|contact_|gathering_|sender_|gmail_|sms_|calling_|email_)\u0027) LOOP EXECUTE format(\u0027GRANT SELECT ON TABLE public.%I TO lead_dashboard\u0027,t.tablename); END LOOP; END $$;\n"+
"DO $$ DECLARE f record; BEGIN FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=\u0027public\u0027 AND (p.provolatile IN (\u0027s\u0027,\u0027i\u0027) OR p.proname IN (\u0027strategy_context\u0027,\u0027strategy_report\u0027,\u0027enrichment_dashboard_report\u0027,\u0027enrichment_source_checks\u0027,\u0027outreach_linkedin_queue\u0027)) LOOP EXECUTE format(\u0027GRANT EXECUTE ON FUNCTION %s TO lead_dashboard\u0027,f.signature); END LOOP; END $$;\n";
fs.writeFileSync("private-migration/gateway-readonly.sql",sql,{mode:384});
console.log("Gmail callback file updated; initial read access prepared.");'
if [ "$(docker inspect -f '{{.State.Running}}' leadmorrow_db_restore 2>/dev/null || true)" = true ]; then
 docker exec -i leadmorrow_db_restore psql -U n8n_user -d lead_db -v ON_ERROR_STOP=1 < private-migration/gateway-readonly.sql
 docker stop leadmorrow_db_restore >/dev/null
fi
docker compose --env-file deployment/target.env -f deployment/compose.application.yml config --quiet
docker compose --env-file deployment/target.env -f deployment/compose.application.yml up -d postgres
docker compose --env-file deployment/target.env -f deployment/compose.application.yml --profile application up -d
docker compose --env-file deployment/target.env -f deployment/compose.application.yml --profile application ps
echo 'Private staging started. Workflows remain paused; initial gateway access is read-only.'
