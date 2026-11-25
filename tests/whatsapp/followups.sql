 -- Executed only inside the network-none, rolled-back scratch harness.
 -- Clear earlier fixture stops; keep actual reservation/receipt history.
 UPDATE outreach_activities SET replied_at=NULL,bounced_at=NULL,created_at=(now()-interval '4 days') AT TIME ZONE 'UTC',dispatch_metadata=dispatch_metadata-'stop_reason'-'stop_events'-'followup_pause_reason' WHERE org_id=l.org_id AND lead_id=l.id;
 cfg:=jsonb_set(cfg,'{sequence}','[{"step":1,"channel":"whatsapp","delay_days":0},{"step":2,"channel":"whatsapp","delay_days":3}]'::jsonb);
 cfg:=jsonb_set(cfg,'{whatsapp_dispatch,templates_by_step}',jsonb_build_object('2',(cfg->'whatsapp_dispatch'->'template')||'{"id":"123459877","name":"clinic_reminder","body":"Hello {{1}}. Following up: {{2}} Reply STOP to opt out.","revision":"fixture-followup-only"}'::jsonb));
 UPDATE strategy_campaign_versions SET config=cfg WHERE org_id=l.org_id AND campaign_id=c AND version=1;
 INSERT INTO strategy_jobs(org_id,campaign_id,campaign_version,lead_id,request_id) VALUES(l.org_id,c,1,l.id,'whatsapp-followup-scratch-'||c) RETURNING id INTO j;
 b:=jsonb_build_object('version','strategy_v2','state','template_completed','execution_authorized',false,'approval_required',true,'validation_errors','[]'::jsonb,'blocking_reasons','[]'::jsonb,'strategy','{"step1":{"channel":"whatsapp"}}'::jsonb,'artifacts',jsonb_build_object('whatsapp_dispatch',art,'whatsapp_draft',art->>'rendered','whatsapp_sequence',jsonb_build_object('version','whatsapp_sequence_v1','org_id',l.org_id,'lead_id',l.id,'execution_authorized',false,'steps',jsonb_build_array(
 jsonb_build_object('step',1,'channel','whatsapp','delay_days',0,'previous_step',NULL,'delay_basis','initial','artifact',art),
 jsonb_build_object('step',2,'channel','whatsapp','delay_days',3,'previous_step',1,'delay_basis','previous_confirmed_send','artifact',art||jsonb_build_object('template_id','123459877','template_name','clinic_reminder','revision','fixture-followup-only','rendered','Hello Example Clinic. Following up: Would you like a demonstration? Reply STOP to opt out.','template_snapshot',cfg->'whatsapp_dispatch'->'templates_by_step'->'2'))))));
 INSERT INTO strategy_plans(org_id,job_id,campaign_id,campaign_version,lead_id,body,fingerprint,content_hash,expires_at) VALUES(l.org_id,j,c,1,l.id,b,strategy_context(l.org_id,c,l.id)->>'fingerprint',md5(b::text),now()+interval '7 days') RETURNING id INTO pid;
 p:=jsonb_build_object('org_id',l.org_id,'plan_id',pid::text,'content_hash',md5(b::text),'step',2);
 ASSERT outreach_whatsapp_gate(p)->>'reason'='approval_required','followup exact approval required';
 INSERT INTO strategy_approvals(org_id,plan_id,action,actor,content_hash) VALUES(l.org_id,pid,'approve','scratch',md5(b::text));
 ASSERT outreach_whatsapp_gate(p)->>'reason'='previous_confirmed_send_required','cannot skip first send: '||outreach_whatsapp_gate(p)::text;
 ASSERT outreach_whatsapp_gate(p||'{"step":11}'::jsonb)->>'reason'='invalid_whatsapp_step','bounded step';
 ASSERT outreach_whatsapp_gate(p||'{"org_id":999999}'::jsonb)->>'allowed'='false','followup org isolation';
 ASSERT outreach_whatsapp_gate(p||'{"content_hash":"wrong"}'::jsonb)->>'allowed'='false','followup hash bound';
 r:=outreach_whatsapp_begin(p||'{"step":1}'::jsonb);ASSERT r->>'authorized'='true','sequence first claim: '||r::text;aid:=(r->>'activity_id')::integer;
 ASSERT outreach_whatsapp_gate(p)->>'reason'='previous_confirmed_send_required','attempting is not acceptance';
 binding:=jsonb_build_object('org_id',l.org_id,'activity_id',aid,'content_hash',p->>'content_hash','lease',r->>'lease');
 ASSERT outreach_whatsapp_finish(binding||'{"state":"uncertain"}'::jsonb)->>'saved'='true','sequence uncertain';
 ASSERT outreach_whatsapp_gate(p)->>'reason'='previous_confirmed_send_required','uncertain does not unlock followup';
 ASSERT outreach_whatsapp_finish(binding||'{"state":"provider_accepted","provider_message_id":"wamid.sequence.first"}'::jsonb)->>'saved'='true','sequence acceptance';
 ASSERT outreach_whatsapp_gate(p)->>'reason'='followup_not_due','delay measured from actual confirmation';
 ASSERT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(outreach_whatsapp_queue(jsonb_build_object('org_id',l.org_id))->'items') item WHERE item->>'plan_id'=pid::text),'not due excluded from queue';
 UPDATE outreach_activities SET sent_at=(now()-interval '4 days') AT TIME ZONE 'UTC',created_at=(now()-interval '4 days') AT TIME ZONE 'UTC' WHERE id=aid;
 UPDATE outreach_activities SET dispatch_metadata=jsonb_set(dispatch_metadata,'{content_hash}','"old-hash"') WHERE id=aid;
 ASSERT outreach_whatsapp_gate(p)->>'reason'='previous_confirmed_send_required','older approved plan cannot unlock new followup';
 UPDATE outreach_activities SET dispatch_metadata=jsonb_set(dispatch_metadata,'{content_hash}',p->'content_hash')||'{"delivery_status":"failed"}'::jsonb WHERE id=aid;
 ASSERT outreach_whatsapp_gate(p)->>'reason'='previous_confirmed_send_required','delivery failure blocks followup';
 UPDATE outreach_activities SET dispatch_metadata=dispatch_metadata-'delivery_status' WHERE id=aid;
 ASSERT outreach_whatsapp_gate(p)->>'allowed'='true','due followup: '||outreach_whatsapp_gate(p)::text;
 ASSERT outreach_whatsapp_gate(p)->'artifact'->>'template_name'='clinic_reminder','correct followup template selected';
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(outreach_whatsapp_queue(jsonb_build_object('org_id',l.org_id))->'items') item WHERE item->>'plan_id'=pid::text AND item->>'step'='2'),'due step queued';
 -- Fail closed even when malformed sequence JSON has been explicitly hashed/approved.
 FOR bad IN SELECT value FROM jsonb_array_elements('[null,"text",{},[],{"version":"whatsapp_sequence_v1","steps":null},{"version":"whatsapp_sequence_v1","steps":{}},{"version":"whatsapp_sequence_v1","steps":"bad"}]') LOOP
  UPDATE strategy_plans SET body=jsonb_set(b,'{artifacts,whatsapp_sequence}',bad),content_hash=md5(jsonb_set(b,'{artifacts,whatsapp_sequence}',bad)::text) WHERE id=pid;
  SELECT jsonb_build_object('org_id',l.org_id,'plan_id',pid::text,'content_hash',content_hash,'step',2) INTO p FROM strategy_plans WHERE id=pid;
  INSERT INTO strategy_approvals(org_id,plan_id,action,actor,content_hash) VALUES(l.org_id,pid,'approve','scratch',p->>'content_hash');
  ASSERT outreach_whatsapp_gate(p)->>'allowed'='false','malformed approved sequence safely blocked';
 END LOOP;
 UPDATE strategy_plans SET body=b,content_hash=md5(b::text) WHERE id=pid;
 p:=jsonb_build_object('org_id',l.org_id,'plan_id',pid::text,'content_hash',md5(b::text),'step',2);
 INSERT INTO strategy_approvals(org_id,plan_id,action,actor,content_hash) VALUES(l.org_id,pid,'approve','scratch',p->>'content_hash');
 -- Follow-ups share the same organization reservation ceiling.
 UPDATE outreach_activities SET dispatch_metadata=jsonb_set(dispatch_metadata,'{reserved_micro_usd}','500000'::jsonb) WHERE id=aid;
 ASSERT outreach_whatsapp_begin(p)->>'reason'='monthly_budget_exhausted','followup budget not bypassed';
 UPDATE outreach_activities SET dispatch_metadata=jsonb_set(dispatch_metadata,'{reserved_micro_usd}','50000'::jsonb) WHERE id=aid;
 -- Real multi-day ageing must NOT be mistaken for a deployable happy path.
 -- Both the approved snapshot and current config match, but their check is stale.
 UPDATE strategy_campaign_versions SET config=jsonb_set(cfg,'{whatsapp_dispatch,templates_by_step,2,checked_at}',to_jsonb((now()-interval '4 days')::text)) WHERE org_id=l.org_id AND campaign_id=c AND version=1;
 UPDATE strategy_plans SET body=jsonb_set(b,'{artifacts,whatsapp_sequence,steps,1,artifact,template_snapshot,checked_at}',to_jsonb((now()-interval '4 days')::text)),fingerprint=strategy_context(l.org_id,c,l.id)->>'fingerprint' WHERE id=pid;
 UPDATE strategy_plans SET content_hash=md5(body::text) WHERE id=pid;
 SELECT jsonb_build_object('org_id',l.org_id,'plan_id',pid::text,'content_hash',content_hash,'step',2) INTO p FROM strategy_plans WHERE id=pid;
 INSERT INTO strategy_approvals(org_id,plan_id,action,actor,content_hash) VALUES(l.org_id,pid,'approve','scratch',p->>'content_hash');
 ASSERT outreach_whatsapp_gate(p)->>'reason'='template_changed_or_unapproved','multi-day template check expiry remains blocked';
 UPDATE strategy_campaign_versions SET config=cfg WHERE org_id=l.org_id AND campaign_id=c AND version=1;
 UPDATE strategy_plans SET body=b,content_hash=md5(b::text),fingerprint=strategy_context(l.org_id,c,l.id)->>'fingerprint' WHERE id=pid;
 p:=jsonb_build_object('org_id',l.org_id,'plan_id',pid::text,'content_hash',md5(b::text),'step',2);
 INSERT INTO strategy_approvals(org_id,plan_id,action,actor,content_hash) VALUES(l.org_id,pid,'approve','scratch',p->>'content_hash');
 -- A provider template change needs a new snapshot/plan approval, not reuse.
 UPDATE strategy_campaign_versions SET config=jsonb_set(config,'{whatsapp_dispatch,templates_by_step,2,status}','"PENDING"') WHERE org_id=l.org_id AND campaign_id=c AND version=1;
 UPDATE strategy_plans SET fingerprint=strategy_context(l.org_id,c,l.id)->>'fingerprint' WHERE id=pid;
 ASSERT outreach_whatsapp_gate(p)->>'reason'='template_changed_or_unapproved','current template rechecked';
 UPDATE strategy_campaign_versions SET config=cfg WHERE org_id=l.org_id AND campaign_id=c AND version=1;
 UPDATE strategy_plans SET fingerprint=strategy_context(l.org_id,c,l.id)->>'fingerprint' WHERE id=pid;
 -- RECHECK_TESTS
 UPDATE outreach_activities SET replied_at=now() AT TIME ZONE 'UTC' WHERE id=aid;
 ASSERT outreach_whatsapp_gate(p)->>'allowed'='false','reply prevents due followup';
 UPDATE outreach_activities SET replied_at=NULL WHERE id=aid;
 UPDATE strategy_plans SET fingerprint=strategy_context(l.org_id,c,l.id)->>'fingerprint' WHERE id=pid;
 r:=outreach_whatsapp_begin(p);ASSERT r->>'authorized'='true','followup claim: '||r::text;
 ASSERT (SELECT dispatch_metadata->>'step'='2' AND dispatch_metadata->'artifact'->>'template_name'='clinic_reminder' FROM outreach_activities WHERE id=(r->>'activity_id')::integer),'claim persists requested step and exact artifact';
 ASSERT outreach_whatsapp_begin(p)->>'authorized'='false','duplicate followup cannot send';
 binding:=jsonb_build_object('org_id',l.org_id,'activity_id',(r->>'activity_id')::integer,'content_hash',p->>'content_hash','lease',r->>'lease');
 ASSERT outreach_whatsapp_finish(binding||'{"state":"provider_accepted","provider_message_id":"wamid.sequence.second"}'::jsonb)->>'saved'='true','followup receipt retained';
 ASSERT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(outreach_whatsapp_queue(jsonb_build_object('org_id',l.org_id))->'items') item WHERE item->>'plan_id'=pid::text),'completed sequence leaves queue';
