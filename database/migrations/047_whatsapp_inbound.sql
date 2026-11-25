-- LOCAL / UNAPPLIED: incoming-only exception. Requires 046; no new tables/webhooks.
BEGIN;
CREATE FUNCTION outreach_whatsapp_inbound_shape(m jsonb,o integer,l integer,c text,s text,x text,t timestamp) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT coalesce(jsonb_typeof(m)='object' AND o>0 AND l IS NULL AND c='whatsapp' AND s='received' AND x IS NULL AND t IS NULL
 AND m->>'version'='whatsapp_inbound_v1' AND m->>'direction'='incoming' AND m->>'execution_authorized'='false'
 AND NOT (m ? 'plan_id' OR m ? 'step' OR m ? 'lease' OR m ? 'reserved_micro_usd')
 AND coalesce(m->>'phone_number_id','') ~ '^[0-9]{5,30}$' AND coalesce(m->>'waba_id','') ~ '^[0-9]{5,30}$'
 AND coalesce(m->>'recipient','') ~ '^\+[1-9][0-9]{7,14}$' AND length(coalesce(m->>'provider_message_id','')) BETWEEN 1 AND 450
 AND length(coalesce(m->>'connection_id','')) BETWEEN 1 AND 120 AND coalesce(m->>'event_hash','') ~ '^[a-f0-9]{32}$'
 AND jsonb_typeof(m->'signature_verified')='boolean' AND m->>'signature_verified'='true',false);
$$;
DO $$ DECLARE old_expr text; BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO STRICT old_expr FROM pg_constraint WHERE conrelid='outreach_activities'::regclass AND conname='outreach_dispatch_metadata_shape';
 ALTER TABLE outreach_activities DROP CONSTRAINT outreach_dispatch_metadata_shape;
 EXECUTE format('ALTER TABLE outreach_activities ADD CONSTRAINT outreach_dispatch_metadata_shape CHECK (CASE WHEN dispatch_metadata->>''version''=''whatsapp_inbound_v1'' THEN outreach_whatsapp_inbound_shape(dispatch_metadata,org_id,lead_id,channel,status,external_id,sent_at) ELSE (%s) END)',old_expr);
END $$;
CREATE UNIQUE INDEX outreach_whatsapp_inbound_message_unique ON outreach_activities(org_id,(dispatch_metadata->>'phone_number_id'),(dispatch_metadata->>'waba_id'),(dispatch_metadata->>'provider_message_id')) WHERE dispatch_metadata->>'version'='whatsapp_inbound_v1';

CREATE FUNCTION outreach_whatsapp_inbound_store(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE o integer;conn text;orgs integer;conns integer;stamp timestamptz;e jsonb;digest text;a outreach_activities%ROWTYPE;stop boolean;
BEGIN
 IF p->'signature_verified' IS DISTINCT FROM 'true'::jsonb OR p->>'kind' IS DISTINCT FROM 'inbound'
 OR coalesce(p->>'phone_number_id','') !~ '^[0-9]{5,30}$' OR coalesce(p->>'waba_id','') !~ '^[0-9]{5,30}$'
 OR coalesce(p->>'recipient','') !~ '^\+[1-9][0-9]{7,14}$' OR length(coalesce(p->>'provider_message_id','')) NOT BETWEEN 1 AND 450
 OR (p->'text' IS NOT NULL AND p->'text'<>'null'::jsonb AND jsonb_typeof(p->'text')<>'string') OR length(coalesce(p->>'text',''))>4000
 OR (p ? 'unsupported_content' AND jsonb_typeof(p->'unsupported_content') IS DISTINCT FROM 'boolean')
 OR (p->'context_id' IS NOT NULL AND p->'context_id'<>'null'::jsonb AND jsonb_typeof(p->'context_id')<>'string') OR length(coalesce(p->>'context_id',''))>450
 THEN RETURN '{"saved":false,"reason":"invalid_incoming_event"}';END IF;
 stamp:=(p->>'occurred_at')::timestamptz;
 IF stamp IS NULL OR NOT isfinite(stamp) OR stamp>now()+interval '5 minutes' OR stamp<now()-interval '30 days' THEN RETURN '{"saved":false,"reason":"incoming_event_time_invalid"}';END IF;
 PERFORM pg_advisory_xact_lock(727413,1);
 -- Current trusted campaign configuration owns sender routing, not callback org_id.
 SELECT count(DISTINCT c.org_id),count(DISTINCT cv.config->'whatsapp_dispatch'->'connection'->>'connection_id'),min(c.org_id),min(cv.config->'whatsapp_dispatch'->'connection'->>'connection_id')
 INTO orgs,conns,o,conn FROM strategy_campaigns c JOIN strategy_campaign_versions cv ON cv.org_id=c.org_id AND cv.campaign_id=c.id AND cv.version=c.version
 WHERE cv.config->'whatsapp_dispatch'->'connection'->>'org_id'=c.org_id::text
 AND cv.config->'whatsapp_dispatch'->'connection'->>'phone_number_id'=p->>'phone_number_id'
 AND cv.config->'whatsapp_dispatch'->'connection'->>'waba_id'=p->>'waba_id'
 AND cv.config->'whatsapp_dispatch'->'connection'->>'state' IN ('ready','identity_checked','disabled')
 AND length(coalesce(cv.config->'whatsapp_dispatch'->'connection'->>'connection_id','')) BETWEEN 1 AND 120
 AND nullif(cv.config->'whatsapp_dispatch'->'connection'->>'verified_at','') IS NOT NULL;
 IF orgs<>1 OR conns<>1 THEN RETURN '{"saved":false,"reason":"sender_binding_unknown_or_ambiguous"}';END IF;
 e:=jsonb_build_object('provider_message_id',p->>'provider_message_id','phone_number_id',p->>'phone_number_id','waba_id',p->>'waba_id','recipient',p->>'recipient','occurred_at',stamp,'text',p->>'text','context_id',p->>'context_id','unsupported_content',coalesce(p->'unsupported_content','false'::jsonb));
 digest:=md5(e::text);stop:=p->>'opt_out'='true' OR lower(trim(coalesce(p->>'text',''))) ~ '^(stop|unsubscribe|cancel|please stop|do not contact me|don''t contact me|بند|بند کریں)[.![:space:]]*$';
 INSERT INTO outreach_activities(org_id,lead_id,channel,status,dispatch_metadata) VALUES(o,NULL,'whatsapp','received',e||jsonb_build_object('version','whatsapp_inbound_v1','direction','incoming','connection_id',conn,'event_hash',digest,'signature_verified',true,'execution_authorized',false,'stop_reason',CASE WHEN stop THEN 'opt_out' ELSE 'reply' END,'review_state','needs_review')) ON CONFLICT DO NOTHING RETURNING * INTO a;
 IF NOT FOUND THEN
  SELECT * INTO a FROM outreach_activities WHERE org_id=o AND dispatch_metadata->>'version'='whatsapp_inbound_v1' AND dispatch_metadata->>'phone_number_id'=p->>'phone_number_id' AND dispatch_metadata->>'waba_id'=p->>'waba_id' AND dispatch_metadata->>'provider_message_id'=p->>'provider_message_id';
  RETURN jsonb_build_object('saved',FOUND AND a.dispatch_metadata->>'event_hash'=digest,'idempotent',FOUND AND a.dispatch_metadata->>'event_hash'=digest,'reason','incoming_replay_or_conflict','execution_authorized',false);
 END IF;
 RETURN jsonb_build_object('saved',true,'activity_id',a.id,'org_id',o,'state','incoming_saved','execution_authorized',false);
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN RETURN '{"saved":false,"reason":"malformed_incoming_event"}';
END $$;

CREATE FUNCTION outreach_whatsapp_inbox(p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE o integer;cursor_id integer;page_size integer;items jsonb; BEGIN
 -- Trusted authenticated backend only; never use dashboard-supplied org identity.
 IF coalesce(p->>'org_id','') !~ '^[1-9][0-9]{0,8}$' OR (p ? 'before_id' AND coalesce(p->>'before_id','') !~ '^[1-9][0-9]{0,8}$') OR (p ? 'limit' AND coalesce(p->>'limit','') !~ '^([1-9]|[1-9][0-9]|100)$') THEN RETURN '{"state":"blocked","items":[],"execution_authorized":false}';END IF;
 o:=(p->>'org_id')::integer;cursor_id:=coalesce((p->>'before_id')::integer,2147483647);page_size:=coalesce((p->>'limit')::integer,50);
 SELECT coalesce(jsonb_agg(jsonb_build_object('activity_id',id,'org_id',org_id,'received_at',created_at,'message',dispatch_metadata) ORDER BY id DESC),'[]'::jsonb) INTO items
 FROM (SELECT id,org_id,created_at,dispatch_metadata FROM outreach_activities WHERE org_id=o AND dispatch_metadata->>'version'='whatsapp_inbound_v1' AND id<cursor_id ORDER BY id DESC LIMIT page_size) q;
 RETURN jsonb_build_object('state','read_only','items',items,'execution_authorized',false);
END $$;

-- Keep the public function OIDs stable for existing cached/dependent callers.
DO $$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('outreach_whatsapp_gate(jsonb)'::regprocedure);
 EXECUTE replace(definition,'FUNCTION public.outreach_whatsapp_gate(','FUNCTION public.outreach_whatsapp_gate_046(');
 definition:=pg_get_functiondef('outreach_whatsapp_ingest(jsonb)'::regprocedure);
 EXECUTE replace(definition,'FUNCTION public.outreach_whatsapp_ingest(','FUNCTION public.outreach_whatsapp_ingest_046(');
END $$;
CREATE OR REPLACE FUNCTION outreach_whatsapp_gate(p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE g jsonb; BEGIN
 g:=outreach_whatsapp_gate_046(p);IF g->>'allowed' IS DISTINCT FROM 'true' THEN RETURN g;END IF;
 IF EXISTS(SELECT 1 FROM outreach_activities WHERE org_id=(g->>'org_id')::integer AND dispatch_metadata->>'version'='whatsapp_inbound_v1' AND dispatch_metadata->>'recipient'=g->'artifact'->>'recipient' AND dispatch_metadata->>'stop_reason'='opt_out') THEN RETURN '{"allowed":false,"reason":"phone_opted_out"}';END IF;
 IF EXISTS(SELECT 1 FROM outreach_activities WHERE org_id=(g->>'org_id')::integer AND dispatch_metadata->>'version'='whatsapp_inbound_v1' AND dispatch_metadata->>'recipient'=g->'artifact'->>'recipient' AND dispatch_metadata->>'review_state'='needs_review') THEN RETURN '{"allowed":false,"reason":"incoming_contact_review_required"}';END IF;
 RETURN g;
END $$;
CREATE OR REPLACE FUNCTION outreach_whatsapp_ingest(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE e jsonb;r jsonb;n integer:=0; BEGIN
 IF p->'signature_verified' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(p->'events') IS DISTINCT FROM 'array' THEN RETURN '{"saved":false,"reason":"verified_batch_required"}';END IF;
 IF jsonb_array_length(p->'events')>50 THEN RETURN '{"saved":false,"reason":"event_batch_limit"}';END IF;
 PERFORM pg_advisory_xact_lock(727413,1);
 FOR e IN SELECT value FROM jsonb_array_elements(p->'events') LOOP
  IF e->>'kind'='inbound' THEN
   r:=outreach_whatsapp_inbound_store(e||'{"signature_verified":true}'::jsonb);
   IF r->>'saved' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'WHATSAPP_BATCH_REJECTED';END IF;
   -- Preserve existing correlated reply/STOP behavior; a general inbox record
   -- also survives when the old handler cannot attach to one specific plan.
   PERFORM outreach_whatsapp_ingest_046(jsonb_build_object('signature_verified',true,'events',jsonb_build_array(e)));
  ELSE
   r:=outreach_whatsapp_ingest_046(jsonb_build_object('signature_verified',true,'events',jsonb_build_array(e)));
   IF r->>'saved' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'WHATSAPP_BATCH_REJECTED';END IF;
  END IF;n:=n+1;
 END LOOP;
 RETURN jsonb_build_object('saved',true,'processed',n,'execution_authorized',false);
EXCEPTION WHEN raise_exception OR invalid_parameter_value OR invalid_text_representation THEN RETURN '{"saved":false,"reason":"incoming_batch_rejected_no_partial_write"}';
END $$;
REVOKE ALL ON FUNCTION outreach_whatsapp_inbound_shape(jsonb,integer,integer,text,text,text,timestamp),outreach_whatsapp_inbound_store(jsonb),outreach_whatsapp_gate(jsonb),outreach_whatsapp_ingest(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_whatsapp_inbound_shape(jsonb,integer,integer,text,text,text,timestamp),outreach_whatsapp_inbound_store(jsonb),outreach_whatsapp_gate(jsonb),outreach_whatsapp_ingest(jsonb) TO n8n_user;
REVOKE ALL ON FUNCTION outreach_whatsapp_gate_046(jsonb),outreach_whatsapp_ingest_046(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_whatsapp_gate_046(jsonb),outreach_whatsapp_ingest_046(jsonb) TO n8n_user;
REVOKE ALL ON FUNCTION outreach_whatsapp_inbox(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_whatsapp_inbox(jsonb) TO n8n_user;
COMMIT;
