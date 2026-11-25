-- LOCAL, UNAPPLIED. Trusted backend settlement; no calls or new tables/webhooks.
BEGIN;
CREATE OR REPLACE FUNCTION outreach_call_settle(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE a outreach_activities%ROWTYPE; m jsonb; total bigint; reserved bigint;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object'
 OR coalesce(p->>'org_id','') !~ '^[1-9][0-9]{0,8}$'
 OR coalesce(p->>'activity_id','') !~ '^[1-9][0-9]{0,8}$'
 OR jsonb_typeof(p->'total_micro_usd') IS DISTINCT FROM 'number'
 OR outreach_call_amount(p->>'total_micro_usd') IS NULL
 OR p->>'currency' IS DISTINCT FROM 'USD'
 OR p->>'all_provider_costs_final' IS DISTINCT FROM 'true'
 OR coalesce(p->>'evidence_ref','')='' OR length(p->>'evidence_ref')>256
 THEN RETURN '{"saved":false,"reason":"final_all_in_cost_required"}';END IF;
 PERFORM pg_advisory_xact_lock(727411,1);
 SELECT * INTO a FROM outreach_activities WHERE id=(p->>'activity_id')::integer
 AND org_id=(p->>'org_id')::integer AND channel='call' FOR UPDATE;
 m:=a.dispatch_metadata;
 IF NOT FOUND OR m->>'version' IS DISTINCT FROM 'calling_v1'
 OR coalesce(p->>'lease','')='' OR m->>'lease' IS DISTINCT FROM p->>'lease'
 OR coalesce(p->>'provider_call_id','')='' OR m->>'provider_call_id' IS DISTINCT FROM p->>'provider_call_id'
 OR coalesce(p->>'connection_ref','')='' OR m->>'connection_ref' IS DISTINCT FROM p->>'connection_ref'
 THEN RETURN '{"saved":false,"reason":"settlement_binding_invalid"}';END IF;
 total:=outreach_call_amount(p->>'total_micro_usd');reserved:=outreach_call_amount(m->>'reserved_micro_usd');
 IF m->>'state'='settled' THEN
  IF outreach_call_amount(m->>'actual_micro_usd')=total AND m->>'cost_evidence_ref'=p->>'evidence_ref'
  THEN RETURN '{"saved":true,"replayed":true}';END IF;
  UPDATE outreach_activities SET dispatch_metadata=dispatch_metadata||'{"cost_review_required":true}'::jsonb WHERE id=a.id;
  RETURN '{"saved":false,"reason":"settlement_conflict"}';
 END IF;
 IF m->>'state' IS DISTINCT FROM 'awaiting_final_cost' OR m->>'provider_ended' IS DISTINCT FROM 'true'
 OR m->>'attempts' IS DISTINCT FROM '1' OR reserved IS NULL OR m->>'provider_status_conflict'='true'
 THEN RETURN '{"saved":false,"reason":"call_not_ready_for_settlement"}';END IF;
 UPDATE outreach_activities SET status='settled',dispatch_metadata=dispatch_metadata||jsonb_build_object(
 'state','settled','actual_micro_usd',total,'cost_evidence_ref',p->>'evidence_ref','settled_at',now(),
 'reserved_micro_usd',0,'original_reserved_micro_usd',reserved,'cost_review_required',total>reserved,
 'automatic_redial_allowed',false,'execution_authorized',false) WHERE id=a.id AND org_id=a.org_id;
 RETURN jsonb_build_object('saved',true,'state','settled','cost_review_required',total>reserved,
 'execution_authorized',false,'automatic_redial_allowed',false);
END $$;
REVOKE ALL ON FUNCTION outreach_call_settle(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_call_settle(jsonb) TO n8n_user;
COMMIT;
