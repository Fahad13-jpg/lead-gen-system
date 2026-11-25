-- Admit reviewed customer templates as a format, never as send authority.
-- Existing hash-bound acknowledgement, current rendering, recipient, campaign
-- authority, quota and one-attempt admission remain mandatory.
BEGIN;
CREATE OR REPLACE FUNCTION outreach_email_transport_marker_allowed(b jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN jsonb_typeof(b) IS DISTINCT FROM 'object' THEN false
 WHEN b->'execution_authorized'='true'::jsonb THEN true
 ELSE coalesce(
  b->>'version'='strategy_v2'
  AND b->>'state' IN ('ai_completed','template_completed')
  AND b->'execution_authorized'='false'::jsonb
  AND b->'approval_required'='true'::jsonb
  AND b#>>'{strategy,step1,channel}'='email'
  AND (CASE WHEN jsonb_typeof(b->'blocking_reasons')='array' THEN jsonb_array_length(b->'blocking_reasons')=0 ELSE false END)
  AND (CASE WHEN jsonb_typeof(b->'validation_errors')='array' THEN jsonb_array_length(b->'validation_errors')=0 ELSE false END)
  AND CASE WHEN b->>'validation_profile'='customer_email_v1' OR b#>>'{generation,source}'='customer_supplied' OR b#>'{customer_review,required}'='true'::jsonb THEN
   b->>'state'='template_completed'
   AND b->>'validation_profile'='customer_email_v1'
   AND b#>>'{generation,source}'='customer_supplied'
   AND b#>>'{generation,method}'='template'
   AND b#>'{customer_review,required}'='true'::jsonb
   AND b#>>'{customer_review,claim_provenance}'='customer_supplied_not_independently_verified'
   AND b#>>'{customer_review,rendered_preview_hash}' ~ '^[a-f0-9]{64}$'
   AND b#>>'{customer_review,campaign_id}' ~ '^[1-9][0-9]*$'
   AND b#>>'{customer_review,campaign_version}' ~ '^[1-9][0-9]*$'
   AND b#>>'{customer_review,lead_id}' ~ '^[1-9][0-9]*$'
   AND nullif(b#>>'{customer_review,recipient}','') IS NOT NULL
   AND nullif(b#>>'{artifacts,email_draft,subject}','') IS NOT NULL
   AND nullif(b#>>'{artifacts,email_draft,body}','') IS NOT NULL
  ELSE b#>>'{draft_review_release,version}'='native_email_review_v1'
   AND b#>>'{draft_review_release,scope}'='content_approval_only'
   AND b#>'{draft_review_release,execution_authorized}'='false'::jsonb
  END,false) END
$$;
REVOKE ALL ON FUNCTION outreach_email_transport_marker_allowed(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_email_transport_marker_allowed(jsonb) TO n8n_user;
COMMIT;
