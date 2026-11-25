 -- All fixtures and effects remain inside the diagnostic transaction.
 -- The preceding suite deliberately created an ambiguous sender. Restore its
 -- original binding before testing a legitimate provider replay.
 UPDATE strategy_campaign_versions SET config=jsonb_set(config,'{whatsapp_dispatch,connection,connection_id}','"wa-fixture"') WHERE org_id=l.org_id AND config->'whatsapp_dispatch'->'connection'->>'connection_id'='other-connection';
 INSERT INTO org_sender_memberships(org_id,subject,role,active) VALUES(l.org_id,repeat('a',64),'owner',true),(l.org_id,repeat('b',64),'member',true),(l.org_id,repeat('c',64),'admin',false) ON CONFLICT(org_id,subject) DO UPDATE SET role=excluded.role,active=excluded.active;
 binding:=p;
 SELECT id,dispatch_metadata INTO aid,b FROM outreach_activities WHERE org_id=l.org_id AND dispatch_metadata->>'provider_message_id'='wamid.unmatched';
 ASSERT aid IS NOT NULL,'incoming inbox fixture';
 e:=b||jsonb_build_object('kind','inbound','signature_verified',true);
 ASSERT outreach_whatsapp_inbox_read(l.org_id,repeat('b',64),'{}')->>'state'='read_only','active member can read org inbox';
 ASSERT outreach_whatsapp_inbox_read(l.org_id,repeat('c',64),'{}')->>'state'='blocked','inactive member blocked';
 ASSERT outreach_whatsapp_inbox_read(999999,repeat('a',64),'{}')->>'state'='blocked','foreign org inbox blocked';
 ASSERT outreach_whatsapp_inbox_read(l.org_id,repeat('a',64),'{"org_id":999999}')->>'state'='blocked','payload cannot override org';
 p:=jsonb_build_object('activity_id',aid,'expected_revision',1,'action','acknowledge','request_id','scratch-review-1');
 ASSERT outreach_whatsapp_inbox_manage(l.org_id,repeat('b',64),p)->>'reason'='admin_required','ordinary member cannot manage';
 ASSERT outreach_whatsapp_inbox_manage(l.org_id,repeat('a',64),p)->>'saved'='true','owner acknowledges';
 ASSERT outreach_whatsapp_inbox_manage(l.org_id,repeat('a',64),p)->>'idempotent'='true','review replay idempotent';
 ASSERT outreach_whatsapp_inbox_manage(l.org_id,repeat('a',64),p||'{"action":"archive"}')->>'saved'='false','request id cannot change action';
 ASSERT outreach_whatsapp_inbox_manage(l.org_id,repeat('a',64),p||'{"request_id":"scratch-stale"}')->>'reason'='inbox_revision_changed','stale editor blocked';
 p:=p||'{"expected_revision":2,"action":"archive","request_id":"scratch-archive-1"}'::jsonb;
 ASSERT outreach_whatsapp_inbox_manage(l.org_id,repeat('a',64),p)->>'saved'='true','owner archives';
 ASSERT (SELECT dispatch_metadata->>'review_state'='needs_review' AND dispatch_metadata->'inbox_review'->>'status'='archived' FROM outreach_activities WHERE id=aid),'archive does not lift contact hold';
 p:=p||'{"expected_revision":3,"action":"redact","request_id":"scratch-redact-1"}'::jsonb;
 ASSERT outreach_whatsapp_inbox_manage(l.org_id,repeat('a',64),p)->>'saved'='true','explicit body redaction';
 ASSERT (SELECT dispatch_metadata->'text'='null'::jsonb AND dispatch_metadata->>'event_hash'=b->>'event_hash' AND dispatch_metadata->>'recipient'=b->>'recipient' FROM outreach_activities WHERE id=aid),'redaction retains dedup and suppression identity';
 ASSERT outreach_whatsapp_inbound_store(e)->>'idempotent'='true','provider replay after redaction still deduplicates';
 ASSERT (SELECT dispatch_metadata->'text'='null'::jsonb FROM outreach_activities WHERE id=aid),'provider replay cannot restore redacted text';
 FOR bad IN SELECT value FROM jsonb_array_elements('[null,"text",{},[],{"activity_id":null},{"action":"resume"}]') LOOP
  ASSERT outreach_whatsapp_inbox_manage(l.org_id,repeat('a',64),bad)->>'saved'='false','malformed review safe';
  ASSERT outreach_whatsapp_inbox_retention(l.org_id,repeat('a',64),bad)->>'saved'='false','malformed retention safe';
 END LOOP;
 UPDATE outreach_activities SET created_at=(now()-interval '100 days') AT TIME ZONE 'UTC' WHERE org_id=l.org_id AND dispatch_metadata->>'provider_message_id'='wamid.standalone_stop';
 ASSERT outreach_whatsapp_inbox_retention(l.org_id,repeat('a',64),'{"retention_days":90}')->>'dry_run'='true','retention defaults dry run';
 ASSERT (SELECT dispatch_metadata->>'text'='STOP' FROM outreach_activities WHERE org_id=l.org_id AND dispatch_metadata->>'provider_message_id'='wamid.standalone_stop'),'dry run changes no content';
 ASSERT outreach_whatsapp_inbox_retention(l.org_id,repeat('b',64),'{"retention_days":90,"dry_run":false}')->>'saved'='false','retention admin only';
 ASSERT outreach_whatsapp_inbox_retention(l.org_id,repeat('a',64),'{"retention_days":90,"limit":1,"dry_run":false}')->>'matched'='1','bounded retention batch';
 ASSERT (SELECT dispatch_metadata->'text'='null'::jsonb AND dispatch_metadata->>'stop_reason'='opt_out' FROM outreach_activities WHERE org_id=l.org_id AND dispatch_metadata->>'provider_message_id'='wamid.standalone_stop'),'retention preserves opt-out';
 ASSERT outreach_whatsapp_gate(binding)->>'reason'='phone_opted_out','retention cannot reactivate contact';
 UPDATE org_sender_memberships SET active=false WHERE org_id=l.org_id AND subject=repeat('a',64);
 ASSERT outreach_whatsapp_inbox_read(l.org_id,repeat('a',64),'{}')->>'state'='blocked','revocation applies immediately';
