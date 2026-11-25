'use strict';
const fs=require('node:fs'),cp=require('node:child_process');
const container='lead_diag_pg_20261011',database='scratch_email_release_20261019';
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:60000,maxBuffer:1000000});if(r.status!==0)throw Error(String(r.stderr||r.error||'scratch error').slice(0,1800));return r.stdout;}
const info=JSON.parse(docker(['inspect',container]));
if(info[0].Name!=='/'+container||info[0].HostConfig.NetworkMode!=='none')throw Error('SCRATCH_ONLY');
const migrations=['037_calling_preview.sql','038_calling_reservations.sql','039_calling_observations.sql','040_calling_settlement.sql'].map(f=>fs.readFileSync('database/migrations/'+f,'utf8').replace(/^BEGIN;\r?$/m,'').replace(/^COMMIT;\r?$/m,'')).join('\n');
const sql=`BEGIN;
${migrations}
DO $test$
DECLARE l record; c bigint; j bigint; pid bigint; pid2 bigint; b jsonb; cfg jsonb; fp text; r jsonb; s jsonb; req jsonb; cancel jsonb; a integer; lease text; counter integer;
BEGIN
 SELECT cl.org_id,cl.id INTO l FROM cleaned_leads cl JOIN organizations o ON o.id=cl.org_id
 WHERE o.status='active' ORDER BY cl.id LIMIT 1;
 ASSERT l.id IS NOT NULL,'need organization-owned scratch lead';
 -- Isolated fixture data only; transaction rollback restores every existing row.
 UPDATE cleaned_leads SET phone='+923001234567',email=NULL WHERE id=l.id;
 UPDATE outreach_activities SET replied_at=NULL,bounced_at=NULL WHERE org_id=l.org_id AND lead_id=l.id;
 UPDATE outreach_activities SET dispatch_metadata=dispatch_metadata||'{"state":"cancelled_before_send"}'::jsonb WHERE channel='call' AND dispatch_metadata ? 'plan_id';
 cfg:=jsonb_build_object('call_dispatch',jsonb_build_object('enabled',true,'funding','platform','connection_ref','scratch-only',
 'org_daily_calls',5,'safety_buffer_micro_usd',100000,'quote',jsonb_build_object('verified',true,'max_call_micro_usd',300000,'expires_at',now()+interval '1 day')));
 INSERT INTO strategy_campaigns(org_id) VALUES(l.org_id) RETURNING id INTO c;
 INSERT INTO strategy_campaign_versions(org_id,campaign_id,version,config) VALUES(l.org_id,c,1,cfg);
 fp:=strategy_context(l.org_id,c,l.id)->>'fingerprint';ASSERT fp IS NOT NULL,'context must exist';
 b:='{"version":"strategy_v2","state":"template_completed","blocking_reasons":[],"validation_errors":[],"strategy":{"step1":{"channel":"call"}},"artifacts":{"call_brief":{"opening":"fixture","permission_question":"fixture"}}}';
 FOR counter IN 1..2 LOOP
  INSERT INTO strategy_jobs(org_id,campaign_id,campaign_version,lead_id,request_id) VALUES(l.org_id,c,1,l.id,'call-reservation-test-'||c||'-'||counter) RETURNING id INTO j;
  INSERT INTO strategy_plans(org_id,job_id,campaign_id,campaign_version,lead_id,body,fingerprint,content_hash,expires_at)
  VALUES(l.org_id,j,c,1,l.id,b,fp,md5(b::text),now()+interval '1 day') RETURNING id INTO pid;
  INSERT INTO strategy_approvals(org_id,plan_id,action,actor,content_hash) VALUES(l.org_id,pid,'approve','scratch fixture',md5(b::text));
  IF counter=1 THEN pid2:=pid;END IF;
 END LOOP;
 req:=jsonb_build_object('org_id',l.org_id,'plan_id',pid,'content_hash',md5(b::text));
 ASSERT outreach_call_reserve(req||'{"content_hash":"wrong"}'::jsonb)->>'reserved'='false','hash binding';
 r:=outreach_call_reserve(req);ASSERT r->>'reserved'='true','first reserve: '||r::text;
 ASSERT r->>'execution_authorized'='false','reservation cannot grant transport';
 a:=(r->>'activity_id')::integer;lease:=r->>'lease';
 ASSERT outreach_call_reserve(req)->>'reserved'='false','same plan no duplicate';
 s:=outreach_call_reserve(req||jsonb_build_object('plan_id',pid2));ASSERT s->>'reason'='call_active_or_uncertain','second plan serial gate';
 UPDATE outreach_activities SET dispatch_metadata=jsonb_set(dispatch_metadata,'{lease_until}',to_jsonb(now()-interval '1 day')) WHERE id=a;
 ASSERT outreach_call_reserve(req||jsonb_build_object('plan_id',pid2))->>'reason'='call_active_or_uncertain','expired lease no replay';
 cancel:=jsonb_build_object('org_id',l.org_id,'activity_id',a,'lease',lease);
 ASSERT outreach_call_cancel_reserved(cancel||'{"lease":"wrong"}'::jsonb)->>'cancelled'='false','wrong lease';
 ASSERT outreach_call_cancel_reserved(cancel||jsonb_build_object('org_id',l.org_id+100000))->>'cancelled'='false','wrong tenant';
 UPDATE outreach_activities SET dispatch_metadata=jsonb_set(dispatch_metadata,'{attempts}','1') WHERE id=a;
 ASSERT outreach_call_cancel_reserved(cancel)->>'reason'='reconciliation_required','attempted call cannot release';
 UPDATE outreach_activities SET dispatch_metadata=jsonb_set(dispatch_metadata,'{attempts}','0') WHERE id=a;
 ASSERT outreach_call_cancel_reserved(cancel)->>'cancelled'='true','safe cancellation';
 ASSERT outreach_call_cancel_reserved(cancel)->>'replayed'='true','cancel idempotency';
 -- Simulate a reconciled cost; no provider or billing API is contacted.
 UPDATE outreach_activities SET dispatch_metadata=dispatch_metadata||'{"state":"settled","actual_micro_usd":9800000}'::jsonb WHERE id=a;
 ASSERT outreach_call_reserve(req||jsonb_build_object('plan_id',pid2))->>'reason'='waiting_for_calling_credits','shared monthly cap';
 UPDATE outreach_activities SET dispatch_metadata=jsonb_set(dispatch_metadata,'{actual_micro_usd}','"malformed"') WHERE id=a;
 ASSERT outreach_call_reserve(req||jsonb_build_object('plan_id',pid2))->>'reason'='cost_reconciliation_required','bad cost fail closed';
 UPDATE outreach_activities SET dispatch_metadata=jsonb_set(dispatch_metadata,'{actual_micro_usd}','0') WHERE id=a;
 UPDATE strategy_campaign_versions SET config=jsonb_set(config,'{call_dispatch,quote,expires_at}','"not-a-date"') WHERE org_id=l.org_id AND campaign_id=c;
 UPDATE strategy_plans SET fingerprint=strategy_context(l.org_id,c,l.id)->>'fingerprint' WHERE org_id=l.org_id AND id=pid2;
 ASSERT outreach_call_reserve(req||jsonb_build_object('plan_id',pid2))->>'reason'='invalid_configuration','bad quote date';
 -- Customer-funded allowance remains independent from the exhausted shared pool.
 UPDATE outreach_activities SET dispatch_metadata=jsonb_set(dispatch_metadata,'{actual_micro_usd}','9800000') WHERE id=a;
 cfg:=jsonb_set(cfg,'{call_dispatch,funding}','"byok"');
 cfg:=jsonb_set(cfg,'{call_dispatch,monthly_ceiling_micro_usd}','2000000');
 UPDATE strategy_campaign_versions SET config=cfg WHERE org_id=l.org_id AND campaign_id=c;
 UPDATE strategy_plans SET fingerprint=strategy_context(l.org_id,c,l.id)->>'fingerprint' WHERE org_id=l.org_id AND id=pid2;
 r:=outreach_call_reserve(req||jsonb_build_object('plan_id',pid2));
 ASSERT r->>'reserved'='true','BYOK separate from shared platform pool: '||r::text;
 ASSERT (SELECT dispatch_metadata->>'funding' FROM outreach_activities WHERE id=(r->>'activity_id')::integer)='byok';
 a:=(r->>'activity_id')::integer;
 req:=jsonb_build_object('org_id',l.org_id,'activity_id',a,'lease',r->>'lease','connection_ref','scratch-only',
 'content_hash',md5(b::text),'provider_call_id','fixture-call','status','ongoing','duration_ms',1000);
 ASSERT outreach_call_observe(req)->>'saved'='false','reservation must not count as started call';
 -- Simulated prior begin; no begin function or live transport is enabled.
 UPDATE outreach_activities SET dispatch_metadata=dispatch_metadata||'{"state":"dispatching","attempts":1}'::jsonb WHERE id=a;
 ASSERT outreach_call_observe(req||'{"lease":"wrong"}'::jsonb)->>'saved'='false','observation wrong lease';
 ASSERT outreach_call_observe(req||jsonb_build_object('org_id',l.org_id+100000))->>'saved'='false','observation wrong org';
 ASSERT outreach_call_observe(req||'{"connection_ref":"wrong"}'::jsonb)->>'saved'='false','observation wrong connection';
 ASSERT outreach_call_observe(req)->>'saved'='true','valid observation';
 ASSERT outreach_call_observe(req)->>'replayed'='true','observation replay';
 ASSERT outreach_call_observe(req||'{"status":"registered"}'::jsonb)->>'ignored_stale'='true','old status ignored';
 ASSERT outreach_call_observe(req||'{"provider_call_id":"other"}'::jsonb)->>'saved'='false','wrong provider call';
 ASSERT outreach_call_observe(req||'{"duration_ms":-1}'::jsonb)->>'saved'='false','bad duration';
 s:=outreach_call_observe(req||'{"status":"ended","duration_ms":50000}'::jsonb);
 ASSERT s->>'state'='awaiting_final_cost','end does not release budget';
 ASSERT (SELECT dispatch_metadata->>'reserved_micro_usd' FROM outreach_activities WHERE id=a)='300000';
 ASSERT outreach_call_observe(req)->>'ignored_stale'='true','late ongoing cannot regress terminal state';
 ASSERT outreach_call_observe(req||'{"status":"error"}'::jsonb)->>'reason'='terminal_status_conflict','terminal conflict';
 req:=req||'{"currency":"USD","all_provider_costs_final":true,"evidence_ref":"scratch-receipt","total_micro_usd":250000}'::jsonb;
 ASSERT outreach_call_settle(req)->>'saved'='false','conflicted outcome cannot settle';
 UPDATE outreach_activities SET dispatch_metadata=dispatch_metadata-'provider_status_conflict' WHERE id=a;
 ASSERT outreach_call_settle(req||'{"all_provider_costs_final":false}'::jsonb)->>'saved'='false','partial carrier cost cannot settle';
 ASSERT outreach_call_settle(req||'{"lease":"wrong"}'::jsonb)->>'saved'='false','settlement lease mismatch';
 ASSERT outreach_call_settle(req)->>'saved'='true','valid all-in settlement';
 ASSERT outreach_call_settle(req)->>'replayed'='true','settlement idempotency';
 ASSERT (SELECT dispatch_metadata->>'reserved_micro_usd' FROM outreach_activities WHERE id=a)='0','reservation released';
 ASSERT outreach_call_settle(req||'{"total_micro_usd":260000}'::jsonb)->>'reason'='settlement_conflict','changed final bill requires review';
 ASSERT (SELECT dispatch_metadata->>'cost_review_required' FROM outreach_activities WHERE id=a)='true';
 RAISE NOTICE 'Reservation checks passed';
END $test$;
ROLLBACK;
SELECT count(*) FROM pg_proc WHERE proname IN ('outreach_call_preview','outreach_call_reserve','outreach_call_cancel_reserved','outreach_call_amount','outreach_call_observe','outreach_call_settle');`;
const out=docker(['exec','-i',container,'psql','-X','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',database,'-At'],sql);
if(!out.trim().endsWith('0'))throw Error('ROLLBACK_VERIFICATION_FAILED');
console.log(JSON.stringify({database,migrations:['037','038','039','040'],result:'passed',rolled_back:true,live_changed:false}));
