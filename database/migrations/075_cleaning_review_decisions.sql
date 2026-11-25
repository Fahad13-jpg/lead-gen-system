-- Keep a small, auditable decision for records that cleaning could not safely add.
-- The source row stays unchanged. A decision only closes the workspace alert.
BEGIN;

CREATE TABLE IF NOT EXISTS cleaning_review_decisions (
  org_id integer NOT NULL REFERENCES organizations(id),
  job_id integer NOT NULL REFERENCES scraping_jobs(id),
  staging_id integer NOT NULL REFERENCES staging_leads(id),
  action text NOT NULL CHECK (action = 'skip'),
  actor_subject text NOT NULL CHECK (length(actor_subject) BETWEEN 1 AND 255),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, staging_id)
);

CREATE INDEX IF NOT EXISTS cleaning_review_decisions_job
  ON cleaning_review_decisions(org_id, job_id, staging_id);

REVOKE ALL ON cleaning_review_decisions FROM PUBLIC;

CREATE OR REPLACE FUNCTION cleaning_review_skip(
  p_org integer,
  p_job integer,
  p_staging integer,
  p_subject text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE s staging_leads%ROWTYPE;
BEGIN
  IF p_org IS NULL OR p_job IS NULL OR p_staging IS NULL
     OR length(coalesce(p_subject, '')) NOT BETWEEN 1 AND 255 THEN
    RETURN jsonb_build_object('saved', false, 'code', 'INVALID_REVIEW');
  END IF;

  PERFORM 1 FROM organizations WHERE id = p_org AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('saved', false, 'code', 'ORG_NOT_READY');
  END IF;

  SELECT * INTO s
  FROM staging_leads
  WHERE id = p_staging AND org_id = p_org AND job_id = p_job
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('saved', false, 'code', 'REVIEW_NOT_FOUND');
  END IF;

  IF s.cleaning_status NOT IN ('review', 'failed') THEN
    IF EXISTS (SELECT 1 FROM cleaning_review_decisions WHERE org_id = p_org AND staging_id = p_staging) THEN
      RETURN jsonb_build_object('saved', true, 'replayed', true, 'action', 'skip');
    END IF;
    RETURN jsonb_build_object('saved', false, 'code', 'REVIEW_NOT_PENDING');
  END IF;

  IF EXISTS (SELECT 1 FROM cleaning_review_decisions WHERE org_id = p_org AND staging_id = p_staging) THEN
    RETURN jsonb_build_object('saved', true, 'replayed', true, 'action', 'skip');
  END IF;

  INSERT INTO cleaning_review_decisions(org_id, job_id, staging_id, action, actor_subject)
  VALUES (p_org, p_job, p_staging, 'skip', p_subject)
  ON CONFLICT (org_id, staging_id) DO NOTHING;

  RETURN jsonb_build_object('saved', true, 'replayed', false, 'action', 'skip');
END;
$$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='lead_dashboard') THEN
    EXECUTE 'GRANT SELECT ON cleaning_review_decisions TO lead_dashboard';
    EXECUTE 'GRANT EXECUTE ON FUNCTION cleaning_review_skip(integer, integer, integer, text) TO lead_dashboard';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='n8n_user') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION cleaning_review_skip(integer, integer, integer, text) TO n8n_user';
  END IF;
END $$;

COMMIT;
