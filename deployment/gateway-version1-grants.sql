-- Run only against the restored target database. No workflows or sends are started.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='lead_dashboard') THEN
  RAISE EXCEPTION 'Create the target gateway role first';
 END IF;
END $$;
GRANT SELECT ON credentials_entity,shared_credentials,shared_workflow TO lead_dashboard;
GRANT SELECT ON unsubscribes TO lead_dashboard;
GRANT INSERT,UPDATE ON credentials_entity TO lead_dashboard;
GRANT INSERT ON shared_credentials TO lead_dashboard;
GRANT SELECT,INSERT,UPDATE,DELETE ON gmail_oauth_sessions TO lead_dashboard;
GRANT SELECT,INSERT,UPDATE ON gmail_enrollment_journal TO lead_dashboard;
GRANT INSERT ON organizations,org_sender_memberships,workspace_enrollments,strategy_ai_controls,
 lead_import_batches,lead_import_rows,staging_leads TO lead_dashboard;
GRANT UPDATE (gateway_lock_guard) ON organizations,org_sender_memberships TO lead_dashboard;
GRANT UPDATE (gateway_lock_guard) ON strategy_plans TO lead_dashboard;
GRANT INSERT,UPDATE ON sender_connections,strategy_campaigns,strategy_campaign_versions,
 outreach_activities TO lead_dashboard;
GRANT INSERT ON strategy_approvals TO lead_dashboard;
-- Shared email draft preparation queues jobs through strategy_enqueue.
GRANT INSERT ON strategy_jobs TO lead_dashboard;
GRANT USAGE,SELECT ON SEQUENCE strategy_jobs_id_seq TO lead_dashboard;
DO $$ DECLARE seq record; fn record; BEGIN
 FOR seq IN SELECT pg_get_serial_sequence('public.'||quote_ident(t),'id') AS name
  FROM unnest(ARRAY['organizations','lead_import_batches','staging_leads','strategy_campaigns',
   'strategy_approvals','outreach_activities']) t LOOP
  IF seq.name IS NOT NULL THEN EXECUTE format('GRANT USAGE,SELECT ON SEQUENCE %s TO lead_dashboard',seq.name);END IF;
 END LOOP;
 FOR fn IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN (
   'sender_connection_manage','sender_connection_checked','sender_connection_bind',
   'strategy_campaign_save','strategy_approval','strategy_context','strategy_report',
   'outreach_linkedin_prepare','outreach_linkedin_event','outreach_linkedin_queue',
   'outreach_linkedin_step_check','outreach_linkedin_check',
   'email_campaign_authority_manage','email_campaign_automation_control') LOOP
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO lead_dashboard',fn.signature);
 END LOOP;
END $$;
COMMIT;
