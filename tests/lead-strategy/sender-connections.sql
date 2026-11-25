SAVEPOINT sender_registry_test;
DO $test$
DECLARE cfg jsonb; result jsonb; principal text:=repeat('a',64); other text:=repeat('b',64); keyref text; campaign record;
BEGIN
 SELECT id INTO keyref FROM credentials_entity WHERE type='gmailOAuth2' ORDER BY id LIMIT 1;
 ASSERT keyref IS NOT NULL,'scratch Gmail credential metadata missing';
 INSERT INTO org_sender_memberships VALUES(1,principal,'owner',true),(1,other,'member',true);
 result:=sender_connection_manage(1,principal,jsonb_build_object('action','create','connection_id','scratch-owned','provider','gmail','credential_ref',keyref,'email','owner@example.org','sharing','private','limits',jsonb_build_object('daily_limit',10,'mailbox_rolling_limit',10,'min_interval_seconds',300)));
 ASSERT result->>'state'='pending_check','create failed';
 ASSERT sender_connection_manage(1,other,'{"action":"pause","connection_id":"scratch-owned","expected_version":1}')->>'error'='MANAGE_FORBIDDEN','member manages private sender';
 ASSERT sender_connection_manage(1,principal,'{"action":"pause","connection_id":"scratch-owned","expected_version":99}')->>'error'='VERSION_CONFLICT','stale edit accepted';
 ASSERT sender_connection_checked(1,'scratch-owned',1,jsonb_build_object('email','wrong@example.org','credential_ref',keyref,'send',true,'read_replies',true))->>'state'='reconnect_required','identity mismatch accepted';
 ASSERT sender_connection_checked(1,'scratch-owned',2,jsonb_build_object('email','owner@example.org','credential_ref',keyref,'send',true,'read_replies',true))->>'state'='ready','check failed';
 cfg:=jsonb_build_object('sender_connection',jsonb_build_object('connection_id','scratch-owned','provider','gmail','version',3,'subject',principal),
 'email_dispatch',jsonb_build_object('enabled',true,'credential_ref',keyref,'sender_email','owner@example.org','daily_limit',10,'mailbox_rolling_limit',10,'min_interval_seconds',300));
 ASSERT sender_connection_gate(1,cfg)->>'allowed'='true','ready sender blocked';
 SELECT id,version INTO campaign FROM strategy_campaigns WHERE org_id=1 ORDER BY id LIMIT 1;
 IF NOT FOUND THEN
  result:=strategy_campaign_save('{"org_id":1,"config":{"name":"Scratch sender binding","mode":"template","channels":["email"],"offer":{"description":"Scratch fixture"},"cta":{"text":"Review"}}}');
  SELECT id,version INTO campaign FROM strategy_campaigns WHERE org_id=1 AND id=(result->>'campaign_id')::bigint;
 END IF;
 ASSERT campaign.id IS NOT NULL,'campaign fixture required';
 ASSERT sender_connection_bind(1,other,'scratch-owned',campaign.id,campaign.version)->>'error'='sender_private','private sender bound by member';
 result:=sender_connection_bind(1,principal,'scratch-owned',campaign.id,campaign.version);
 ASSERT result->>'http_status'='200','campaign binding failed';
 ASSERT (SELECT config->'email_dispatch'->>'enabled' FROM strategy_campaign_versions WHERE org_id=1 AND campaign_id=campaign.id AND version=(result->>'version')::integer)='false','binding enabled sending';
 ASSERT sender_connection_bind(1,principal,'scratch-owned',campaign.id,campaign.version)->>'error'='CAMPAIGN_VERSION_CONFLICT','stale campaign bound';
 ASSERT sender_connection_gate(1,cfg-'sender_connection')->>'reason'='managed_sender_binding_required','managed ref downgraded to legacy';
 ASSERT sender_connection_gate(1,jsonb_set(cfg,'{sender_connection,subject}',to_jsonb(other)))->>'reason'='sender_private','private sender leaked';
 ASSERT sender_connection_gate(99999,cfg)->>'allowed'='false','cross-org allowed';
 ASSERT sender_connection_gate(1,jsonb_set(cfg,'{email_dispatch,daily_limit}','11'))->>'reason'='sender_limit_mismatch','limit raised';
 ASSERT sender_connection_gate(1,jsonb_set(cfg,'{sender_connection,version}','2'))->>'reason'='sender_connection_changed','stale plan accepted';
 UPDATE org_sender_memberships SET active=false WHERE org_id=1 AND subject=principal;
 ASSERT sender_connection_gate(1,cfg)->>'reason'='sender_membership_revoked','revoked member accepted';
 UPDATE org_sender_memberships SET active=true WHERE org_id=1 AND subject=principal;
 UPDATE sender_connections SET checked_at=now()-interval '25 hours' WHERE org_id=1 AND connection_id='scratch-owned';
 ASSERT sender_connection_gate(1,cfg)->>'reason'='sender_connection_not_ready','expired health accepted';
 UPDATE sender_connections SET checked_at=clock_timestamp() WHERE org_id=1 AND connection_id='scratch-owned';
 ASSERT sender_connection_manage(1,principal,'{"action":"disconnect","connection_id":"scratch-owned","expected_version":3}')->>'state'='disconnected','disconnect failed';
 ASSERT sender_connection_gate(1,cfg)->>'reason'='sender_connection_not_ready','disconnected sender accepted';
 ASSERT sender_connection_checked(1,'scratch-owned',4,jsonb_build_object('email','owner@example.org','credential_ref',keyref,'send',true,'read_replies',true))->>'error'='CHECK_STALE','late check revived disconnect';
 ASSERT sender_connection_manage(1,principal,'null')->>'error'='INVALID_REQUEST','bad input';
 ASSERT sender_connection_gate(1,'{"email_dispatch":{"credential_ref":"UNMANAGED_FIXTURE"}}')->>'legacy'='true','legacy changed';
END $test$;
ROLLBACK TO SAVEPOINT sender_registry_test;
