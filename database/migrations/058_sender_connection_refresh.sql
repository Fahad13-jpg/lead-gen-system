-- Routine identity/capability checks preserve the bound version on success.
-- Manual rechecks, credential changes and failed checks retain their fencing.
BEGIN;
CREATE OR REPLACE FUNCTION sender_connection_refreshed(p_org integer,p_id text,p_version integer,p jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE s sender_connections%ROWTYPE; ok boolean;
BEGIN
 PERFORM 1 FROM organizations WHERE id=p_org AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RETURN '{"error":"ORG_UNAVAILABLE"}';END IF;
 SELECT * INTO s FROM sender_connections WHERE org_id=p_org AND connection_id=p_id FOR UPDATE;
 IF NOT FOUND THEN RETURN '{"error":"NOT_FOUND"}';END IF;
 IF s.version<>p_version OR s.state<>'ready' OR NOT s.send_capable OR NOT s.reply_capable
 THEN RETURN '{"error":"CHECK_STALE"}';END IF;
 IF NOT EXISTS(SELECT 1 FROM org_sender_memberships WHERE org_id=p_org AND subject=s.owner_subject AND active)
 THEN RETURN '{"error":"MEMBERSHIP_REQUIRED"}';END IF;
 IF s.checked_at IS NOT NULL AND s.checked_at<=clock_timestamp() AND s.checked_at>clock_timestamp()-interval '12 hours'
 THEN RETURN jsonb_build_object('state',s.state,'version',s.version,'refreshed',false,'execution_authorized',false);END IF;
 ok:=coalesce(p->>'email'=s.email AND p->>'credential_ref'=s.credential_ref
  AND (s.provider='gmail' OR p->>'inbox_credential_ref'=s.inbox_credential_ref)
  AND p->'send'='true'::jsonb AND p->'read_replies'='true'::jsonb,false);
 UPDATE sender_connections SET checked_at=clock_timestamp(),
  version=version+CASE WHEN ok THEN 0 ELSE 1 END,
  state=CASE WHEN ok THEN 'ready' ELSE 'reconnect_required' END,
  send_capable=ok,reply_capable=ok
 WHERE org_id=p_org AND connection_id=p_id RETURNING * INTO s;
 RETURN jsonb_build_object('state',s.state,'version',s.version,'refreshed',ok,'execution_authorized',false);
END $$;
REVOKE ALL ON FUNCTION sender_connection_refreshed(integer,text,integer,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sender_connection_refreshed(integer,text,integer,jsonb) TO n8n_user;
COMMIT;
