'use strict';
const cp=require('node:child_process'),assert=require('node:assert/strict');
const container='lead_016_1794141179811',database='scratch_contact_refresh_20261108';
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:60000,maxBuffer:2e6});if(r.status!==0)throw Error('SCRATCH_CHECK_UNCONFIRMED: '+(r.stderr||'').slice(0,800));return r.stdout.trim();}
try{
 assert.equal(docker(['inspect',container,'--format','{{.HostConfig.NetworkMode}}']),'none');docker(['start',container]);
 let ready=false;for(let i=0;i<40;i++){if(cp.spawnSync('docker',['exec',container,'pg_isready','-U','n8n_user'],{stdio:'ignore'}).status===0){ready=true;break;}Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,200);}assert(ready);
 const sql=`BEGIN;
 DO $check$
 DECLARE c strategy_campaigns%ROWTYPE; old_config jsonb; input_config jsonb; r jsonb; cfg jsonb; plans_before bigint; fingerprint_before text;
 BEGIN
 SELECT * INTO STRICT c FROM strategy_campaigns WHERE org_id=1 AND id=1;
 SELECT config INTO STRICT old_config FROM strategy_campaign_versions WHERE org_id=1 AND campaign_id=1 AND version=c.version;
 SELECT count(*) INTO plans_before FROM strategy_plans;
 fingerprint_before:=strategy_context(1,1,167)->>'fingerprint';
 IF fingerprint_before IS NULL THEN RAISE EXCEPTION 'FINGERPRINT_FIXTURE_UNAVAILABLE';END IF;
 input_config:=old_config||'{"tone":"concise","sender_connection":{"connection_id":"scratch-only-binding","provider":"gmail"},"future_extension":{"keep":true}}'::jsonb;
 r:=strategy_campaign_save(jsonb_build_object('org_id',1,'campaign_id',1,'expected_version',c.version,'config',input_config));
 IF r->>'error' IS NOT NULL OR (r->>'version')::integer<>c.version+1 THEN RAISE EXCEPTION 'VALID_SAVE_FAILED';END IF;
 SELECT config INTO STRICT cfg FROM strategy_campaign_versions WHERE org_id=1 AND campaign_id=1 AND version=c.version+1;
 IF cfg->'sender_connection' IS DISTINCT FROM input_config->'sender_connection' OR cfg->'future_extension' IS DISTINCT FROM input_config->'future_extension' OR cfg->'templates' IS DISTINCT FROM old_config->'templates' THEN RAISE EXCEPTION 'TRUSTED_FIELDS_LOST';END IF;
 IF (SELECT config FROM strategy_campaign_versions WHERE org_id=1 AND campaign_id=1 AND version=c.version) IS DISTINCT FROM old_config THEN RAISE EXCEPTION 'HISTORY_REWRITTEN';END IF;
 IF strategy_context(1,1,167)->>'fingerprint' IS NOT DISTINCT FROM fingerprint_before THEN RAISE EXCEPTION 'PLAN_FINGERPRINT_NOT_INVALIDATED';END IF;
 r:=strategy_campaign_save(jsonb_build_object('org_id',1,'campaign_id',1,'expected_version',c.version,'config',input_config));
 IF r->>'error' IS DISTINCT FROM 'VERSION_CONFLICT' OR (r->>'http_status')::integer<>409 THEN RAISE EXCEPTION 'RACE_NOT_REJECTED';END IF;
 r:=strategy_campaign_save(jsonb_build_object('org_id',2147483647,'campaign_id',1,'expected_version',c.version+1,'config',input_config));
 IF r->>'error' IS NULL THEN RAISE EXCEPTION 'CROSS_ORG_WRITE_ACCEPTED';END IF;
 IF (SELECT count(*) FROM strategy_plans)<>plans_before THEN RAISE EXCEPTION 'PLANS_CHANGED';END IF;
 END $check$;
 DO $cap$
 DECLARE s sender_connections%ROWTYPE; cfg jsonb; result jsonb;
 BEGIN
 SELECT * INTO STRICT s FROM sender_connections WHERE org_id=1 AND provider='gmail' LIMIT 1;
 UPDATE sender_connections SET state='ready',send_capable=true,reply_capable=true,checked_at=clock_timestamp() WHERE org_id=s.org_id AND connection_id=s.connection_id;
 UPDATE org_sender_memberships SET active=true WHERE org_id=s.org_id AND subject=s.owner_subject;
 cfg:=jsonb_build_object('sender_connection',jsonb_build_object('connection_id',s.connection_id,'version',s.version,'provider',s.provider,'subject',s.owner_subject),'email_dispatch',jsonb_build_object('enabled',false,'credential_ref',s.credential_ref,'sender_email',s.email,'daily_limit',least(s.daily_limit,4),'mailbox_rolling_limit',s.mailbox_rolling_limit,'min_interval_seconds',s.min_interval_seconds));
 result:=sender_connection_gate(1,cfg);
 IF result->>'allowed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'SAVED_LOWER_CAP_NOT_ACCEPTED: %',result->>'reason';END IF;
 cfg:=jsonb_set(cfg,'{email_dispatch,daily_limit}',to_jsonb(s.daily_limit+1));
 IF sender_connection_gate(1,cfg)->>'allowed' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'SENDER_CEILING_BYPASSED';END IF;
 IF cfg->'email_dispatch'->'enabled' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'SENDING_WAS_ENABLED';END IF;
 END $cap$;
 ROLLBACK;
 SELECT json_build_object('passed',true,'database',current_database(),'role',current_user,'version_conflict_checked',true,'history_and_sender_preserved',true,'plan_fingerprint_invalidated',true,'cross_org_write_rejected',true,'sender_daily_ceiling_enforced',true,'sending_not_enabled',true,'rolled_back',true,'model_calls',0,'live_database_changed',false);`;
 const out=docker(['exec','-i',container,'psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',database],sql);console.log(out.split('\n').find(x=>x.startsWith('{')));
}finally{cp.spawnSync('docker',['stop','--time','10',container],{stdio:'ignore',timeout:30000});}
