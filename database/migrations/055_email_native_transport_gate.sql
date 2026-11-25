-- Applied to local lead_db on 2026-11-09 after explicit approval and scratch checks.
-- No activation, policy change or plan mutation.
-- Recognize the reviewed native format; this predicate grants no sending authority.
-- Existing approved-hash/context checks, sender policy, bounded workflow release,
-- recipient checks, quota and one-attempt lease commitment remain mandatory.
BEGIN;
CREATE OR REPLACE FUNCTION outreach_email_transport_marker_allowed(b jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN jsonb_typeof(b) IS DISTINCT FROM 'object' THEN false
 WHEN b->'execution_authorized'='true'::jsonb THEN true -- legacy compatibility
 ELSE coalesce(
  b->>'version'='strategy_v2'
  AND b->>'state' IN ('ai_completed','template_completed')
  AND b->'execution_authorized'='false'::jsonb
  AND b->'approval_required'='true'::jsonb
  AND b#>>'{draft_review_release,version}'='native_email_review_v1'
  AND b#>>'{draft_review_release,scope}'='content_approval_only'
  AND b#>'{draft_review_release,execution_authorized}'='false'::jsonb
  AND b#>>'{strategy,step1,channel}'='email'
  AND coalesce(b->>'validation_profile','')<>'customer_email_v1'
  AND coalesce(b#>>'{generation,source}','')<>'customer_supplied'
  AND (CASE WHEN jsonb_typeof(b->'blocking_reasons')='array' THEN jsonb_array_length(b->'blocking_reasons')=0 ELSE false END)
  AND (CASE WHEN jsonb_typeof(b->'validation_errors')='array' THEN jsonb_array_length(b->'validation_errors')=0 ELSE false END)
 ,false) END
$$;
REVOKE ALL ON FUNCTION outreach_email_transport_marker_allowed(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_email_transport_marker_allowed(jsonb) TO n8n_user;

DO $migration$
DECLARE name text; definition text; old_guard text := 'IF v.body->>''execution_authorized'' IS DISTINCT FROM ''true'' THEN';
BEGIN
 FOREACH name IN ARRAY ARRAY['outreach_email_begin','outreach_email_step_begin','outreach_smtp_begin'] LOOP
  SELECT pg_get_functiondef(to_regprocedure(name||'(jsonb)')) INTO definition;
  IF definition IS NULL THEN RAISE EXCEPTION 'Required email function missing: %',name;END IF;
  IF strpos(definition,old_guard)=0
     OR (length(definition)-length(replace(definition,old_guard,'')))/length(old_guard)<>1
  THEN RAISE EXCEPTION 'Email guard changed; review before applying: %',name;END IF;
  EXECUTE replace(definition,old_guard,'IF NOT outreach_email_transport_marker_allowed(v.body) THEN');
 END LOOP;
END $migration$;
COMMIT;
