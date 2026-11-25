-- Metadata extension approved by the user on 2026-10-14; no sender activation.
-- Production application is recorded separately in the deployment report.
-- Adds metadata to the existing event table; does not change approved strategy bodies/hashes.
BEGIN;
ALTER TABLE outreach_activities ADD COLUMN dispatch_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE outreach_activities ADD CONSTRAINT outreach_dispatch_metadata_shape CHECK (
 CASE WHEN jsonb_typeof(dispatch_metadata)='object' THEN
  CASE WHEN dispatch_metadata ? 'plan_id' OR dispatch_metadata ? 'step' THEN
   org_id IS NOT NULL
   AND COALESCE(jsonb_typeof(dispatch_metadata->'plan_id')='string',false)
   AND COALESCE(dispatch_metadata->>'plan_id' ~ '^[1-9][0-9]*$',false)
   AND COALESCE(jsonb_typeof(dispatch_metadata->'step')='string',false)
   AND COALESCE(dispatch_metadata->>'step' ~ '^[1-9][0-9]*$',false)
  ELSE dispatch_metadata='{}'::jsonb END
 ELSE false END
);
CREATE UNIQUE INDEX outreach_one_dispatch_per_plan_step
 ON outreach_activities(org_id,(dispatch_metadata->>'plan_id'),(dispatch_metadata->>'step'))
 WHERE dispatch_metadata ? 'plan_id';
COMMENT ON COLUMN outreach_activities.dispatch_metadata IS
 'Proposed org-scoped dispatch identity and future lease/outcome metadata. Never modify approved strategy JSON for dispatch state. Empty object preserves legacy rows.';
COMMIT;
