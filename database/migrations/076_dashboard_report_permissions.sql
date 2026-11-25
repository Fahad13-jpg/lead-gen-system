BEGIN;

-- The lead detail report reads provider evidence through enrichment_report.
-- Keep this read-only and scoped to the dashboard role.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lead_dashboard')
     AND to_regclass('public.apify_diagnostic_runs') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON TABLE public.apify_diagnostic_runs TO lead_dashboard';
  END IF;
END $$;

COMMIT;
