DO $test$
DECLARE b jsonb:='{"version":"strategy_v2","state":"template_completed","execution_authorized":false,"approval_required":true,"validation_profile":"customer_email_v1","generation":{"source":"customer_supplied","method":"template"},"customer_review":{"required":true,"claim_provenance":"customer_supplied_not_independently_verified","rendered_preview_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","campaign_id":4,"campaign_version":2,"lead_id":1,"recipient":"owner@example.test"},"blocking_reasons":[],"validation_errors":[],"strategy":{"step1":{"channel":"email"}},"artifacts":{"email_draft":{"subject":"Test","body":"Test only"}}}';
 patch jsonb;
BEGIN
 ASSERT outreach_email_transport_marker_allowed(b),'reviewed customer format must be recognized';
 FOREACH patch IN ARRAY ARRAY['{"state":"ai_completed"}'::jsonb,'{"state":"template_fallback"}','{"execution_authorized":"false"}','{"approval_required":false}','{"blocking_reasons":["customer_template_integration_offline_only"]}','{"validation_errors":["error"]}','{"customer_review":{"required":true}}','{"generation":{"source":"customer_supplied","method":"ai"}}','{"validation_profile":"other"}','{"strategy":{"step1":{"channel":"call"}}}'] LOOP
  ASSERT NOT outreach_email_transport_marker_allowed(b||patch),'malformed customer format must remain blocked';
 END LOOP;
 ASSERT NOT outreach_email_transport_marker_allowed(NULL);
 ASSERT NOT outreach_email_transport_marker_allowed('[]');
 ASSERT outreach_email_transport_marker_allowed('{"execution_authorized":true}'),'legacy compatibility unchanged';
 ASSERT outreach_email_transport_marker_allowed('{"version":"strategy_v2","state":"ai_completed","execution_authorized":false,"approval_required":true,"blocking_reasons":[],"validation_errors":[],"strategy":{"step1":{"channel":"email"}},"draft_review_release":{"version":"native_email_review_v1","scope":"content_approval_only","execution_authorized":false}}'),'native format unchanged';
END $test$;
