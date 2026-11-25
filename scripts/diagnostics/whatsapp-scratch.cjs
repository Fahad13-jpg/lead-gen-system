'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),{fixture}=require('../../tests/whatsapp/fixture.cjs'),core=require('../whatsapp/core.cjs');
const container='lead_diag_pg_20261011',database='scratch_email_release_20261019';
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:90000,maxBuffer:1000000});if(r.status!==0)throw Error(String(r.stderr||r.error||'scratch failed').slice(0,5000));return r.stdout;}
const info=JSON.parse(docker(['inspect',container]));assert(info[0].Name==='/'+container&&info[0].HostConfig.NetworkMode==='none'&&info[0].State.Running,'ISOLATED_SCRATCH_REQUIRED');
const f=fixture(),artifact=core.prepare(f.input,f.now).artifact,q=v=>"'"+JSON.stringify(v).replace(/'/g,"''")+"'::jsonb";
const migration=fs.readFileSync('database/migrations/046_whatsapp_foundation.sql','utf8').replace(/^BEGIN;\r?$/m,'').replace(/^COMMIT;\r?$/m,'');
const registry=process.argv.includes('--registry'),inbox=process.argv.includes('--inbox')||registry,recheck=process.argv.includes('--recheck')||inbox,followups=process.argv.includes('--followups')||recheck,inbound=process.argv.includes('--inbound')||followups;
const sqlFile=file=>fs.readFileSync(file,'utf8').replace(/^BEGIN;\r?$/m,'').replace(/^COMMIT;\r?$/m,'');
const extension=(inbound?sqlFile('database/migrations/047_whatsapp_inbound.sql'):'')+'\n'+(followups?sqlFile('database/migrations/048_whatsapp_followups.sql'):'')+'\n'+(recheck?sqlFile('database/migrations/049_whatsapp_recheck.sql'):'')+'\n'+(inbox?sqlFile('database/migrations/050_whatsapp_inbox_controls.sql'):'');
// Reuse the EXISTING 035 membership definition as a rolled-back fixture in the
// older backup. This adds no product table/schema to the WhatsApp migrations.
const membership=registry?sqlFile('database/migrations/035_sender_connections.sql')+'\n'+sqlFile('database/migrations/036_smtp_receipts.sql'):inbox?fs.readFileSync('database/migrations/035_sender_connections.sql','utf8').match(/CREATE TABLE org_sender_memberships \([\s\S]*?\n\);/)[0].replace('CREATE TABLE ','CREATE TABLE IF NOT EXISTS '):'';
const sql=`BEGIN;
${membership}
${migration}
${inbound?`SELECT set_config('whatsapp_test.gate_oid', 'outreach_whatsapp_gate(jsonb)'::regprocedure::oid::text,true);`:''}
${extension}
${registry?`SELECT set_config('whatsapp_test.email_gate',pg_get_functiondef('sender_connection_gate(integer,jsonb)'::regprocedure),true); SELECT set_config('whatsapp_test.email_begin',pg_get_functiondef('outreach_email_step_begin(jsonb)'::regprocedure),true); SELECT set_config('whatsapp_test.smtp_gate',pg_get_functiondef('sender_connection_smtp_gate(integer,jsonb)'::regprocedure),true); SELECT set_config('whatsapp_test.smtp_begin',pg_get_functiondef('outreach_smtp_begin(jsonb)'::regprocedure),true);`+sqlFile('database/migrations/051_whatsapp_sender_registry.sql'):''}
DO $test$
DECLARE l record;cfg jsonb:= ${q(f.input.campaign.config)};art jsonb:=${q(artifact)};b jsonb;c bigint;j bigint;pid bigint;r jsonb;p jsonb;binding jsonb;e jsonb;aid integer;bad jsonb;
BEGIN
 SELECT cl.org_id,cl.id INTO l FROM cleaned_leads cl JOIN organizations o ON o.id=cl.org_id WHERE o.status='active' AND enrichment_report(cl.org_id,cl.id)->'trust'->'conflicts'='[]'::jsonb ORDER BY cl.id LIMIT 1;
 ASSERT l.id IS NOT NULL,'scratch report fixture required';
 DELETE FROM unsubscribes WHERE lower(email)=(SELECT lower(email) FROM cleaned_leads WHERE id=l.id);
 UPDATE outreach_activities SET replied_at=NULL,bounced_at=NULL,dispatch_metadata=dispatch_metadata-'stop_reason'-'stop_events'-'followup_pause_reason' WHERE org_id=l.org_id AND lead_id=l.id;
 UPDATE cleaned_leads SET company_name='Example Clinic',city='Lahore',phone='+923001234567' WHERE org_id=l.org_id AND id=l.id;
 cfg:=jsonb_set(cfg,'{whatsapp_dispatch,consents}',jsonb_build_object(l.id::text,cfg->'whatsapp_dispatch'->'consents'->'167'));
 cfg:=jsonb_set(cfg,'{whatsapp_dispatch,connection,org_id}',to_jsonb(l.org_id));art:=art||jsonb_build_object('org_id',l.org_id);
 INSERT INTO strategy_campaigns(org_id) VALUES(l.org_id) RETURNING id INTO c;
 INSERT INTO strategy_campaign_versions(org_id,campaign_id,version,config) VALUES(l.org_id,c,1,cfg);
 INSERT INTO strategy_jobs(org_id,campaign_id,campaign_version,lead_id,request_id) VALUES(l.org_id,c,1,l.id,'whatsapp-scratch-'||c) RETURNING id INTO j;
 b:=jsonb_build_object('version','strategy_v2','state','template_completed','execution_authorized',false,'approval_required',true,'validation_errors','[]'::jsonb,'blocking_reasons','[]'::jsonb,'strategy','{"step1":{"channel":"whatsapp"}}'::jsonb,'artifacts',jsonb_build_object('whatsapp_dispatch',art,'whatsapp_draft',art->>'rendered'));
 INSERT INTO strategy_plans(org_id,job_id,campaign_id,campaign_version,lead_id,body,fingerprint,content_hash,expires_at) VALUES(l.org_id,j,c,1,l.id,b,strategy_context(l.org_id,c,l.id)->>'fingerprint',md5(b::text),now()+interval '1 day') RETURNING id INTO pid;
 p:=jsonb_build_object('org_id',l.org_id,'plan_id',pid::text,'content_hash',md5(b::text),'step',1);
 ASSERT outreach_whatsapp_gate(p)->>'reason'='approval_required','requires approval';
 INSERT INTO strategy_approvals(org_id,plan_id,action,actor,content_hash) VALUES(l.org_id,pid,'approve','scratch',md5(b::text));
 ASSERT outreach_whatsapp_gate(p)->>'allowed'='true','gate: '||outreach_whatsapp_gate(p)::text;
 ASSERT outreach_whatsapp_gate(p||'{"step":2}'::jsonb)->>'allowed'='false','no unreviewed followup';
 ASSERT outreach_whatsapp_begin(p||'{"content_hash":"wrong"}'::jsonb)->>'authorized'='false','wrong hash';
 r:=outreach_whatsapp_begin(p);ASSERT r->>'authorized'='true','begin: '||r::text;aid:=(r->>'activity_id')::integer;
 ASSERT outreach_whatsapp_begin(p)->>'authorized'='false','no duplicate attempt';
 binding:=jsonb_build_object('org_id',l.org_id,'activity_id',aid,'content_hash',md5(b::text),'lease',r->>'lease');
 ASSERT outreach_whatsapp_finish(binding||'{"state":"uncertain","lease":"wrong"}'::jsonb)->>'saved'='false','lease bound';
 ASSERT outreach_whatsapp_finish(binding||'{"state":"uncertain"}'::jsonb)->>'state'='uncertain','quarantine';
 ASSERT outreach_whatsapp_begin(p)->>'authorized'='false','uncertainty not retry permission';
 ASSERT outreach_whatsapp_finish(binding||'{"state":"provider_accepted","provider_message_id":"wamid.fixture"}'::jsonb)->>'state'='provider_accepted','correlated acceptance';
 ASSERT outreach_whatsapp_finish(binding||'{"state":"provider_accepted","provider_message_id":"wamid.fixture"}'::jsonb)->>'idempotent'='true','receipt replay';
 ASSERT (SELECT dispatch_metadata->>'delivered' FROM outreach_activities WHERE id=aid)='false','accepted not delivered';
 ASSERT outreach_whatsapp_begin(p)->>'reason'='previous_attempt_or_spacing_unresolved','spacing survives acceptance';
 UPDATE outreach_activities SET dispatch_metadata=jsonb_set(dispatch_metadata,'{reserved_micro_usd}','500000'::jsonb) WHERE id=aid;
 ASSERT outreach_whatsapp_begin(p)->>'reason'='monthly_budget_exhausted','reserved ceiling prevents overspend';
 UPDATE outreach_activities SET dispatch_metadata=jsonb_set(dispatch_metadata,'{reserved_micro_usd}','50000'::jsonb) WHERE id=aid;
 e:=jsonb_build_object('org_id',l.org_id,'activity_id',aid,'kind','status','signature_verified',true,'provider_message_id','wamid.fixture','recipient','+923001234567','phone_number_id','123456789','waba_id','987654321','status','read','occurred_at',now());
 ASSERT outreach_whatsapp_event(e||'{"signature_verified":false}'::jsonb)->>'saved'='false','signature gate';
 ASSERT outreach_whatsapp_event(e||'{"phone_number_id":"99999"}'::jsonb)->>'saved'='false','sender binding';
 ASSERT outreach_whatsapp_ingest(jsonb_build_object('signature_verified',true,'events',jsonb_build_array(e-'org_id'-'activity_id'-'signature_verified')))->>'saved'='true','verified batch identity resolution';
 ASSERT outreach_whatsapp_event(e)->>'idempotent'='true','dedup';
 ASSERT outreach_whatsapp_event(e||'{"status":"sent"}'::jsonb)->>'saved'='true','late sent retained';
 ASSERT (SELECT dispatch_metadata->>'delivery_status' FROM outreach_activities WHERE id=aid)='read','status cannot regress';
 e:=e||'{"kind":"inbound","provider_message_id":"wamid.reply","status":null,"text":"Please share details","opt_out":false}'::jsonb;
 ASSERT outreach_whatsapp_event(e)->>'saved'='true','inbound reply';
 ASSERT (SELECT replied_at IS NOT NULL AND dispatch_metadata->>'followup_pause_reason'='reply' FROM outreach_activities WHERE id=aid),'reply stops followups';
 e:=e||'{"provider_message_id":"wamid.inbound","text":"STOP","opt_out":true}'::jsonb;
 ASSERT outreach_whatsapp_event(e)->>'saved'='true','inbound optout';
 ASSERT (SELECT dispatch_metadata->>'stop_reason'='opt_out' AND dispatch_metadata->>'followup_pause_reason'='opt_out' FROM outreach_activities WHERE id=aid),'durable optout';
 e:=e||'{"provider_message_id":"wamid.later","text":"Thank you","opt_out":false}'::jsonb;
 ASSERT outreach_whatsapp_event(e)->>'saved'='true','later reply retained';
 ASSERT (SELECT dispatch_metadata->>'stop_reason' FROM outreach_activities WHERE id=aid)='opt_out','optout cannot weaken';
 ASSERT outreach_whatsapp_gate(p)->>'reason' IN ('stale_plan','lead_stopped'),'reply invalidates or stops plan';
 ASSERT outreach_whatsapp_ingest('{"signature_verified":true,"events":[{"kind":"inbound","phone_number_id":"00000"}]}'::jsonb)->>'saved'='false','unknown sender not acknowledged';
 FOR bad IN SELECT value FROM jsonb_array_elements('[null,"text",{},[]]') LOOP
  ASSERT outreach_whatsapp_gate(bad)->>'allowed'='false','malformed gate';
  ASSERT outreach_whatsapp_finish(bad)->>'saved'='false','malformed finish';
  ASSERT outreach_whatsapp_event(bad)->>'saved'='false','malformed event';
  ASSERT outreach_whatsapp_ingest(bad)->>'saved'='false','malformed batch';
 END LOOP;
 ${followups?fs.readFileSync('tests/whatsapp/followups.sql','utf8').replace('-- RECHECK_TESTS',()=>recheck?fs.readFileSync('tests/whatsapp/recheck.sql','utf8'):''):''}
 ${inbound?`
 ASSERT 'outreach_whatsapp_gate(jsonb)'::regprocedure::oid::text=current_setting('whatsapp_test.gate_oid'),'public gate OID preserved';
 e:=jsonb_build_object('signature_verified',true,'kind','inbound','provider_message_id','wamid.unmatched','phone_number_id','123456789','waba_id','987654321','recipient','+923009998888','text','Hello','occurred_at',now(),'org_id',999999);
 r:=outreach_whatsapp_inbound_store(e);ASSERT r->>'saved'='true','standalone stored: '||r::text;
 ASSERT r->>'org_id'=l.org_id::text,'org resolved independently of callback';
 ASSERT (SELECT lead_id IS NULL AND dispatch_metadata->>'execution_authorized'='false' AND NOT(dispatch_metadata ? 'plan_id' OR dispatch_metadata ? 'step') FROM outreach_activities WHERE id=(r->>'activity_id')::integer),'no fake lead or plan';
 ASSERT outreach_whatsapp_inbound_store(e)->>'idempotent'='true','provider duplicate';
 -- Incoming metadata cannot disguise an outgoing send or carry a plan/lease.
 SELECT dispatch_metadata INTO b FROM outreach_activities WHERE id=(r->>'activity_id')::integer;
 ASSERT NOT outreach_whatsapp_inbound_shape(b,l.org_id,NULL,'whatsapp','attempting',NULL,NULL),'incoming cannot become attempting';
 ASSERT NOT outreach_whatsapp_inbound_shape(b,l.org_id,l.id,'whatsapp','received',NULL,NULL),'incoming cannot invent lead ownership';
 ASSERT NOT outreach_whatsapp_inbound_shape(b,l.org_id,NULL,'email','received',NULL,NULL),'incoming channel fixed';
 ASSERT NOT outreach_whatsapp_inbound_shape(b,l.org_id,NULL,'whatsapp','received','provider-send',NULL),'incoming cannot carry send receipt';
 ASSERT NOT outreach_whatsapp_inbound_shape(b,l.org_id,NULL,'whatsapp','received',NULL,now()::timestamp),'incoming cannot carry sent_at';
 FOR bad IN SELECT value FROM jsonb_array_elements('[{"plan_id":"1"},{"step":"1"},{"lease":"fake"},{"reserved_micro_usd":0},{"execution_authorized":true},{"signature_verified":false}]') LOOP
  ASSERT NOT outreach_whatsapp_inbound_shape(b||bad,l.org_id,NULL,'whatsapp','received',NULL,NULL),'incoming cannot bypass dispatch approval';
 END LOOP;
 ASSERT outreach_whatsapp_inbound_store(e||'{"text":"changed"}'::jsonb)->>'saved'='false','conflicting replay';
 ASSERT outreach_whatsapp_inbound_store(e||'{"signature_verified":false}'::jsonb)->>'saved'='false','unsigned blocked';
 ASSERT outreach_whatsapp_inbound_store(e||'{"phone_number_id":"99999999"}'::jsonb)->>'saved'='false','unknown sender blocked';
 ASSERT jsonb_array_length(outreach_whatsapp_inbox(jsonb_build_object('org_id',l.org_id,'limit',1))->'items')=1,'bounded inbox page';
 ASSERT outreach_whatsapp_inbox('{"org_id":999999}'::jsonb)->'items'='[]'::jsonb,'inbox org isolation';
 ASSERT outreach_whatsapp_inbox('{"org_id":1,"limit":101}'::jsonb)->>'state'='blocked','page limit enforced';
 FOR bad IN SELECT value FROM jsonb_array_elements('[null,"text",{},[],{"occurred_at":"bad"},{"unsupported_content":null},{"context_id":{}},{"text":[]}]') LOOP
  ASSERT outreach_whatsapp_inbound_store(CASE WHEN jsonb_typeof(bad)='object' AND bad<>'{}'::jsonb THEN e||bad ELSE bad END)->>'saved'='false','inbound malformed payload safe';
 END LOOP;
 ASSERT outreach_whatsapp_ingest(jsonb_build_object('signature_verified',true,'events',jsonb_build_array(e||'{"provider_message_id":"wamid.rollback"}'::jsonb,e||'{"provider_message_id":"wamid.bad","phone_number_id":"99999999"}'::jsonb)))->>'saved'='false','batch rejected';
 ASSERT NOT EXISTS(SELECT 1 FROM outreach_activities WHERE dispatch_metadata->>'provider_message_id'='wamid.rollback'),'batch has no partial writes';
 BEGIN
  INSERT INTO outreach_activities(org_id,lead_id,channel,status,dispatch_metadata) VALUES(l.org_id,NULL,'whatsapp','attempting','{"version":"whatsapp_v1","state":"attempting"}');
  RAISE EXCEPTION 'SENDING_CONSTRAINT_WAS_RELAXED';
 EXCEPTION WHEN check_violation THEN NULL;END;
 e:=e||jsonb_build_object('provider_message_id','wamid.standalone_stop','recipient','+923001234567','text','STOP','opt_out',true);
 ASSERT outreach_whatsapp_inbound_store(e)->>'saved'='true','standalone stop';
 UPDATE outreach_activities SET replied_at=NULL,bounced_at=NULL,dispatch_metadata=dispatch_metadata-'stop_reason'-'stop_events'-'followup_pause_reason' WHERE org_id=l.org_id AND lead_id=l.id;
 UPDATE strategy_plans SET fingerprint=strategy_context(l.org_id,c,l.id)->>'fingerprint' WHERE id=pid;
 ASSERT outreach_whatsapp_gate(p)->>'reason'='phone_opted_out','standalone STOP blocks later dispatch';
 e:=e||'{"provider_message_id":"wamid.afterstop","text":"Thank you","opt_out":false}'::jsonb;
 ASSERT outreach_whatsapp_inbound_store(e)->>'saved'='true','later reply stored';
 ASSERT outreach_whatsapp_gate(p)->>'reason'='phone_opted_out','later reply never clears optout';
 -- Multiple current connections for the same sender are ambiguous even within one org.
 UPDATE strategy_campaign_versions SET config=jsonb_set(config,'{whatsapp_dispatch,connection,connection_id}','"other-connection"'::jsonb) WHERE org_id=l.org_id AND campaign_id=c;
 INSERT INTO strategy_campaigns(org_id) VALUES(l.org_id) RETURNING id INTO c;
 INSERT INTO strategy_campaign_versions(org_id,campaign_id,version,config) VALUES(l.org_id,c,1,cfg);
 ASSERT outreach_whatsapp_inbound_store(e||'{"provider_message_id":"wamid.ambiguous"}'::jsonb)->>'saved'='false','ambiguous sender binding rejected';
 `:''}
 ${inbox?fs.readFileSync('tests/whatsapp/inbox.sql','utf8'):''}
 ${registry?fs.readFileSync('tests/whatsapp/sender-registry.sql','utf8'):''}
END $test$;
ROLLBACK;
SELECT count(*) FROM pg_proc WHERE proname LIKE 'outreach_whatsapp_%';`;
const result=docker(['exec','-i',container,'psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',database],sql);assert(result.trim().endsWith('0'),'ROLLBACK_VERIFICATION_FAILED');console.log(JSON.stringify({database,result:'passed',rolled_back:true,live_changed:false,provider_calls:0}));
