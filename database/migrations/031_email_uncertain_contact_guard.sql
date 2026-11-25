-- Candidate: block cross-plan repeats after uncertain attempts. No retry/reset.
BEGIN;
CREATE OR REPLACE FUNCTION outreach_email_contact_gate(p_org integer,p_lead integer,recipient text,sender text)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE a record; checked timestamptz;
BEGIN
 IF p_org IS NULL OR p_lead IS NULL OR nullif(trim(recipient),'') IS NULL OR nullif(trim(sender),'') IS NULL THEN
 RETURN '{"allowed":false,"reason":"contact_identity_missing"}'; END IF;
 FOR a IN SELECT oa.*,cl.email AS current_email FROM outreach_activities oa
 LEFT JOIN cleaned_leads cl ON cl.id=oa.lead_id AND cl.org_id=oa.org_id
 WHERE oa.org_id=p_org AND oa.channel='email' AND (
 oa.lead_id=p_lead OR lower(trim(coalesce(nullif(oa.dispatch_metadata->>'recipient_email',''),cl.email)))=lower(trim(recipient))) LOOP
  -- Audit events retain suppression even if a later event changes stop_reason.
  IF a.bounced_at IS NOT NULL OR a.dispatch_metadata->>'stop_reason' IN ('opt_out','bounce')
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(a.dispatch_metadata->'stop_events')='array'
     THEN a.dispatch_metadata->'stop_events' ELSE '[]'::jsonb END) e WHERE e->>'kind' IN ('opt_out','bounce')) THEN
   RETURN '{"allowed":false,"reason":"email_address_suppressed"}'; END IF;
  IF a.replied_at IS NOT NULL THEN RETURN '{"allowed":false,"reason":"reply_requires_review"}'; END IF;
  IF a.dispatch_metadata->>'state' IN ('attempting','ambiguous') THEN
   RETURN '{"allowed":false,"reason":"contact_attempt_requires_reconciliation"}'; END IF;
  IF a.dispatch_metadata->>'state'='provider_accepted' THEN
   -- A prior contact through a different mailbox must still be reviewed; do not
   -- skip its history when the campaign changes sender.
   IF a.dispatch_metadata->'reply_scan'->>'review_required'='true' THEN
    RETURN '{"allowed":false,"reason":"conversation_review_required"}'; END IF;
   IF a.dispatch_metadata->'delivery_scan'->>'review_required'='true' THEN RETURN '{"allowed":false,"reason":"conversation_review_required"}'; END IF;
   IF a.dispatch_metadata->'delivery_scan'->>'complete' IS DISTINCT FROM 'true'
   OR coalesce(a.dispatch_metadata->'delivery_scan'->>'checked_through','') !~ '^[1-9][0-9]{0,15}$' THEN
   RETURN '{"allowed":false,"reason":"reply_check_stale"}'; END IF;
   checked:=to_timestamp((a.dispatch_metadata->'delivery_scan'->>'checked_through')::double precision/1000);
   IF checked>statement_timestamp() OR checked<statement_timestamp()-interval '5 minutes' THEN RETURN '{"allowed":false,"reason":"reply_check_stale"}'; END IF;
   checked:=(a.dispatch_metadata->'reply_scan'->>'checked_at')::timestamptz;
   IF checked IS NULL OR NOT isfinite(checked) OR checked>statement_timestamp()
   OR checked<statement_timestamp()-interval '5 minutes' THEN
    RETURN '{"allowed":false,"reason":"reply_check_stale"}'; END IF;
  END IF;
 END LOOP;
 RETURN '{"allowed":true}';
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
 RETURN '{"allowed":false,"reason":"reply_check_stale"}';
END $$;
COMMIT;
