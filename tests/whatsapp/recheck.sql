 -- Simulate an already-approved multi-day fixture with stale original checks.
 -- Fixture setup changes below are scratch-only; the recheck store itself may
 -- change only predecessor dispatch metadata, which is asserted separately.
 UPDATE strategy_campaign_versions SET config=jsonb_set(jsonb_set(cfg,'{whatsapp_dispatch,connection,verified_at}',to_jsonb((now()-interval '4 days')::text)),'{whatsapp_dispatch,templates_by_step,2,checked_at}',to_jsonb((now()-interval '4 days')::text)) WHERE org_id=l.org_id AND campaign_id=c AND version=1;
 UPDATE strategy_plans SET body=jsonb_set(b,'{artifacts,whatsapp_sequence,steps,1,artifact,template_snapshot,checked_at}',to_jsonb((now()-interval '4 days')::text)),fingerprint=strategy_context(l.org_id,c,l.id)->>'fingerprint' WHERE id=pid;
 UPDATE strategy_plans SET content_hash=md5(body::text) WHERE id=pid;
 SELECT jsonb_build_object('org_id',l.org_id,'plan_id',pid::text,'content_hash',content_hash,'step',2) INTO p FROM strategy_plans WHERE id=pid;
 INSERT INTO strategy_approvals(org_id,plan_id,action,actor,content_hash) VALUES(l.org_id,pid,'approve','scratch',p->>'content_hash');
 UPDATE outreach_activities SET dispatch_metadata=jsonb_set(dispatch_metadata,'{content_hash}',p->'content_hash') WHERE id=aid;
 ASSERT outreach_whatsapp_gate(p)->>'reason'='sender_not_ready','stale original identity check blocks without observation';
 ASSERT outreach_whatsapp_recheck_input(p)->>'ready'='true','due stale plan exposes trusted recheck task';
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(outreach_whatsapp_queue(jsonb_build_object('org_id',l.org_id))->'items') item WHERE item->>'plan_id'=pid::text AND item->>'step'='2'),'stale due candidate reachable for recheck';
 SELECT jsonb_build_object('body',body,'content_hash',content_hash,'fingerprint',fingerprint,'context_fingerprint',strategy_context(l.org_id,c,l.id)->>'fingerprint','approval_id',(SELECT max(id) FROM strategy_approvals WHERE org_id=l.org_id AND plan_id=pid)) INTO binding FROM strategy_plans WHERE id=pid;
 SELECT p||jsonb_build_object('version','whatsapp_recheck_v1','previous_activity_id',aid,'connection_id','wa-fixture','credential_ref','MOCK_CREDENTIAL','phone_number_id','123456789','waba_id','987654321','api_version','v99.0','checked_at',now()-interval '1 minute','execution_authorized',false,'state','verified','sender_account_match',true,'template',(body->'artifacts'->'whatsapp_sequence'->'steps'->1->'artifact'->'template_snapshot')-'checked_at') INTO e FROM strategy_plans WHERE id=pid;
 ASSERT outreach_whatsapp_recheck_store(e)->>'saved'='true','fresh same-content recheck persisted';
 ASSERT outreach_whatsapp_gate(p)->>'allowed'='true','same content refresh unlocks due followup: '||outreach_whatsapp_gate(p)::text;
 ASSERT (SELECT body=binding->'body' AND content_hash=binding->>'content_hash' AND fingerprint=binding->>'fingerprint' AND strategy_context(l.org_id,c,l.id)->>'fingerprint'=binding->>'context_fingerprint' FROM strategy_plans WHERE id=pid),'recheck does not alter plan, hash or context fingerprint';
 ASSERT (SELECT max(id)::text FROM strategy_approvals WHERE org_id=l.org_id AND plan_id=pid)=binding->>'approval_id','no approval mutation';
 ASSERT outreach_whatsapp_recheck_store(e||'{"org_id":999999}'::jsonb)->>'saved'='false','cross-org observation rejected';
 ASSERT outreach_whatsapp_recheck_store(e||'{"content_hash":"other-plan"}'::jsonb)->>'saved'='false','observation cannot cross hashes';
 ASSERT outreach_whatsapp_recheck_store(e||'{"connection_id":"other"}'::jsonb)->>'saved'='false','observation cannot cross sender';
 ASSERT outreach_whatsapp_recheck_store(jsonb_set(e,'{template,body}','"Changed provider body"'))->>'saved'='false','changed body cannot renew approval';
 ASSERT outreach_whatsapp_recheck_store(jsonb_set(e,'{template,variable_refs}','["cta","company_name"]'::jsonb))->>'saved'='false','variable order is immutable';
 ASSERT outreach_whatsapp_recheck_store(e||'{"access_token":"MOCK_NOT_A_SECRET"}'::jsonb)->>'saved'='false','unexpected credential fields never persisted';
 ASSERT outreach_whatsapp_recheck_store(e||jsonb_build_object('checked_at',now()-interval '30 seconds','state','failed','sender_account_match',false,'reason','provider_recheck_unconfirmed'))->>'saved'='true','failure replaces older positive observation';
 ASSERT outreach_whatsapp_gate(p)->>'reason'='provider_recheck_required','no fallback to an older positive check';
 ASSERT outreach_whatsapp_recheck_input(p)->>'reason'='provider_recheck_backoff','failed read-only rechecks back off';
 ASSERT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(outreach_whatsapp_queue(jsonb_build_object('org_id',l.org_id))->'items') item WHERE item->>'plan_id'=pid::text AND item->>'step'='2'),'backoff excludes candidate';
 ASSERT outreach_whatsapp_recheck_store(e)->>'saved'='false','older positive cannot erase failure';
 e:=e||jsonb_build_object('checked_at',now()-interval '10 seconds');
 ASSERT outreach_whatsapp_recheck_store(e)->>'saved'='true','new verified observation can recover';
 ASSERT outreach_whatsapp_gate(p)->>'allowed'='true','recovery retains original approval';
 UPDATE strategy_campaign_versions SET config=jsonb_set(config,'{whatsapp_dispatch,connection,expires_at}',to_jsonb((now()-interval '1 minute')::text)) WHERE org_id=l.org_id AND campaign_id=c AND version=1;
 UPDATE strategy_plans SET fingerprint=strategy_context(l.org_id,c,l.id)->>'fingerprint' WHERE id=pid;
 ASSERT outreach_whatsapp_gate(p)->>'reason'='sender_not_ready','provider recheck cannot extend credential expiry';
 UPDATE strategy_campaign_versions SET config=jsonb_set(config,'{whatsapp_dispatch,connection,expires_at}',cfg->'whatsapp_dispatch'->'connection'->'expires_at') WHERE org_id=l.org_id AND campaign_id=c AND version=1;
 UPDATE strategy_campaign_versions SET config=jsonb_set(config,'{whatsapp_dispatch,quote,expires_at}',to_jsonb((now()-interval '1 minute')::text)) WHERE org_id=l.org_id AND campaign_id=c AND version=1;
 UPDATE strategy_plans SET fingerprint=strategy_context(l.org_id,c,l.id)->>'fingerprint' WHERE id=pid;
 ASSERT outreach_whatsapp_gate(p)->>'reason'='budget_quote_or_release_required','provider recheck cannot extend quote or release';
 FOR bad IN SELECT value FROM jsonb_array_elements('[null,"text",{},[],{"checked_at":"bad"},{"checked_at":null}]') LOOP
  ASSERT outreach_whatsapp_recheck_store(CASE WHEN jsonb_typeof(bad)='object' AND bad<>'{}'::jsonb THEN e||bad ELSE bad END)->>'saved'='false','malformed observation safe';
 END LOOP;
 ASSERT NOT outreach_whatsapp_recheck_valid(e||jsonb_build_object('checked_at',now()-interval '25 hours'),'{}'::jsonb),'observation freshness still bounded';
 -- Restore surrounding suite fixture, not a production refresh mechanism.
 UPDATE strategy_campaign_versions SET config=cfg WHERE org_id=l.org_id AND campaign_id=c AND version=1;
 UPDATE strategy_plans SET body=b,content_hash=md5(b::text),fingerprint=strategy_context(l.org_id,c,l.id)->>'fingerprint' WHERE id=pid;
 p:=jsonb_build_object('org_id',l.org_id,'plan_id',pid::text,'content_hash',md5(b::text),'step',2);
 UPDATE outreach_activities SET dispatch_metadata=(dispatch_metadata-'whatsapp_rechecks')||jsonb_build_object('content_hash',p->>'content_hash') WHERE id=aid;
 INSERT INTO strategy_approvals(org_id,plan_id,action,actor,content_hash) VALUES(l.org_id,pid,'approve','scratch',p->>'content_hash');
