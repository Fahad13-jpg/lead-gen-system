'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const container='lead_016_1794141179811',database='scratch_contact_refresh_20261108';
const renewal=process.argv.includes('--renewal');
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:60000,maxBuffer:2e6});if(r.status!==0)throw Error('SCRATCH_AUTHORITY_FAILED:'+String(r.stderr||r.error).slice(0,900));return r.stdout.trim();}
async function main(){assert.equal(docker(['inspect',container,'--format','{{.HostConfig.NetworkMode}}']),'none');const wasRunning=docker(['inspect',container,'--format','{{.State.Running}}'])==='true';docker(['start',container]);
 try{for(let i=0;i<40;i++){if(cp.spawnSync('docker',['exec',container,'pg_isready','-U','n8n_user'],{stdio:'ignore'}).status===0)break;await new Promise(r=>setTimeout(r,200));}
 const migration=['056_email_campaign_authority.sql',...(renewal?['057_email_campaign_renewal.sql']:[])].map(file=>fs.readFileSync('database/migrations/'+file,'utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'')).join('\n');
 const sql=`BEGIN;\n${migration}\nDO $test$
 DECLARE actor text:=repeat('7',64);cfg jsonb;result jsonb;campaign bigint;job bigint;pid bigint;body jsonb;scope jsonb;request jsonb;fp text;h text;count_before bigint;bad jsonb;claim_value jsonb;pub jsonb;published jsonb;send_payload jsonb;
 BEGIN
 SELECT count(*) INTO count_before FROM outreach_activities;
 UPDATE cleaned_leads SET email='recipient@example.test' WHERE org_id=1 AND id=167;
 INSERT INTO org_sender_memberships(org_id,subject,role,active) VALUES(1,actor,'owner',true) ON CONFLICT(org_id,subject) DO UPDATE SET role='owner',active=true;
 INSERT INTO sender_connections(org_id,connection_id,owner_subject,provider,credential_ref,email,sharing,version,state,daily_limit,mailbox_rolling_limit,min_interval_seconds,send_capable,reply_capable,checked_at)
 VALUES(1,'authority_scratch_sender',actor,'gmail','authority_scratch_credential','sender@example.test','private',1,'ready',10,10,300,true,true,now());
 SELECT config-'_email_execution' INTO cfg FROM strategy_campaign_versions WHERE org_id=1 AND campaign_id=1 ORDER BY version DESC LIMIT 1;
 cfg:=cfg||jsonb_build_object('name','SCRATCH authority fixture','sequence','[{"step":1,"channel":"email","delay_days":0},{"step":2,"channel":"email","delay_days":3}]'::jsonb,'sender_connection',jsonb_build_object('connection_id','authority_scratch_sender','version',1,'provider','gmail','subject',actor),'email_dispatch','{"enabled":true,"credential_ref":"authority_scratch_credential","sender_email":"sender@example.test","daily_limit":10,"mailbox_rolling_limit":10,"min_interval_seconds":300}'::jsonb);
 result:=strategy_campaign_save(jsonb_build_object('org_id',1,'config',cfg));campaign:=(result->>'campaign_id')::bigint;IF campaign IS NULL THEN RAISE EXCEPTION 'CAMPAIGN_FIXTURE_FAILED';END IF;
 INSERT INTO strategy_jobs(org_id,campaign_id,campaign_version,lead_id,request_id,status) VALUES(1,campaign,1,167,'scratch-campaign-authority','pending') RETURNING id INTO job;
 body:=jsonb_build_object('version','strategy_v2','state','template_completed','artifacts',jsonb_build_object('schedule',jsonb_build_object('sequence',cfg->'sequence'),'followup_drafts','[{"step":2,"channel":"email","delay_days":3,"subject":"Scratch follow-up","body":"Synthetic fixture only","status":"requires_plan_approval_and_execution_checks"}]'::jsonb));h:=md5(body::text);
 INSERT INTO strategy_plans(org_id,job_id,campaign_id,campaign_version,lead_id,body,fingerprint,content_hash,expires_at) VALUES(1,job,campaign,1,167,body,strategy_context(1,campaign,167)->>'fingerprint',h,now()+interval '7 days') RETURNING id INTO pid;
 INSERT INTO strategy_approvals(org_id,plan_id,action,actor,content_hash) VALUES(1,pid,'approve','synthetic scratch fixture',h);
 scope:=jsonb_build_object('format','email_campaign_authority_v1','org_id',1,'campaign_id',campaign,'campaign_version',1,'config_hash',md5(cfg::text),'sender_binding',jsonb_build_object('connection_id','authority_scratch_sender','version',1,'provider','gmail','email','sender@example.test','credential_ref','authority_scratch_credential'),'sequence',cfg->'sequence','plans',jsonb_build_array(jsonb_build_object('plan_id',pid,'content_hash',h,'recipient',(SELECT email FROM cleaned_leads WHERE org_id=1 AND id=167))),'end_at',now()+interval '6 days');
 request:=jsonb_build_object('action','approve','campaign_id',campaign,'campaign_version',1,'expected_revision',0,'scope',scope);
 fp:=strategy_context(1,campaign,167)->>'fingerprint';IF fp IS NULL THEN RAISE EXCEPTION 'FINGERPRINT_FIXTURE_FAILED';END IF;
 IF email_campaign_authority_manage(1,repeat('6',64),request)->>'error' IS DISTINCT FROM 'MEMBERSHIP_REQUIRED' THEN RAISE EXCEPTION 'OWNER_GUARD_FAILED';END IF;
 result:=email_campaign_authority_manage(1,actor,request);IF result->>'status' IS DISTINCT FROM 'approved' OR result->>'revision'<>'1' OR result->>'execution_authorized'<>'false' THEN RAISE EXCEPTION 'APPROVAL_FAILED %',result;END IF;
 IF strategy_context(1,campaign,167)->>'fingerprint' IS DISTINCT FROM fp THEN RAISE EXCEPTION 'OPERATIONAL_APPROVAL_CHANGED_FINGERPRINT';END IF;
 IF (strategy_context(1,campaign,167)#>'{campaign,config}') ? '_email_execution' THEN RAISE EXCEPTION 'OPERATIONAL_APPROVAL_EXPOSED_TO_STRATEGY';END IF;
 IF email_campaign_authority_manage(1,actor,request)->>'error' IS DISTINCT FROM 'AUTHORITY_REVISION_CHANGED' THEN RAISE EXCEPTION 'REVISION_GUARD_FAILED';END IF;
 result:=email_campaign_authority_manage(1,actor,request||'{"action":"revoke","expected_revision":1}'::jsonb);IF result->>'status'<>'revoked' OR result->>'revision'<>'2' THEN RAISE EXCEPTION 'REVOCATION_FAILED';END IF;
 IF strategy_context(1,campaign,167)->>'fingerprint' IS DISTINCT FROM fp THEN RAISE EXCEPTION 'REVOCATION_CHANGED_FINGERPRINT';END IF;
 FOR bad IN SELECT value FROM jsonb_array_elements('[null,"bad",{}]'::jsonb) LOOP
 result:=email_campaign_authority_manage(1,actor,request||jsonb_build_object('expected_revision',2,'scope',jsonb_set(scope,'{plans}',bad)));IF result->>'error' IS DISTINCT FROM 'INVALID_SCOPE' THEN RAISE EXCEPTION 'MALFORMED_ARRAY_GUARD_FAILED';END IF;
 END LOOP;
 result:=email_campaign_authority_manage(1,actor,request||jsonb_build_object('expected_revision',2,'scope',jsonb_set(scope,'{config_hash}','"changed"')));IF result->>'error' IS DISTINCT FROM 'SCOPE_CHANGED' THEN RAISE EXCEPTION 'CONFIG_HASH_GUARD_FAILED';END IF;
 ${renewal?`
 result:=email_campaign_authority_manage(1,actor,request||'{"expected_revision":2}'::jsonb);IF result->>'revision'<>'3' THEN RAISE EXCEPTION 'REAPPROVAL_FAILED';END IF;
 IF email_campaign_renewal_claim(1,campaign,'scratch-worker')->>'claimed'<>'false' THEN RAISE EXCEPTION 'DEFAULT_DISABLED_FAILED';END IF;
 result:=email_campaign_automation_control(1,actor,campaign,1,3,true);IF result->>'revision'<>'4' THEN RAISE EXCEPTION 'ENABLE_FAILED';END IF;
 claim_value:=email_campaign_renewal_claim(1,campaign,'scratch-worker');IF claim_value->>'claimed'<>'true' THEN RAISE EXCEPTION 'LEASE_CLAIM_FAILED %',claim_value;END IF;
 IF email_campaign_renewal_claim(1,campaign,'other-worker')->>'reason' IS DISTINCT FROM 'renewal_busy' THEN RAISE EXCEPTION 'CONCURRENT_CLAIM_NOT_FENCED';END IF;
 -- Only the eligibility port is mocked here, to isolate new lease/slice/revocation
 -- guards from the deliberately synthetic plan. Original SQL restores on rollback.
 EXECUTE $mock$ CREATE OR REPLACE FUNCTION outreach_email_step_check(p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE AS $function$ BEGIN RETURN '{"ready":true,"execution_authorized":false}'::jsonb;END $function$ $mock$;
 pub:=claim_value||jsonb_build_object('plan_id',pid,'target_step',2,'content_hash',h,'recipient',scope#>>'{plans,0,recipient}','expires_at',clock_timestamp()+interval '25 hours');
 IF email_campaign_slice_publish(pub||'{"lease":"wrong"}'::jsonb)->>'reason' IS DISTINCT FROM 'stale_renewal_lease' THEN RAISE EXCEPTION 'STALE_LEASE_ACCEPTED';END IF;
 published:=email_campaign_slice_publish(pub);IF published->>'issued'<>'true' THEN RAISE EXCEPTION 'PUBLISH_FAILED %',published;END IF;
 IF (published#>>'{slice,expires_at}')::timestamptz>clock_timestamp()+interval '24 hours' THEN RAISE EXCEPTION 'SLICE_EXPIRY_NOT_CAPPED';END IF;
 IF email_campaign_slice_publish(pub)#>>'{slice,authority,slice_id}' IS DISTINCT FROM published#>>'{slice,authority,slice_id}' THEN RAISE EXCEPTION 'PUBLISH_NOT_IDEMPOTENT';END IF;
 send_payload:=jsonb_build_object('org_id',1,'plan_id',pid,'step',2,'content_hash',h,'to_email',scope#>>'{plans,0,recipient}','sender_email','sender@example.test','credential_ref','authority_scratch_credential','authority',(published#>'{slice,authority}')||jsonb_build_object('target_step',2,'expires_at',published#>'{slice,expires_at}'));
 IF email_campaign_dispatch_gate(send_payload)->>'allowed'<>'true' THEN RAISE EXCEPTION 'CURRENT_SLICE_GATE_FAILED %',email_campaign_dispatch_gate(send_payload);END IF;
 IF email_campaign_dispatch_gate(send_payload-'authority')->>'allowed'<>'false' THEN RAISE EXCEPTION 'OMITTED_AUTHORITY_BYPASS';END IF;
 result:=email_campaign_authority_manage(1,actor,request||'{"action":"revoke","expected_revision":4}'::jsonb);IF result->>'status'<>'revoked' THEN RAISE EXCEPTION 'ACTIVE_AUTHORITY_REVOCATION_FAILED';END IF;
 IF email_campaign_dispatch_gate(send_payload)->>'allowed'<>'false' THEN RAISE EXCEPTION 'REVOKED_SLICE_REMAINED_ACTIVE';END IF;
 IF outreach_email_step_begin(send_payload)->>'reason' IS DISTINCT FROM 'campaign_authority_not_current' OR outreach_smtp_begin(send_payload)->>'reason' IS DISTINCT FROM 'campaign_authority_not_current' OR outreach_email_begin(send_payload)->>'reason' IS DISTINCT FROM 'campaign_authority_not_current' THEN RAISE EXCEPTION 'SEND_TIME_GUARD_NOT_INSTALLED';END IF;
 IF email_campaign_renewal_finish(claim_value)->>'finished'<>'false' THEN RAISE EXCEPTION 'STALE_WORKER_FINISHED_NEW_REVISION';END IF;
 `:''}
 UPDATE strategy_campaign_versions SET config=jsonb_set(config,'{tone}','"scratch changed"') WHERE org_id=1 AND campaign_id=campaign AND version=1;
 IF strategy_context(1,campaign,167)->>'fingerprint' IS NOT DISTINCT FROM fp THEN RAISE EXCEPTION 'BUSINESS_EDIT_DID_NOT_INVALIDATE_PLAN';END IF;
 IF (SELECT content_hash FROM strategy_plans WHERE id=pid) IS DISTINCT FROM h OR (SELECT count(*) FROM outreach_activities)<>count_before THEN RAISE EXCEPTION 'PLAN_OR_ACTIVITY_CHANGED';END IF;
 END $test$;ROLLBACK;`;
 docker(['exec','-i',container,'psql','-Xq','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',database],sql);
 const report={passed:true,database,rolled_back:true,migration_live_applied:false,synthetic_approval_fixture:true,mocked_step_eligibility:renewal,renewal_guards_tested:renewal,checks:['owner authorization','exact scope/plan validation','approval/revocation revisions','operational metadata preserves fingerprint','strategy output hides authority','business edits still change fingerprint','malformed arrays fail closed','plan hashes/activities unchanged',...(renewal?['default-disabled renewal','one current renewal lease','lease-fenced idempotent publication','24-hour slice cap','authority omission denied','revocation blocks all three send admission functions','stale worker finish denied']:[])],provider_requests:0,sent:false};fs.mkdirSync('.local/campaign-authority-20261110',{recursive:true});fs.writeFileSync('.local/campaign-authority-20261110/'+(renewal?'renewal-scratch.json':'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{if(!wasRunning)docker(['stop',container]);}}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
