-- LOCAL / UNAPPLIED. Requires 047 and the existing 035 membership schema.
-- No new tables, columns, webhooks or schedules. Review never resumes sending.
BEGIN;
CREATE FUNCTION outreach_whatsapp_inbox_member(p_org integer,p_subject text,p_admin boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
BEGIN
 IF p_org IS NULL OR p_org<=0 OR coalesce(p_subject,'') !~ '^[a-f0-9]{64}$' THEN RETURN false;END IF;
 RETURN EXISTS(SELECT 1 FROM org_sender_memberships m JOIN organizations o ON o.id=m.org_id WHERE m.org_id=p_org AND m.subject=p_subject AND m.active AND o.status='active' AND (NOT p_admin OR m.role IN ('owner','admin')));
EXCEPTION WHEN undefined_table OR insufficient_privilege THEN RETURN false;
END $$;

CREATE FUNCTION outreach_whatsapp_inbox_read(p_org integer,p_subject text,p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
BEGIN
 IF NOT outreach_whatsapp_inbox_member(p_org,p_subject) THEN RETURN '{"state":"blocked","reason":"membership_required","items":[]}';END IF;
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RETURN '{"state":"blocked","reason":"invalid_inbox_request","items":[]}';END IF;
 IF p-ARRAY['limit','before_id']<>'{}'::jsonb THEN RETURN '{"state":"blocked","reason":"invalid_inbox_request","items":[]}';END IF;
 RETURN outreach_whatsapp_inbox(p||jsonb_build_object('org_id',p_org));
END $$;

CREATE FUNCTION outreach_whatsapp_inbox_manage(p_org integer,p_subject text,p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a outreach_activities%ROWTYPE;m jsonb;revision integer;action text;receipt jsonb;audit jsonb;
BEGIN
 IF NOT outreach_whatsapp_inbox_member(p_org,p_subject,true) THEN RETURN '{"saved":false,"reason":"admin_required"}';END IF;
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RETURN '{"saved":false,"reason":"invalid_inbox_action"}';END IF;
 IF p-ARRAY['activity_id','expected_revision','action','request_id']<>'{}'::jsonb
 OR coalesce(p->>'activity_id','') !~ '^[1-9][0-9]{0,8}$' OR coalesce(p->>'expected_revision','') !~ '^[1-9][0-9]{0,8}$'
 OR coalesce(p->>'request_id','') !~ '^[A-Za-z0-9_-]{8,80}$' OR coalesce(p->>'action','') NOT IN ('acknowledge','archive','redact') THEN RETURN '{"saved":false,"reason":"invalid_inbox_action"}';END IF;
 PERFORM pg_advisory_xact_lock(727413,1);
 -- Recheck membership under the same transaction as the write.
 PERFORM 1 FROM org_sender_memberships WHERE org_id=p_org AND subject=p_subject AND active AND role IN ('owner','admin') FOR SHARE;
 IF NOT FOUND THEN RETURN '{"saved":false,"reason":"admin_required"}';END IF;
 SELECT * INTO a FROM outreach_activities WHERE org_id=p_org AND id=(p->>'activity_id')::integer AND dispatch_metadata->>'version'='whatsapp_inbound_v1' FOR UPDATE;
 IF NOT FOUND THEN RETURN '{"saved":false,"reason":"incoming_message_not_found"}';END IF;
 m:=a.dispatch_metadata;action:=p->>'action';
 audit:=CASE WHEN jsonb_typeof(m->'inbox_audit')='array' THEN m->'inbox_audit' ELSE '[]'::jsonb END;
 SELECT value INTO receipt FROM jsonb_array_elements(audit) WHERE value->>'request_id'=p->>'request_id';
 IF receipt IS NOT NULL THEN RETURN jsonb_build_object('saved',receipt->>'action'=action AND receipt->>'actor'=p_subject,'idempotent',receipt->>'action'=action AND receipt->>'actor'=p_subject,'execution_authorized',false);END IF;
 revision:=coalesce((m->>'inbox_revision')::integer,1);
 IF revision::text IS DISTINCT FROM p->>'expected_revision' THEN RETURN jsonb_build_object('saved',false,'reason','inbox_revision_changed','revision',revision);END IF;
 IF action='redact' THEN m:=m||jsonb_build_object('text',NULL,'body_redacted_at',now(),'body_redaction_reason','admin_request');
 ELSE m:=m||jsonb_build_object('inbox_review',jsonb_build_object('status',CASE action WHEN 'archive' THEN 'archived' ELSE 'acknowledged' END,'actor',p_subject,'at',now()));END IF;
 -- Keep review_state/stop_reason/recipient/event_hash unchanged. An inbox action
 -- never creates consent, clears STOP or authorizes future automatic outreach.
 SELECT coalesce(jsonb_agg(value ORDER BY n),'[]'::jsonb) INTO audit FROM jsonb_array_elements(audit) WITH ORDINALITY q(value,n) WHERE n>jsonb_array_length(audit)-19;
 m:=m||jsonb_build_object('inbox_revision',revision+1,'inbox_audit',audit||jsonb_build_array(jsonb_build_object('request_id',p->>'request_id','action',action,'actor',p_subject,'at',now())));
 UPDATE outreach_activities SET dispatch_metadata=m WHERE id=a.id;
 RETURN jsonb_build_object('saved',true,'revision',revision+1,'execution_authorized',false,'sending_resumed',false);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN '{"saved":false,"reason":"malformed_inbox_action"}';
END $$;

CREATE FUNCTION outreach_whatsapp_inbox_retention(p_org integer,p_subject text,p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE days integer;batch integer;dry boolean;a outreach_activities%ROWTYPE;n integer:=0;revision integer;
BEGIN
 IF NOT outreach_whatsapp_inbox_member(p_org,p_subject,true) THEN RETURN '{"saved":false,"reason":"admin_required"}';END IF;
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RETURN '{"saved":false,"reason":"invalid_retention_request"}';END IF;
 IF p-ARRAY['retention_days','limit','dry_run']<>'{}'::jsonb
 OR coalesce(p->>'retention_days','') !~ '^[1-9][0-9]{0,3}$' OR (p ? 'limit' AND coalesce(p->>'limit','') !~ '^([1-9]|[1-9][0-9]|100)$')
 OR (p ? 'dry_run' AND jsonb_typeof(p->'dry_run') IS DISTINCT FROM 'boolean') THEN RETURN '{"saved":false,"reason":"invalid_retention_request"}';END IF;
 days:=(p->>'retention_days')::integer;batch:=coalesce((p->>'limit')::integer,50);dry:=coalesce((p->>'dry_run')::boolean,true);
 IF days NOT BETWEEN 7 AND 3650 THEN RETURN '{"saved":false,"reason":"invalid_retention_window"}';END IF;
 PERFORM pg_advisory_xact_lock(727413,1);
 PERFORM 1 FROM org_sender_memberships WHERE org_id=p_org AND subject=p_subject AND active AND role IN ('owner','admin') FOR SHARE;
 IF NOT FOUND THEN RETURN '{"saved":false,"reason":"admin_required"}';END IF;
 FOR a IN SELECT * FROM outreach_activities WHERE org_id=p_org AND dispatch_metadata->>'version'='whatsapp_inbound_v1' AND created_at<(now()-days*interval '1 day') AT TIME ZONE 'UTC' AND jsonb_typeof(dispatch_metadata->'text')='string' ORDER BY id LIMIT batch FOR UPDATE LOOP
  n:=n+1;
  IF NOT dry THEN
   revision:=coalesce((a.dispatch_metadata->>'inbox_revision')::integer,1);
   UPDATE outreach_activities SET dispatch_metadata=dispatch_metadata||jsonb_build_object('text',NULL,'body_redacted_at',now(),'body_redaction_reason','retention','body_redaction_actor',p_subject,'inbox_revision',revision+1) WHERE id=a.id;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('saved',true,'dry_run',dry,'matched',n,'body_redaction_only',true,'suppression_preserved',true,'execution_authorized',false);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN '{"saved":false,"reason":"malformed_retention_request"}';
END $$;
REVOKE ALL ON FUNCTION outreach_whatsapp_inbox_member(integer,text,boolean),outreach_whatsapp_inbox_read(integer,text,jsonb),outreach_whatsapp_inbox_manage(integer,text,jsonb),outreach_whatsapp_inbox_retention(integer,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_whatsapp_inbox_member(integer,text,boolean),outreach_whatsapp_inbox_read(integer,text,jsonb),outreach_whatsapp_inbox_manage(integer,text,jsonb),outreach_whatsapp_inbox_retention(integer,text,jsonb) TO n8n_user;
COMMIT;
