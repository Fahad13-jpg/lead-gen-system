-- Bounded refresh of stale free website-discovery negatives. No new tables or provider calls.
BEGIN;
CREATE OR REPLACE FUNCTION contact_sync() RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
 UPDATE cleaned_leads c SET email_valid=false,email_verification_status='expired'
 FROM lead_contacts e WHERE e.lead_id=c.id AND e.org_id=c.org_id AND e.email=lower(trim(c.email)) AND e.expires_at<=now() AND c.email_valid=true;
 UPDATE contact_tasks t SET status='pending',attempts=0,next_attempt=now(),lease=NULL,lease_until=NULL
 FROM lead_contacts e WHERE e.id=t.contact_id AND e.expires_at<=now() AND t.status IN ('verified','invalid','risky','unknown','cached');
 UPDATE lead_contacts SET status='pending' WHERE expires_at<=now() AND status IN ('verified','invalid','risky','unknown');
 UPDATE contact_tasks t SET status='pending',attempts=0,next_attempt=now(),input_fingerprint=contact_input_fingerprint(t.org_id,t.lead_id,t.staging_id)
 WHERE t.kind='discovery' AND t.status<>'processing' AND t.input_fingerprint IS DISTINCT FROM contact_input_fingerprint(t.org_id,t.lead_id,t.staging_id)
 AND contact_eligible(t.org_id,t.lead_id,t.staging_id) AND EXISTS(SELECT 1 FROM cleaned_leads c WHERE c.id=t.lead_id AND coalesce(NULLIF(trim(c.website),''),'record-only')=t.source_value);
 -- Revisit only old negative WEBSITE searches, never blocked/failed tasks.
 -- Cache expiry alone is not enough: one free refresh per lead per seven days.
 -- Existing claim concurrency, attempt history, suppression and leases still apply.
 WITH due AS (
  SELECT t.id FROM contact_tasks t JOIN cleaned_leads c ON c.id=t.lead_id AND c.org_id=t.org_id
  WHERE t.kind='discovery' AND t.status='not_found'
   AND t.completed_at<=now()-interval '7 days'
   AND nullif(trim(c.email),'') IS NULL AND nullif(trim(c.website),'') IS NOT NULL
   AND c.website=t.source_value AND contact_eligible(t.org_id,t.lead_id,t.staging_id)
   AND NOT EXISTS(SELECT 1 FROM contact_discovery_cache cache WHERE cache.org_id=t.org_id
    AND rtrim(cache.website,'/')=rtrim(t.source_value,'/') AND cache.expires_at>now())
   AND NOT EXISTS(SELECT 1 FROM contact_attempts a WHERE a.task_id=t.id AND a.reserved_at>now()-interval '7 days')
   AND NOT EXISTS(SELECT 1 FROM lead_contacts e WHERE e.org_id=t.org_id AND e.lead_id=t.lead_id
    AND e.relevance_status='eligible' AND e.status IN ('pending','verified','unknown'))
  ORDER BY t.completed_at,t.id LIMIT 20 FOR UPDATE OF t SKIP LOCKED
 ) UPDATE contact_tasks t SET status='pending',attempts=0,next_attempt=now(),lease=NULL,lease_until=NULL,
   last_error=NULL,completed_at=NULL FROM due WHERE t.id=due.id;
 -- Never migrate or spend on ownership-review records or orphaned historical rows.
 INSERT INTO lead_contacts(org_id,lead_id,email,score,method)
 SELECT DISTINCT c.org_id,c.id,lower(trim(c.email)),90,'existing_record' FROM cleaned_leads c
 JOIN cleaning_links l ON l.cleaned_id=c.id AND l.org_id=c.org_id
 WHERE NULLIF(trim(c.email),'') IS NOT NULL AND contact_eligible(l.org_id,l.cleaned_id,l.staging_id)
 ON CONFLICT(org_id,lead_id,email) DO NOTHING;
 INSERT INTO contact_tasks(org_id,lead_id,staging_id,kind,source_value)
 SELECT DISTINCT ON(c.id) c.org_id,c.id,s.id,'discovery',coalesce(NULLIF(trim(c.website),''),'record-only') FROM cleaned_leads c
 JOIN cleaning_links l ON l.cleaned_id=c.id AND l.org_id=c.org_id JOIN staging_leads s ON s.id=l.staging_id
 WHERE contact_eligible(l.org_id,l.cleaned_id,l.staging_id)
 ORDER BY c.id,s.id ON CONFLICT(org_id,lead_id,kind,source_value) DO NOTHING;
 -- Every contact candidate has one shared verification path, including future inferred candidates.
 INSERT INTO contact_tasks(org_id,lead_id,staging_id,contact_id,kind,source_value)
 SELECT DISTINCT ON(c.id) c.org_id,c.lead_id,l.staging_id,c.id,'verification',c.email FROM lead_contacts c
 JOIN cleaning_links l ON l.cleaned_id=c.lead_id AND l.org_id=c.org_id
 WHERE contact_eligible(l.org_id,l.cleaned_id,l.staging_id) AND c.status='pending'
 ORDER BY c.id,l.staging_id ON CONFLICT(org_id,lead_id,kind,source_value) DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;RETURN n;
END $$;
COMMIT;
