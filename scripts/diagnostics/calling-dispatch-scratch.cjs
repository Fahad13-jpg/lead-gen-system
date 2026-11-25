'use strict';
const fs=require('node:fs'),cp=require('node:child_process');
const container='lead_diag_pg_20261011',database='scratch_email_release_20261019';
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:90000,maxBuffer:1000000});if(r.status!==0)throw Error(String(r.stderr||r.error||'scratch failed').slice(0,3000));return r.stdout;}
const info=JSON.parse(docker(['inspect',container]));
if(info[0].Name!=='/'+container||info[0].HostConfig.NetworkMode!=='none'||!info[0].State.Running)throw Error('ISOLATED_RUNNING_SCRATCH_REQUIRED');
const files=['037_calling_preview.sql','038_calling_reservations.sql','039_calling_observations.sql','040_calling_settlement.sql','041_calling_dispatch.sql','042_calling_tools.sql','043_calling_results.sql','044_calling_followups.sql'];
const migration=files.map(f=>fs.readFileSync('database/migrations/'+f,'utf8').replace(/^BEGIN;\r?$/m,'').replace(/^COMMIT;\r?$/m,'')).join('\n');
const sql=`BEGIN;
${migration}
DO $test$
DECLARE l record;c bigint;j bigint;pid bigint;b jsonb;cfg jsonb;zone text;delta integer;req jsonb;r jsonb;s jsonb;aid integer;bind jsonb;slot_start timestamptz;slot_end timestamptz;fingerprint text;
BEGIN
 SELECT cl.org_id,cl.id INTO l FROM cleaned_leads cl JOIN organizations o ON o.id=cl.org_id WHERE o.status='active' ORDER BY cl.id LIMIT 1;
 ASSERT l.id IS NOT NULL,'scratch fixture required';
 UPDATE cleaned_leads SET phone='+12025550102',email=NULL WHERE id=l.id;
 UPDATE outreach_activities SET replied_at=NULL,bounced_at=NULL,dispatch_metadata=CASE WHEN channel='call' AND dispatch_metadata ? 'plan_id' THEN dispatch_metadata||'{"state":"cancelled_before_send"}'::jsonb ELSE dispatch_metadata END WHERE org_id=l.org_id OR channel='call';
 -- Choose a valid fixed zone where the test clock is noon; no dependence on wall-clock office hours.
 delta:=extract(hour FROM now() AT TIME ZONE 'UTC')::integer-12;zone:='Etc/GMT'||CASE WHEN delta>=0 THEN '+' ELSE '' END||delta;
 slot_start:=date_trunc('minute',now())+interval '2 days';slot_end:=slot_start+interval '15 minutes';
 cfg:=jsonb_build_object('call_dispatch',jsonb_build_object('enabled',true,'campaign_state','running','language','en','funding','platform','connection_ref','scratch-retell',
 'org_daily_calls',5,'min_interval_seconds',300,'safety_buffer_micro_usd',100000,
 'release',jsonb_build_object('enabled',true,'expires_at',now()+interval '1 day'),
 'quote',jsonb_build_object('verified',true,'max_call_micro_usd',300000,'expires_at',now()+interval '1 day'),
 'connection','{"ready":true,"credential_ref":"scratch-retell","country":"US","agent_id":"fixture-agent","agent_version":1,"from_number":"+12025550101","caller_id_authorized":true,"route_verified":true,"voice_tested":true}'::jsonb,
 'recipient_permissions',jsonb_build_object(l.id::text,jsonb_build_object('phone','+12025550102','country','US','country_verified',true,'calling_eligible',true,'timezone_verified',true,'timezone',zone,'permission_source_ref','scratch-only','reviewed_by','scratch-only','expires_at',now()+interval '1 day')),
 'campaign_windows','[{"days":["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],"start":"09:00","end":"17:00"}]'::jsonb,
 'plan_windows','[{"days":["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],"start":"09:00","end":"17:00"}]'::jsonb,
 'calendar',jsonb_build_object('ready',true,'id','fixture@example.invalid','slots',jsonb_build_array(jsonb_build_object('id','fixture-slot','start',slot_start,'end',slot_end)))));
 INSERT INTO strategy_campaigns(org_id) VALUES(l.org_id) RETURNING id INTO c;
 INSERT INTO strategy_campaign_versions(org_id,campaign_id,version,config) VALUES(l.org_id,c,1,cfg);
 INSERT INTO strategy_jobs(org_id,campaign_id,campaign_version,lead_id,request_id) VALUES(l.org_id,c,1,l.id,'calling-dispatch-scratch-'||c) RETURNING id INTO j;
 b:='{"version":"strategy_v2","state":"template_completed","execution_authorized":false,"blocking_reasons":[],"validation_errors":[],"strategy":{"step1":{"channel":"call"}},"artifacts":{"call_brief":{"opening":"fixture","permission_question":"fixture"}}}';
 fingerprint:=strategy_context(l.org_id,c,l.id)->>'fingerprint';
 INSERT INTO strategy_plans(org_id,job_id,campaign_id,campaign_version,lead_id,body,fingerprint,content_hash,expires_at)
 VALUES(l.org_id,j,c,1,l.id,b,fingerprint,md5(b::text),now()+interval '1 day') RETURNING id INTO pid;
 INSERT INTO strategy_approvals(org_id,plan_id,action,actor,content_hash) VALUES(l.org_id,pid,'approve','scratch',md5(b::text));
 ASSERT outreach_call_gate(l.org_id,pid,'wrong')->>'allowed'='false','wrong connection';
 ASSERT outreach_call_window('2026-11-02T15:00:00Z','America/New_York','[{"days":["Mon"],"start":"09:00","end":"17:00"}]')='true','DST window';
 ASSERT outreach_call_window(now(),'invalid','[]')='false','unknown timezone';
 ASSERT outreach_call_window(now(),'UTC','null')='false','malformed windows';
 ASSERT outreach_call_gate(l.org_id,pid,'scratch-retell')->>'allowed'='true','eligible gate: '||outreach_call_gate(l.org_id,pid,'scratch-retell')::text;
 -- Every negative fixture gets a fresh fingerprint; the specific gate must reject it.
 FOR req IN SELECT value FROM jsonb_array_elements('[{"campaign_state":"paused"},{"language":"ur"},{"release":{"enabled":false}},{"recipient_permissions":{}},{"min_interval_seconds":null},{"plan_windows":null}]') LOOP
  UPDATE strategy_campaign_versions SET config=jsonb_set(cfg,'{call_dispatch}',cfg->'call_dispatch'||req) WHERE org_id=l.org_id AND campaign_id=c;
  UPDATE strategy_plans SET fingerprint=strategy_context(l.org_id,c,l.id)->>'fingerprint' WHERE id=pid;
  ASSERT outreach_call_gate(l.org_id,pid,'scratch-retell')->>'allowed'='false','negative gate: '||req::text;
 END LOOP;
 UPDATE strategy_campaign_versions SET config=cfg WHERE org_id=l.org_id AND campaign_id=c;
 UPDATE strategy_plans SET fingerprint=strategy_context(l.org_id,c,l.id)->>'fingerprint' WHERE id=pid;
 r:=outreach_call_dispatch_next(l.org_id,'scratch-retell');ASSERT r->>'authorized'='true','claim and begin: '||r::text;
 aid:=(r->>'activity_id')::integer;
 ASSERT r->'request'->'agent_override'->'agent'->>'max_call_duration_ms'='60000','duration bounded';
 ASSERT (SELECT dispatch_metadata->>'attempts' FROM outreach_activities WHERE id=aid)='1','one attempt';
 ASSERT outreach_call_dispatch_next(l.org_id,'scratch-retell')->>'authorized'='false','no duplicate begin';
 bind:=jsonb_build_object('org_id',l.org_id,'activity_id',aid,'lease',r->>'lease','connection_ref','scratch-retell','content_hash',md5(b::text));
 ASSERT outreach_call_uncertain(bind||'{"lease":"wrong"}'::jsonb)->>'saved'='false','wrong uncertain lease';
 ASSERT outreach_call_uncertain(bind)->>'saved'='true','unknown create quarantined';
 bind:=bind||'{"provider_call_id":"fixture-call","status":"ongoing"}'::jsonb;
 ASSERT outreach_call_observe(bind)->>'saved'='true','correlated provider receipt';
 ASSERT outreach_call_observe(bind||'{"analysis":{"summary":"Fixture response","sentiment":"Positive","booked":true}}'::jsonb)->>'saved'='true','later summary saved';
 ASSERT (SELECT dispatch_metadata->'analysis'->>'review_required' FROM outreach_activities WHERE id=aid)='true','analysis needs review';
 ASSERT (SELECT dispatch_metadata->'analysis' ? 'booked' FROM outreach_activities WHERE id=aid)='false','analysis cannot claim booking';
 ASSERT (SELECT count(*) FROM outreach_call_poll_queue(l.org_id,'wrong'))=0,'poll credential scoped';
 ASSERT (SELECT count(*) FROM outreach_call_poll_queue(l.org_id,'scratch-retell'))=1,'poll known id';
 req:=bind||jsonb_build_object('operation','claim','event_id',repeat('a',64),'calendar_id','fixture@example.invalid','slot_id','fixture-slot','start',slot_start,'end',slot_end,'confirmed_by_recipient',true);
 ASSERT outreach_call_booking(req||'{"confirmed_by_recipient":false}'::jsonb)->>'acquired'='false','recipient must confirm';
 ASSERT outreach_call_booking(req||'{"calendar_id":"other"}'::jsonb)->>'acquired'='false','calendar identity';
 ASSERT outreach_call_booking(req)->>'acquired'='true','durable slot claim';
 ASSERT outreach_call_booking(req)->'existing'->>'state'='reconciliation_required','never reinsert after claim';
 ASSERT outreach_call_booking(req||'{"operation":"finish","state":"booked"}'::jsonb)->>'saved'='false','receipt required';
 ASSERT outreach_call_booking(req||'{"operation":"finish","state":"booked","receipt_verified":true}'::jsonb)->>'saved'='true','finish booking';
 ASSERT outreach_call_booking(req)->'existing'->>'state'='booked','saved booking replay';
 ASSERT outreach_call_stop(bind||'{"kind":"opt_out","event_id":"fixture-optout"}'::jsonb)->>'saved'='true','durable optout';
 ASSERT outreach_call_stop(bind||'{"kind":"opt_out","event_id":"fixture-optout"}'::jsonb)->>'idempotent'='true','optout replay';
 ASSERT outreach_call_stop(bind||'{"provider_call_id":"wrong","kind":"opt_out","event_id":"wrong"}'::jsonb)->>'saved'='false','stop wrong call';
 ASSERT EXISTS(SELECT 1 FROM outreach_activities WHERE id=aid AND dispatch_metadata->>'stop_reason'='opt_out'),'optout stored';
END $test$;
ROLLBACK;
SELECT count(*) FROM pg_proc WHERE proname IN ('outreach_call_dispatch_next','outreach_call_booking','outreach_call_stop');`;
if(require.main===module){
 const out=docker(['exec','-i',container,'psql','-X','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',database,'-At'],sql);
 if(!out.trim().endsWith('0'))throw Error('ROLLBACK_VERIFICATION_FAILED');
 console.log(JSON.stringify({database,migrations:files,result:'passed',rolled_back:true,live_changed:false}));
}
module.exports={sql};
