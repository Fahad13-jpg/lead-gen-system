'use strict';
// Hardcoded isolated scratch target. Migration exists only inside a rolled-back transaction.
const cp=require('node:child_process'),fs=require('node:fs');
const container='lead_diag_pg_20261011',db='scratch_email_release_20261019';
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:60000,maxBuffer:1000000});if(r.status!==0)throw Error(String(r.stderr||r.error||'scratch command failed').slice(0,1000));return r.stdout;}
const info=JSON.parse(docker(['inspect',container]));
if(info[0].Name!=='/'+container||info[0].HostConfig.NetworkMode!=='none')throw Error('SCRATCH_ISOLATION_REQUIRED');
let migration=fs.readFileSync('database/migrations/037_calling_preview.sql','utf8').replace(/^BEGIN;\r?$/m,'').replace(/^COMMIT;\r?$/m,'');
const sql=`BEGIN;
${migration}
DO $seed$ DECLARE l record; c bigint; j bigint; b jsonb; BEGIN
 SELECT org_id,id INTO l FROM cleaned_leads WHERE org_id IS NOT NULL ORDER BY id LIMIT 1;
 ASSERT l.id IS NOT NULL,'scratch requires a cleaned lead';
 INSERT INTO strategy_campaigns(org_id) VALUES(l.org_id) RETURNING id INTO c;
 INSERT INTO strategy_campaign_versions(org_id,campaign_id,version,config) VALUES(l.org_id,c,1,'{}');
 INSERT INTO strategy_jobs(org_id,campaign_id,campaign_version,lead_id,request_id)
 VALUES(l.org_id,c,1,l.id,'calling-preview-scratch-'||c) RETURNING id INTO j;
 b:='{"version":"strategy_v2","state":"template_completed","blocking_reasons":[],"validation_errors":[],"strategy":{"step1":{"channel":"call"}},"artifacts":{"call_brief":{"opening":"fixture"}}}';
 INSERT INTO strategy_plans(org_id,job_id,campaign_id,campaign_version,lead_id,body,fingerprint,content_hash,expires_at)
 VALUES(l.org_id,j,c,1,l.id,b,'deliberately-stale',md5(b::text),now()+interval '1 day');
END $seed$;
DO $test$ DECLARE r jsonb; p record; bad jsonb; tested integer:=0; BEGIN
 ASSERT outreach_call_preview(-1,-1)->>'execution_authorized'='false';
 ASSERT outreach_call_queue_preview(-1,50)->'items'='[]'::jsonb;
 ASSERT outreach_call_reconciliation_preview(-1)->'items'='[]'::jsonb;
 FOR p IN SELECT org_id,id FROM strategy_plans ORDER BY id LIMIT 20 LOOP
  r:=outreach_call_preview(p.org_id,p.id); ASSERT r->>'execution_authorized'='false';
  ASSERT jsonb_typeof(r->'reasons')='array';
  r:=outreach_call_queue_preview(p.org_id,5);ASSERT r->>'execution_authorized'='false';
  r:=outreach_call_reconciliation_preview(p.org_id);ASSERT r->>'execution_authorized'='false';
  FOR bad IN SELECT value FROM jsonb_array_elements('[null,"text",{},[]]'::jsonb) LOOP
   UPDATE strategy_plans SET body=jsonb_set(body,'{blocking_reasons}',bad) WHERE id=p.id;
   r:=outreach_call_preview(p.org_id,p.id);ASSERT r->>'plan_eligible'='false';
  END LOOP;
  tested:=tested+1;
 END LOOP;
 ASSERT tested>0,'scratch has no plan fixtures';
 RAISE NOTICE 'Calling preview SQL validated against % stored scratch plans; all changes rollback',tested;
END $test$;
ROLLBACK;
SELECT count(*) AS persisted_new_functions FROM pg_proc WHERE proname IN ('outreach_call_preview','outreach_call_queue_preview','outreach_call_reconciliation_preview');`;
const out=docker(['exec','-i',container,'psql','-X','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',db,'-At'],sql);
if(!out.trim().endsWith('0'))throw Error('MIGRATION_PERSISTENCE_UNEXPECTED');
console.log(JSON.stringify({container,database:db,migration:'037',result:'passed',transaction:'rolled_back',live_database_changed:false}));
