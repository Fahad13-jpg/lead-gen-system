'use strict';
// Hardcoded isolated target. Never reads credentials or addresses production containers.
const fs=require('node:fs'),cp=require('node:child_process');
const container='lead_diag_pg_20261011',db='scratch_strategy_v2_20261012',role='v2_scratch_runtime';
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:Buffer.isBuffer(input)?undefined:'utf8',maxBuffer:10e6,timeout:120000});if(r.status!==0)throw Error('Scratch command failed: '+String(r.stderr||r.error||'').slice(0,1600));return String(r.stdout).trim();}
function sql(query,database=db){return docker(['exec','-i',container,'psql','-X','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',database,'-At'],query);}
function check(){const i=JSON.parse(docker(['inspect',container]));if(i[0].Name!=='/'+container||i[0].HostConfig.NetworkMode!=='none')throw Error('SCRATCH_ISOLATION_CHECK_FAILED');}
function setup(){
 check();docker(['start',container]);
 let ready=false;for(let i=0;i<30;i++){const r=cp.spawnSync('docker',['exec',container,'pg_isready','-U','n8n_user'],{stdio:'ignore',timeout:5000});if(r.status===0){ready=true;break;}Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1000);}if(!ready)throw Error('Scratch PostgreSQL not ready');
 // Existence is an explicit stop, never overwrite or drop a database.
 if(sql(`SELECT count(*) FROM pg_database WHERE datname='${db}'`,'postgres')!=='0')throw Error('Scratch database exists; use test or inspect rather than restoring over it');
 sql(`CREATE DATABASE ${db}`,'postgres');
 docker(['exec','-i',container,'pg_restore','-U','n8n_user','-d',db,'--no-owner','--exit-on-error'],fs.readFileSync('.local/scratch-diagnostics-20261011/lead_db-latest.dump'));
 sql(fs.readFileSync('database/migrations/016_signal_sheet.sql','utf8'));
 apply();
 console.log('Restored Oct 11 saved backup and applied 016 + 017 ONLY to '+container+'/'+db);
}
function apply(){
 check();
 sql(fs.readFileSync('database/migrations/017_strategy_v2_compatibility.sql','utf8'));
 sql(`DO $x$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT; END IF; END $x$; GRANT n8n_user TO ${role};`);
 console.log('017 applied ONLY to '+container+'/'+db);
}
const quote=s=>"'"+s.replace(/'/g,"''")+"'";
function tests(){
 check();
 const original=JSON.parse(fs.readFileSync('documentation/strategy-contract-v2/lead-167.json','utf8')).ai_plan;
 const v2=structuredClone(original);v2.blocking_reasons=[]; // Scratch-only approval fixture; real artifacts remain blocked.
 const config={name:'Scratch strategy v2',mode:'ai',channels:['email'],offer:{description:'Scratch demonstration'},cta:{text:'Review?'},expiry_days:7};
 const query=`BEGIN; SET LOCAL ROLE ${role};
 DO $test$ DECLARE campaign bigint;job bigint;lease text;fp text;res jsonb;arg jsonb;plan_id bigint;h text;b jsonb;fixture jsonb:=${quote(JSON.stringify(v2))}::jsonb;before_count integer;BEGIN
 ASSERT NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user),'runtime must not be superuser';
 UPDATE strategy_jobs SET status='failed' WHERE status IN ('pending','processing');
 UPDATE strategy_ai_requests SET reserved_at=now()-interval '1 year';
 UPDATE enrichment_ai_requests SET reserved_at=now()-interval '1 year';
 UPDATE strategy_controls SET enabled=true;
 res:=strategy_campaign_save(jsonb_build_object('org_id',1,'config',${quote(JSON.stringify(config))}::jsonb));
 campaign:=(res->>'campaign_id')::bigint;ASSERT campaign IS NOT NULL,'campaign save denied';
 res:=strategy_enqueue(jsonb_build_object('org_id',1,'campaign_id',campaign,'lead_id',167,'request_id','scratch-v2-main-20261012'));
 job:=(res->>'job_id')::bigint;ASSERT job IS NOT NULL,'enqueue failed';
 SELECT value INTO res FROM strategy_claim('scratch-v2',1) value;
 ASSERT (res->>'id')::bigint=job,'claim mismatch'; lease:=res->>'lease';fp:=res->'input'->>'fingerprint';
 arg:=jsonb_build_object('id',job,'org_id',1,'lease',lease,'fingerprint',fp,'wants_ai',true);
 UPDATE strategy_ai_controls SET enabled=false,monthly_limit=0 WHERE org_id=1;
 ASSERT strategy_ai_gate(arg)->>'allowed'='false','zero allowance bypass';
 UPDATE strategy_ai_controls SET enabled=true,monthly_limit=2 WHERE org_id=1;
 ASSERT strategy_ai_gate(arg)->>'allowed'='true','initial reservation failed';
 SELECT count(*) INTO before_count FROM strategy_ai_requests;
 ASSERT strategy_reservation_context(arg)->>'allowed'='true','reservation recheck denied';
 ASSERT strategy_reservation_context(arg)->>'allowed'='true','second read-only recheck denied';
 ASSERT (SELECT count(*) FROM strategy_ai_requests)=before_count,'recheck inserted reservation';
 ASSERT strategy_reservation_context(arg)->>'lease_until' IS NOT NULL,'expiry missing';
 ASSERT strategy_reservation_context(arg||'{"org_id":999999}'::jsonb)->>'allowed'='false','cross-org bypass';
 ASSERT strategy_reservation_context(arg||'{"fingerprint":"changed"}'::jsonb)->>'reason'='input_changed','changed fingerprint bypass';
 UPDATE strategy_jobs SET lease_until=now()-interval '1 second' WHERE id=job;
 ASSERT strategy_reservation_context(arg)->>'reason'='stale_lease','expired lease bypass';
 res:=strategy_finish(arg||jsonb_build_object('plan',fixture));ASSERT res->>'reason'='stale_lease','finish accepted expiry';
 UPDATE strategy_jobs SET lease_until=now()+interval '5 minutes' WHERE id=job;
 UPDATE strategy_controls SET enabled=false;
 ASSERT strategy_reservation_context(arg)->>'reason'='planner_disabled','disabled planner bypass';
 UPDATE strategy_controls SET enabled=true;
 res:=strategy_finish(arg||jsonb_build_object('plan',fixture,'ai_status','ai_completed','usage','{}'::jsonb));
 ASSERT res->>'saved'='true','v2 save failed';plan_id:=(res->>'plan_id')::bigint;h:=res->>'content_hash';
 ASSERT h=(SELECT md5(body::text) FROM strategy_plans WHERE id=plan_id),'authoritative hash changed';
 ASSERT strategy_finish(arg||jsonb_build_object('plan',fixture))->>'replayed'='true','finish replay failed';
 ASSERT strategy_reservation_context(arg)->>'allowed'='false','completed reservation reusable';
 res:=strategy_approval(jsonb_build_object('org_id',1,'plan_id',plan_id,'action','approve','actor','scratch','content_hash',h));
 ASSERT res->>'approved_content'='true','v2 approval failed';ASSERT res->>'execution_authorized'='false','approval authorized send';
 -- Explicit fallback acknowledgement is checked against the database hash, never the local SHA-256.
 b:=fixture||'{"state":"template_fallback","fallback_acknowledgement_required":true}'::jsonb;
 UPDATE strategy_plans SET body=b,content_hash=md5(b::text) WHERE id=plan_id RETURNING content_hash INTO h;
 res:=strategy_approval(jsonb_build_object('org_id',1,'plan_id',plan_id,'action','approve','actor','scratch','content_hash',h));
 ASSERT res->>'error'='FALLBACK_ACK_REQUIRED','fallback silently approved';
 res:=strategy_approval(jsonb_build_object('org_id',1,'plan_id',plan_id,'action','approve','actor','scratch','content_hash',h,'acknowledge_fallback',true,'acknowledge_fallback_hash','wrong'));
 ASSERT res->>'error'='FALLBACK_ACK_REQUIRED','wrong fallback hash accepted';
 res:=strategy_approval(jsonb_build_object('org_id',1,'plan_id',plan_id,'action','approve','actor','scratch','content_hash',h,'acknowledge_fallback',true,'acknowledge_fallback_hash',h));
 ASSERT res->>'approved_content'='true','explicit fallback approval failed';
 res:=strategy_approval(jsonb_build_object('org_id',1,'plan_id',plan_id,'action','approve','actor','scratch','content_hash','outdated'));
 ASSERT res->>'error'='CONTENT_CHANGED','stale approval hash accepted';
 UPDATE strategy_plans SET expires_at=now()-interval '1 second' WHERE id=plan_id;
 res:=strategy_approval(jsonb_build_object('org_id',1,'plan_id',plan_id,'action','approve','actor','scratch','content_hash',h));ASSERT res->>'error'='STALE_PLAN','expired plan accepted';
 UPDATE strategy_plans SET expires_at=now()+interval '1 day',body=body||'{"blocking_reasons":null}'::jsonb WHERE id=plan_id;
 res:=strategy_approval(jsonb_build_object('org_id',1,'plan_id',plan_id,'action','approve','actor','scratch','content_hash',h));ASSERT res->>'error'='PLAN_NEEDS_CORRECTION','malformed errors approved';
 -- Same finish path continues to accept v1. Changed input supersedes rather than saving a plan.
 res:=strategy_enqueue(jsonb_build_object('org_id',1,'campaign_id',campaign,'lead_id',167,'request_id','scratch-v1-compat-20261012'));
 SELECT value INTO res FROM strategy_claim('scratch-v1',1) value;arg:=jsonb_build_object('id',res->'id','org_id',1,'lease',res->>'lease');
 res:=strategy_finish(arg||jsonb_build_object('plan','{"version":"strategy_v1","execution_authorized":false,"messages":[],"validation_errors":[],"blocking_reasons":[]}'::jsonb));ASSERT res->>'saved'='true','v1 save regressed';
 res:=strategy_enqueue(jsonb_build_object('org_id',1,'campaign_id',campaign,'lead_id',167,'request_id','scratch-stale-20261012'));
 SELECT value INTO res FROM strategy_claim('scratch-stale',1) value;arg:=jsonb_build_object('id',res->'id','org_id',1,'lease',res->>'lease');
 UPDATE strategy_jobs SET fingerprint='changed' WHERE id=(arg->>'id')::bigint;
 res:=strategy_finish(arg||jsonb_build_object('plan',fixture));ASSERT res->>'reason'='input_changed','changed input saved';
 END $test$;
 SELECT 'PASS: non-superuser, zero allowance, one reservation, repeated recheck, tenant, fingerprint, expiry, disabled planner, v2 save/replay, database hash, approval, fallback acknowledgement, stale/malformed approval, v1 save, superseded input';
 ROLLBACK;`;
 const output=sql(query);fs.writeFileSync('documentation/strategy-contract-v2/scratch-017-results.txt',`Container: ${container}\nDatabase: ${db}\nRole: ${role} (non-superuser, inherits existing owner privileges)\nBackup: 2026-10-11 saved dump; not a fresh production snapshot\n${output}\nFixture writes rolled back. No model calls.\n`);console.log(output);
}
if(require.main===module){try{if(process.argv[2]==='setup')setup();else if(process.argv[2]==='apply')apply();else if(process.argv[2]==='status'){check();console.log(sql("SELECT current_database(),to_regprocedure('strategy_reservation_context(jsonb)') IS NOT NULL,to_regprocedure('enrichment_source_checks(integer,integer)') IS NOT NULL"));}else if(process.argv[2]==='test')tests();else throw Error('Use setup, apply, status or test');}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={sql,check,db,container};
