-- LOCAL / UNAPPLIED. Trusted-worker observations only, never authorizes a call.
-- Requires 038; no new tables/webhooks, no automatic budget settlement.
BEGIN;
CREATE OR REPLACE FUNCTION outreach_call_observe(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE a outreach_activities%ROWTYPE; m jsonb; s text; terminal boolean; h text; analysis jsonb;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object'
 OR coalesce(p->>'org_id','') !~ '^[1-9][0-9]{0,8}$'
 OR coalesce(p->>'activity_id','') !~ '^[1-9][0-9]{0,8}$'
 OR coalesce(p->>'provider_call_id','') !~ '^[A-Za-z0-9_-]{1,128}$'
 OR coalesce(p->>'status','') NOT IN ('registered','ongoing','ended','error','not_connected')
 THEN RETURN '{"saved":false,"reason":"invalid_observation","execution_authorized":false}';END IF;
 IF p ? 'duration_ms' AND jsonb_typeof(p->'duration_ms') IS DISTINCT FROM 'null'
 AND (outreach_call_amount(p->>'duration_ms') IS NULL OR outreach_call_amount(p->>'duration_ms')>86400000)
 THEN RETURN '{"saved":false,"reason":"invalid_duration","execution_authorized":false}';END IF;
 PERFORM pg_advisory_xact_lock(727411,1);
 SELECT * INTO a FROM outreach_activities WHERE org_id=(p->>'org_id')::integer
 AND id=(p->>'activity_id')::integer AND channel='call' FOR UPDATE;
 m:=a.dispatch_metadata;
 IF NOT FOUND OR m->>'version' IS DISTINCT FROM 'calling_v1'
 OR m->>'lease' IS DISTINCT FROM p->>'lease' OR coalesce(p->>'lease','')=''
 OR m->>'connection_ref' IS DISTINCT FROM p->>'connection_ref'
 OR coalesce(p->>'connection_ref','')=''
 OR m->>'content_hash' IS DISTINCT FROM p->>'content_hash'
 THEN RETURN '{"saved":false,"reason":"observation_binding_invalid","execution_authorized":false}';END IF;
 -- A mere reservation cannot be turned into a completed/provider-accepted call.
 IF coalesce(m->>'state','') NOT IN ('dispatching','provider_accepted','reconciliation_required','awaiting_final_cost')
 OR m->>'attempts' IS DISTINCT FROM '1'
 THEN RETURN '{"saved":false,"reason":"call_not_started_or_already_settled","execution_authorized":false}';END IF;
 IF m ? 'provider_call_id' AND m->>'provider_call_id' IS DISTINCT FROM p->>'provider_call_id'
 THEN RETURN '{"saved":false,"reason":"provider_call_id_conflict","execution_authorized":false}';END IF;
 s:=p->>'status';
 -- No transcripts/secrets or authoritative AI claims. Optional provider summary
 -- is separately bounded and explicitly marked as untrusted review data.
 IF jsonb_typeof(p->'analysis'->'summary')='string' THEN
  analysis:=jsonb_build_object('summary',left(regexp_replace(p->'analysis'->>'summary','[[:cntrl:]]',' ','g'),1000),
  'sentiment',CASE WHEN p->'analysis'->>'sentiment' IN ('Positive','Negative','Neutral') THEN p->'analysis'->>'sentiment' ELSE 'Unknown' END,
  'source','retell_call_analysis','review_required',true,'untrusted_data',true);
 END IF;
 h:=md5(jsonb_build_object('provider_call_id',p->>'provider_call_id','status',s,'duration_ms',p->'duration_ms','analysis',analysis)::text);
 IF m->>'last_observation_hash'=h THEN RETURN '{"saved":true,"replayed":true,"execution_authorized":false}';END IF;
 terminal:=coalesce(m->>'provider_ended','false')='true' OR s IN ('ended','error','not_connected');
 IF m->>'provider_ended'='true' AND s IN ('registered','ongoing') THEN
  RETURN '{"saved":true,"ignored_stale":true,"execution_authorized":false}';END IF;
 IF m->>'provider_status'='ongoing' AND s='registered' THEN
  RETURN '{"saved":true,"ignored_stale":true,"execution_authorized":false}';END IF;
 IF m->>'provider_ended'='true' AND m->>'provider_status' IS DISTINCT FROM s THEN
  UPDATE outreach_activities SET dispatch_metadata=dispatch_metadata||'{"provider_status_conflict":true}'::jsonb WHERE id=a.id;
  RETURN '{"saved":false,"reason":"terminal_status_conflict","execution_authorized":false}';END IF;
 m:=m||jsonb_build_object('provider_call_id',p->>'provider_call_id','provider_status',s,
 'provider_ended',terminal,'last_observation_hash',h,'last_observed_at',now(),
 'state',CASE WHEN terminal THEN 'awaiting_final_cost' ELSE 'provider_accepted' END,
 'automatic_redial_allowed',false,'execution_authorized',false);
 IF jsonb_typeof(p->'duration_ms') IS DISTINCT FROM 'null' AND p ? 'duration_ms' THEN
  m:=m||jsonb_build_object('duration_ms',greatest(coalesce(outreach_call_amount(m->>'duration_ms'),0),outreach_call_amount(p->>'duration_ms')));
 END IF;
 IF analysis IS NOT NULL THEN m:=m||jsonb_build_object('analysis',analysis);END IF;
 IF terminal THEN m:=m||jsonb_build_object('ended_at',CASE WHEN jsonb_typeof(m->'ended_at')='string' THEN m->'ended_at' ELSE to_jsonb(now()) END);END IF;
 UPDATE outreach_activities SET status=CASE WHEN terminal THEN 'awaiting_final_cost' ELSE 'provider_accepted' END,
 external_id=p->>'provider_call_id',dispatch_metadata=m WHERE id=a.id AND org_id=a.org_id;
 RETURN jsonb_build_object('saved',true,'state',m->>'state','execution_authorized',false,
 'cost_settlement_required',true,'automatic_redial_allowed',false);
END $$;
REVOKE ALL ON FUNCTION outreach_call_observe(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_call_observe(jsonb) TO n8n_user;
COMMIT;
