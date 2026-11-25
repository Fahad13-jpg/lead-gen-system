-- LOCAL DRAFT, UNAPPLIED. Read-only preparation; never grants call authority.
-- No new tables/webhooks, no changes to email functions or approved plan bodies.
BEGIN;
CREATE OR REPLACE FUNCTION outreach_call_preview(p_org integer,p_plan bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE v strategy_plans%ROWTYPE; a strategy_approvals%ROWTYPE; x jsonb;
 reasons jsonb:='[]'::jsonb; cfg jsonb;
BEGIN
 SELECT * INTO v FROM strategy_plans WHERE org_id=p_org AND id=p_plan;
 IF NOT FOUND THEN RETURN '{"execution_authorized":false,"plan_eligible":false,"reasons":["not_found"]}';END IF;
 IF v.content_hash IS DISTINCT FROM md5(v.body::text) THEN reasons:=reasons||'"content_changed"'::jsonb;END IF;
 IF v.body->>'version' IS DISTINCT FROM 'strategy_v2'
 OR coalesce(v.body->>'state','') NOT IN ('ai_completed','template_completed','template_fallback')
 OR (CASE WHEN jsonb_typeof(v.body->'blocking_reasons')='array' THEN jsonb_array_length(v.body->'blocking_reasons')<>0 ELSE true END)
 OR (CASE WHEN jsonb_typeof(v.body->'validation_errors')='array' THEN jsonb_array_length(v.body->'validation_errors')<>0 ELSE true END)
 THEN reasons:=reasons||'"plan_blocked"'::jsonb;END IF;
 SELECT * INTO a FROM strategy_approvals WHERE org_id=p_org AND plan_id=p_plan ORDER BY id DESC LIMIT 1;
 IF NOT FOUND OR a.action<>'approve' OR a.content_hash IS DISTINCT FROM v.content_hash
 THEN reasons:=reasons||'"approval_required"'::jsonb;END IF;
 -- Initial call integration only supports an approved step-1 call, not follow-up intents.
 IF v.body->'strategy'->'step1'->>'channel' IS DISTINCT FROM 'call'
 OR jsonb_typeof(v.body->'artifacts'->'call_brief') IS DISTINCT FROM 'object'
 THEN reasons:=reasons||'"approved_step1_call_required"'::jsonb;END IF;
 x:=strategy_context(p_org,v.campaign_id,v.lead_id);
 IF x IS NULL OR x->>'fingerprint' IS DISTINCT FROM v.fingerprint OR v.expires_at<=now()
 THEN reasons:=reasons||'"stale_plan"'::jsonb;END IF;
 IF x->>'suppressed' IS DISTINCT FROM 'false' OR x->>'replied' IS DISTINCT FROM 'false'
 THEN reasons:=reasons||'"suppressed_or_replied"'::jsonb;END IF;
 cfg:=x->'campaign'->'config'->'call_dispatch';
 IF cfg->>'enabled' IS DISTINCT FROM 'true' THEN reasons:=reasons||'"campaign_calls_disabled"'::jsonb;END IF;
 IF coalesce(x->'lead'->>'phone','') !~ '^\+[1-9][0-9]{7,14}$'
 THEN reasons:=reasons||'"normalized_phone_required"'::jsonb;END IF;
 IF EXISTS(SELECT 1 FROM outreach_activities WHERE org_id=p_org AND channel='call'
 AND dispatch_metadata->>'plan_id'=p_plan::text)
 THEN reasons:=reasons||'"call_already_recorded"'::jsonb;END IF;
 RETURN jsonb_build_object('org_id',p_org,'plan_id',p_plan,'lead_id',v.lead_id,
 'content_hash',v.content_hash,'plan_eligible',jsonb_array_length(reasons)=0,'reasons',reasons,
 'execution_authorized',false,'transport_state','not_integrated',
 'remaining_checks',jsonb_build_array('phone_suppression','calling_permission','route_binding',
 'current_window','atomic_global_lease','atomic_budget_reservation','provider_release'));
END $$;

CREATE OR REPLACE FUNCTION outreach_call_queue_preview(p_org integer,p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('org_id',p_org,'execution_authorized',false,'preview_only',true,
 'items',coalesce(jsonb_agg(outreach_call_preview(q.org_id,q.id) ORDER BY q.created_at,q.id),'[]'::jsonb))
 FROM (SELECT org_id,id,created_at FROM strategy_plans
 WHERE org_id=p_org AND body->'strategy'->'step1'->>'channel'='call'
 ORDER BY created_at,id LIMIT greatest(0,least(coalesce(p_limit,50),100))) q;
$$;

CREATE OR REPLACE FUNCTION outreach_call_reconciliation_preview(p_org integer)
RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('org_id',p_org,'execution_authorized',false,'preview_only',true,
 'items',coalesce(jsonb_agg(jsonb_build_object('activity_id',q.id,
 'state',q.dispatch_metadata->>'state','provider_call_id',q.dispatch_metadata->>'provider_call_id',
 'automatic_redial_allowed',false) ORDER BY q.id),'[]'::jsonb))
 FROM (SELECT id,dispatch_metadata FROM outreach_activities WHERE org_id=p_org AND channel='call'
 AND coalesce(dispatch_metadata->>'state','unknown') NOT IN ('settled','cancelled_before_send')
 ORDER BY id LIMIT 100) q;
$$;
REVOKE ALL ON FUNCTION outreach_call_preview(integer,bigint),outreach_call_queue_preview(integer,integer),
 outreach_call_reconciliation_preview(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_call_preview(integer,bigint),outreach_call_queue_preview(integer,integer),
 outreach_call_reconciliation_preview(integer) TO n8n_user;
COMMIT;
