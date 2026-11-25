\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE t enrichment_tasks%ROWTYPE; previous jsonb; outcome jsonb; payload jsonb; failure_kind text; token text;
BEGIN
 ASSERT current_database() LIKE 'scratch_%','Scratch database required';
 SELECT * INTO t FROM enrichment_tasks WHERE org_id=1 AND lead_id=449 AND enrichment_tasks.kind='basic'; ASSERT FOUND;
 SELECT to_jsonb(p) INTO previous FROM enrichment_profiles p WHERE org_id=t.org_id AND lead_id=t.lead_id;
 ASSERT previous IS NOT NULL,'Last good profile fixture required';
 FOREACH failure_kind IN ARRAY ARRAY['dns','blocked','not_found','non_html','unavailable'] LOOP
  token:=md5(random()::text||failure_kind);
  UPDATE enrichment_tasks SET status='processing',attempts=1,lease=token,lease_until=now()+interval '5 minutes',fingerprint=enrichment_fingerprint(org_id,lead_id,'basic') WHERE id=t.id;
  INSERT INTO enrichment_attempts(lease,task_id) VALUES(token,t.id);
  payload:=jsonb_build_object('id',t.id,'lease',token,'status','partial','result',jsonb_build_object('version','enrichment_v1','status','partial','failure_class',failure_kind,'pages',jsonb_build_array(jsonb_build_object('usable_html',false,'error_class',failure_kind)),'evidence','[]'::jsonb,'services','[]'::jsonb,'quality_flags','[]'::jsonb,'signals','{"social":{"facebook":[],"instagram":[]},"web_presence":{"checks":[]}}'::jsonb));
  outcome:=enrichment_finish(payload);
  ASSERT outcome->>'status'='failed' AND outcome->>'saved'='false','Source failure must not become a successful assessment';
  ASSERT (SELECT error='source_'||failure_kind AND status='pending' AND attempts=1 FROM enrichment_tasks WHERE id=t.id),'Classification or existing retry policy changed';
  ASSERT (SELECT to_jsonb(p)=previous FROM enrichment_profiles p WHERE org_id=t.org_id AND lead_id=t.lead_id),'Last good evidence/timestamps/research changed';
  ASSERT (SELECT finished_at IS NOT NULL AND result=payload FROM enrichment_attempts WHERE lease=token),'Attempt diagnostics lost';
 END LOOP;
 token:=md5(random()::text);
 UPDATE enrichment_tasks SET status='processing',attempts=3,lease=token,lease_until=now()+interval '5 minutes' WHERE id=t.id;
 INSERT INTO enrichment_attempts(lease,task_id) VALUES(token,t.id);
 payload:=jsonb_set(jsonb_set(payload,'{lease}',to_jsonb(token)),'{result,pages}','null'::jsonb);
 outcome:=enrichment_finish(payload);
 ASSERT (SELECT error='invalid_worker_result' AND status='failed' AND attempts=3 FROM enrichment_tasks WHERE id=t.id),'Malformed payload or retry ceiling mislabelled';
 ASSERT enrichment_finish(payload)->>'reason'='stale_lease','Completed attempt replay changed';
 RAISE NOTICE 'PASS: five source failure classes, last-good preservation, attempt retention, unchanged retries, malformed result and stale lease';
END $$;
ROLLBACK;
