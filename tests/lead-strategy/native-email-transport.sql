-- Run inside an already-open scratch transaction after migration 055.
DO $test$
DECLARE b jsonb := '{"version":"strategy_v2","state":"ai_completed","execution_authorized":false,"approval_required":true,"blocking_reasons":[],"validation_errors":[],"strategy":{"step1":{"channel":"email"}},"draft_review_release":{"version":"native_email_review_v1","scope":"content_approval_only","execution_authorized":false}}';
 patch jsonb; name text; definition text;
BEGIN
 ASSERT outreach_email_transport_marker_allowed(b),'native reviewed format';
 ASSERT outreach_email_transport_marker_allowed(jsonb_set(b,'{state}','"template_completed"')),'explicit template format';
 ASSERT outreach_email_transport_marker_allowed('{"execution_authorized":true}'),'legacy format remains compatible';
 ASSERT NOT outreach_email_transport_marker_allowed(b-'draft_review_release'),'offline plan stays blocked';
 ASSERT NOT outreach_email_transport_marker_allowed(b||'{"execution_authorized":"false"}'),'strict boolean';
 ASSERT NOT outreach_email_transport_marker_allowed(b||'{"approval_required":"true"}'),'strict approval boolean';
 FOREACH patch IN ARRAY ARRAY['{"state":"template_fallback"}'::jsonb,'{"state":"ai_failed"}','{"blocking_reasons":["v2_offline_only"]}','{"validation_errors":["invalid"]}','{"blocking_reasons":null}','{"validation_errors":{}}','{"validation_profile":"customer_email_v1"}','{"generation":{"source":"customer_supplied"}}','{"strategy":{"step1":{"channel":"whatsapp"}}}','{"draft_review_release":{"version":"unknown"}}'] LOOP
  ASSERT NOT outreach_email_transport_marker_allowed(b||patch),'blocked or incompatible format';
 END LOOP;
 ASSERT NOT outreach_email_transport_marker_allowed(NULL);
 ASSERT NOT outreach_email_transport_marker_allowed('null');
 ASSERT NOT outreach_email_transport_marker_allowed('[]');
 ASSERT NOT outreach_email_transport_marker_allowed('"text"');
 FOREACH name IN ARRAY ARRAY['outreach_email_begin','outreach_email_step_begin','outreach_smtp_begin'] LOOP
  SELECT pg_get_functiondef(to_regprocedure(name||'(jsonb)')) INTO definition;
  ASSERT strpos(definition,'IF NOT outreach_email_transport_marker_allowed(v.body) THEN')>0,'new guard installed';
  ASSERT strpos(definition,'plan_transport_not_authorized')>0,'closed outcome retained';
  ASSERT strpos(definition,'quota_not_configured')>0,'quota guard retained';
  ASSERT strpos(definition,'dispatch_requires_reconciliation')>0,'attempt guard retained';
 END LOOP;
END $test$;
