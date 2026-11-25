-- LOCAL / UNAPPLIED. Approved sequence steps only, same leases and funding gates.
BEGIN;
CREATE OR REPLACE FUNCTION outreach_call_step_check(o integer,pid bigint,n integer) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE v strategy_plans%ROWTYPE;ck jsonb;reasons jsonb;cfg jsonb;d jsonb;seq jsonb;prev outreach_activities%ROWTYPE;due timestamptz;base_time timestamptz;email_gate jsonb;brief jsonb;
BEGIN
 IF n IS NULL OR n<1 OR n>10 THEN RETURN '{"plan_eligible":false,"reason":"invalid_step"}';END IF;
 IF n=1 THEN RETURN outreach_call_preview(o,pid);END IF;
 ck:=outreach_call_preview(o,pid);
 IF ck->>'plan_id' IS NULL THEN RETURN ck;END IF;
 SELECT coalesce(jsonb_agg(r),'[]'::jsonb) INTO reasons FROM jsonb_array_elements(ck->'reasons') r
 WHERE r#>>'{}' NOT IN ('approved_step1_call_required','call_already_recorded');
 IF jsonb_array_length(reasons)>0 THEN RETURN jsonb_build_object('plan_eligible',false,'reason','plan_not_eligible','reasons',reasons);END IF;
 SELECT * INTO v FROM strategy_plans WHERE org_id=o AND id=pid;
 IF v.body->'qualification'->>'fit'='weak' THEN RETURN '{"plan_eligible":false,"reason":"weak_fit_human_review"}';END IF;
 SELECT cv.config INTO cfg FROM strategy_campaign_versions cv WHERE cv.org_id=o AND cv.campaign_id=v.campaign_id AND cv.version=v.campaign_version;
 SELECT x INTO d FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v.body->'artifacts'->'followup_drafts')='array' THEN v.body->'artifacts'->'followup_drafts' ELSE '[]'::jsonb END) x WHERE x->>'step'=n::text;
 seq:=cfg->'sequence'->(n-1);brief:=d->'call_brief';
 IF d IS NULL OR d->>'channel' IS DISTINCT FROM 'call' OR seq->>'channel' IS DISTINCT FROM 'call'
 OR d->>'status' IS DISTINCT FROM 'requires_plan_approval_and_execution_checks'
 OR coalesce(d->>'delay_days','') !~ '^([0-9]|[1-5][0-9]|60)$' OR d->>'delay_days' IS DISTINCT FROM seq->>'delay_days'
 OR v.body->'artifacts'->'schedule'->'sequence' IS DISTINCT FROM cfg->'sequence'
 OR jsonb_typeof(brief) IS DISTINCT FROM 'object' OR nullif(brief->>'opening','') IS NULL OR nullif(brief->>'permission_question','') IS NULL
 THEN RETURN '{"plan_eligible":false,"reason":"approved_followup_call_brief_required"}';END IF;
 IF EXISTS(SELECT 1 FROM outreach_activities WHERE org_id=o AND dispatch_metadata->>'plan_id'=pid::text AND dispatch_metadata->>'step'=n::text)
 THEN RETURN '{"plan_eligible":false,"reason":"step_already_recorded"}';END IF;
 SELECT * INTO prev FROM outreach_activities WHERE org_id=o AND lead_id=v.lead_id AND dispatch_metadata->>'plan_id'=pid::text
 AND dispatch_metadata->>'step'=(n-1)::text AND dispatch_metadata->>'content_hash'=v.content_hash;
 IF NOT FOUND OR prev.replied_at IS NOT NULL OR prev.bounced_at IS NOT NULL OR prev.dispatch_metadata->>'stop_reason' IN ('opt_out','wrong_person','meeting_booked')
 OR prev.dispatch_metadata->>'followup_pause_reason' IS NOT NULL OR prev.dispatch_metadata->'booking'->>'state' IN ('claimed','booked','reconciliation_required')
 THEN RETURN '{"plan_eligible":false,"reason":"previous_step_unavailable_or_stopped"}';END IF;
 IF prev.channel='call' THEN
  IF prev.dispatch_metadata->>'state' IS DISTINCT FROM 'settled' OR prev.dispatch_metadata->>'provider_ended' IS DISTINCT FROM 'true'
  OR prev.dispatch_metadata->>'cost_review_required'='true'
  THEN RETURN '{"plan_eligible":false,"reason":"previous_call_unresolved"}';END IF;
  IF coalesce(prev.dispatch_metadata->>'outcome','unknown') NOT IN ('busy','line_busy','no_answer','callback_requested')
  OR NOT (CASE WHEN jsonb_typeof(cfg->'call_dispatch'->'followup_outcomes')='array' THEN cfg->'call_dispatch'->'followup_outcomes' ELSE '[]'::jsonb END ? coalesce(prev.dispatch_metadata->>'outcome','unknown'))
  THEN RETURN '{"plan_eligible":false,"reason":"outcome_requires_human_review"}';END IF;
  base_time:=(prev.dispatch_metadata->>'ended_at')::timestamptz;
 ELSE
  IF prev.channel<>'email' OR cfg->'call_dispatch'->>'followup_after_email' IS DISTINCT FROM 'true' OR prev.dispatch_metadata->>'state' IS DISTINCT FROM 'provider_accepted' OR nullif(prev.external_id,'') IS NULL
  THEN RETURN '{"plan_eligible":false,"reason":"previous_confirmed_step_required"}';END IF;
  email_gate:=outreach_email_contact_gate(o,v.lead_id,prev.dispatch_metadata->>'recipient_email',prev.dispatch_metadata->>'sender_email');
  IF email_gate->>'allowed' IS DISTINCT FROM 'true' THEN RETURN '{"plan_eligible":false,"reason":"email_conversation_not_ready"}';END IF;
  base_time:=prev.sent_at AT TIME ZONE 'UTC';
 END IF;
 IF base_time IS NULL OR NOT isfinite(base_time) OR base_time>now() THEN RETURN '{"plan_eligible":false,"reason":"previous_completion_time_unknown"}';END IF;
 due:=base_time+(d->>'delay_days')::integer*interval '24 hours';
 IF prev.dispatch_metadata->'callback'->>'state'='requested_pending_approved_step' THEN
  IF prev.dispatch_metadata->'callback'->>'confirmed_by_recipient' IS DISTINCT FROM 'true'
  THEN RETURN '{"plan_eligible":false,"reason":"callback_confirmation_required"}';END IF;
  IF (prev.dispatch_metadata->'callback'->>'requested_at')::timestamptz<due
  THEN RETURN '{"plan_eligible":false,"reason":"callback_conflicts_with_approved_delay"}';END IF;
  due:=(prev.dispatch_metadata->'callback'->>'requested_at')::timestamptz;
  IF NOT outreach_call_window(due,prev.dispatch_metadata->'callback'->>'timezone',cfg->'call_dispatch'->'campaign_windows')
  OR NOT outreach_call_window(due,prev.dispatch_metadata->'callback'->>'timezone',cfg->'call_dispatch'->'plan_windows')
  THEN RETURN '{"plan_eligible":false,"reason":"callback_outside_approved_window"}';END IF;
  IF now()>due+interval '15 minutes' THEN RETURN '{"plan_eligible":false,"reason":"callback_missed_requires_review"}';END IF;
 END IF;
 IF due>now() THEN RETURN jsonb_build_object('plan_eligible',false,'reason','delay_not_elapsed','due_at',due);END IF;
 RETURN jsonb_build_object('plan_eligible',true,'org_id',o,'plan_id',pid,'step',n,'call_brief',brief,'due_at',due,'execution_authorized',false);
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN RETURN '{"plan_eligible":false,"reason":"invalid_followup_configuration"}';
END $$;
REVOKE ALL ON FUNCTION outreach_call_step_check(integer,bigint,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_call_step_check(integer,bigint,integer) TO n8n_user;
COMMIT;
