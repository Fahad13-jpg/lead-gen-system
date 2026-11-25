'use strict';
const fs=require('fs'),assert=require('assert/strict'),{sql,json}=require('./scratch-database.cjs'),{basic}=require('../lead-enrichment/worker.cjs'),{stamp}=require('../lead-enrichment/source-checks.cjs'),rt=require('../lead-strategy/runtime.cjs');
const q=s=>"'"+s.replace(/'/g,"''")+"'",j=v=>q(JSON.stringify(v))+'::jsonb';
(async()=>{
 const rows=require('../../.local/scratch-diagnostics-20261011/source-rows.json');
 const parity=json(`SELECT s.id,s.source,enrichment_stamp_source(s.source,s.raw_data,s.website) stamp FROM staging_leads s WHERE s.source IN ('google_maps','yellow_pages','yelp') ORDER BY s.id`);
 for(const r of parity){const local=stamp(rows.find(x=>x.staging_id===r.id));assert.deepEqual(r.stamp,local,'SQL/JS stamp parity staging '+r.id);}
 const fixture=require('../../tests/lead-enrichment/fixtures/benchmark-signals.json').find(x=>x.lead.id===167),source=rows.find(r=>r.lead_id===167);
 const observed=await basic({lead:fixture.lead,source_checks:[stamp(source)]},async url=>{const p=fixture.snapshots.find(p=>p.request_url===url);if(!p)throw Error('Fixture unavailable');return p.response});
 const failed=await basic({lead:fixture.lead},async()=>{throw Object.assign(Error('fixture timeout'),{code:'ETIMEDOUT'})});
 const social=await basic({lead:{company_name:'Example',website:'https://facebook.com/example'}},async()=>{throw Error('No network');});
 let absenceChecks='';for(const id of [445,446,447]){const row=rows.find(r=>r.lead_id===id);const result=await basic({lead:{company_name:row.company_name,website:row.website},source_checks:[stamp(row)]},async()=>{throw Error('No network allowed')});absenceChecks+=`UPDATE enrichment_profiles SET basic=${j(result)}||jsonb_build_object('input_fingerprint',enrichment_fingerprint(1,${id},'basic')),basic_at=now() WHERE org_id=1 AND lead_id=${id}; ASSERT lead_trust_report(1,${id})->>'website_presence'='none_found','scoped source absence ${id} failed';\n`;}
 const old=fs.readFileSync('database/migrations/009_evidence_enrichment.sql','utf8').match(/CREATE OR REPLACE FUNCTION enrichment_fingerprint[\s\S]*?\$\$;/)[0];
 const next=fs.readFileSync('database/migrations/016_signal_sheet.sql','utf8').match(/CREATE OR REPLACE FUNCTION enrichment_fingerprint[\s\S]*?\$\$;/)[0];
 const config=rt.campaign({org_id:1,config:{name:'Scratch migration check',mode:'template',channels:['email'],timezone:'UTC',sender:{name:'Scratch',company:'Scratch'},offer:{name:'Scratch offer',description:'Scratch-only product',approved_points:[]},cta:{text:'Scratch only'},offer_profile:'website_presence'}}).config;
 const checks=`BEGIN;
 DO $check$
 DECLARE c jsonb;campaign bigint;old_context jsonb;new_context jsonb;job bigint;plan bigint;decision jsonb;t enrichment_tasks%ROWTYPE;r jsonb;before_flags jsonb; good_before jsonb; research_before jsonb; time_before timestamptz; research_time_before timestamptz;
 BEGIN
 ASSERT (SELECT provolatile='s' FROM pg_proc WHERE oid='enrichment_stamp_source(text,jsonb,text)'::regprocedure),'stamp must be STABLE';
 ASSERT enrichment_source_checks(999999,167)='[]'::jsonb,'org isolation failed';
 ASSERT has_function_privilege(current_user,'enrichment_stamp_source(text,jsonb,text)','EXECUTE'),'owner execute denied';
 ASSERT NOT EXISTS(SELECT 1 FROM pg_proc p,LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.proname='enrichment_stamp_source' AND a.grantee=0 AND a.privilege_type='EXECUTE'),'PUBLIC execute exposed';
 EXECUTE ${q(old)};
 c:=strategy_campaign_save(${j({org_id:1,config})});campaign:=(c->>'campaign_id')::bigint;ASSERT campaign IS NOT NULL,'campaign fixture failed';
 old_context:=strategy_context(1,campaign,167);ASSERT old_context IS NOT NULL,'old context missing';
 INSERT INTO strategy_jobs(org_id,campaign_id,campaign_version,lead_id,request_id,fingerprint,status) VALUES(1,campaign,1,167,'scratch-migration-hash-check',old_context->>'fingerprint','complete') RETURNING id INTO job;
 INSERT INTO strategy_plans(org_id,job_id,campaign_id,campaign_version,lead_id,body,fingerprint,content_hash,expires_at) VALUES(1,job,campaign,1,167,'{"validation_errors":[],"blocking_reasons":[]}',old_context->>'fingerprint',md5('scratch'),now()+interval '1 day') RETURNING id INTO plan;
 EXECUTE ${q(next)};
 new_context:=strategy_context(1,campaign,167);ASSERT new_context->>'fingerprint' IS DISTINCT FROM old_context->>'fingerprint','source fingerprint did not invalidate plan context';
 decision:=strategy_approval(jsonb_build_object('org_id',1,'plan_id',plan,'action','approve','actor','scratch_test','content_hash',md5('scratch')));
 ASSERT decision->>'error'='STALE_PLAN','stale plan approval not rejected';
 before_flags:=lead_trust_report(1,167)->'conflicts';
 UPDATE enrichment_profiles SET basic=${j(observed)}||jsonb_build_object('input_fingerprint',enrichment_fingerprint(1,167,'basic')),basic_at=now() WHERE org_id=1 AND lead_id=167;
 r:=lead_trust_report(1,167);ASSERT r->>'website_presence'='present','website presence failed';ASSERT r->'warnings' @> '["template_site_suspected"]','template warning absent';ASSERT r->'conflicts'=before_flags,'warning became conflict';
 ASSERT (strategy_context(1,campaign,167))->'report'->'basic'->'signals' IS NOT NULL,'signals dropped by strategy_context';
 ${absenceChecks}
 UPDATE enrichment_profiles SET basic=${j(social)}||jsonb_build_object('input_fingerprint',enrichment_fingerprint(1,445,'basic')),basic_at=now() WHERE org_id=1 AND lead_id=445;
 ASSERT lead_trust_report(1,445)->>'website_presence'='social_only','canonical social-only presence failed';
 UPDATE enrichment_profiles SET basic_at=now()-interval '31 days' WHERE org_id=1 AND lead_id=445;
 ASSERT lead_trust_report(1,445)->>'website_presence'='unknown','stale social evidence promoted';
 UPDATE enrichment_profiles SET research='{"fixture":"good_research"}',research_at=now()-interval '1 day',basic_at=now()-interval '2 days' WHERE org_id=1 AND lead_id=167;
 SELECT basic,research,basic_at,research_at INTO good_before,research_before,time_before,research_time_before FROM enrichment_profiles WHERE org_id=1 AND lead_id=167;
 SELECT * INTO t FROM enrichment_tasks WHERE org_id=1 AND lead_id=167 AND kind='basic';ASSERT t.id IS NOT NULL,'task fixture missing';
 UPDATE enrichment_tasks SET status='processing',attempts=1,lease=repeat('a',32),lease_until=now()+interval '5 minutes',fingerprint=enrichment_fingerprint(1,167,'basic') WHERE id=t.id;
 INSERT INTO enrichment_attempts(lease,task_id) VALUES(repeat('a',32),t.id);
 r:=enrichment_finish(jsonb_build_object('id',t.id,'lease',repeat('a',32),'status','failed','result',${j(failed)}));
 ASSERT r->>'status'='failed','failed result mislabeled';
 ASSERT EXISTS(SELECT 1 FROM enrichment_profiles WHERE org_id=1 AND lead_id=167 AND basic=good_before AND research=research_before AND basic_at=time_before AND research_at=research_time_before),'failed refresh overwrote good evidence or refreshed timestamps';
 ASSERT EXISTS(SELECT 1 FROM enrichment_tasks WHERE id=t.id AND status='pending' AND attempts=1),'retry structure changed';
 ASSERT lead_trust_report(1,167)->>'website_presence'='present','last good current evidence lost';
 ASSERT EXISTS(SELECT 1 FROM enrichment_attempts WHERE lease=repeat('a',32) AND result->'result'->'pages'->0->>'error_class'='ETIMEDOUT'),'attempt failure diagnostics lost';
 UPDATE enrichment_tasks SET status='processing',attempts=2,lease=repeat('c',32),lease_until=now()+interval '5 minutes' WHERE id=t.id;
 INSERT INTO enrichment_attempts(lease,task_id) VALUES(repeat('c',32),t.id);
 r:=enrichment_finish(jsonb_build_object('id',t.id,'lease',repeat('c',32),'status','partial','result',${j({...failed,status:'partial',reason:'http_error'})}));
 ASSERT r->>'status'='failed','all-unusable partial refresh accepted';
 ASSERT EXISTS(SELECT 1 FROM enrichment_profiles WHERE org_id=1 AND lead_id=167 AND basic=good_before AND research=research_before AND basic_at=time_before AND research_at=research_time_before),'partial failure overwrote good evidence';
 UPDATE enrichment_profiles SET basic_at=now()-interval '31 days' WHERE org_id=1 AND lead_id=167;
 ASSERT lead_trust_report(1,167)->>'website_presence'='unknown','old good evidence falsely fresh';
 UPDATE enrichment_profiles SET basic=NULL,basic_at=NULL WHERE org_id=1 AND lead_id=167;
 ASSERT lead_trust_report(1,167)->>'assessment_status'='assessed','failed first attempt mislabeled not assessed';
 ASSERT EXISTS(SELECT 1 FROM enrichment_attempts WHERE lease=repeat('a',32) AND result IS NOT NULL),'attempt history missing';
 r:=enrichment_finish(jsonb_build_object('id',t.id,'lease',repeat('b',32),'status','complete','result',${j(observed)}));ASSERT r->>'reason'='stale_lease','invalid lease accepted';
 END $check$;
 SELECT 'PASS: source isolation, permissions, stale-plan rejection, lead 167 warning/presence, signal forwarding, failed/all-unusable refresh retention, social-only projection, assessment status, STABLE volatility, retry state and stale lease';
 ROLLBACK;`;
 const result=sql(checks);fs.writeFileSync('documentation/hardening-review-20261012/sql-check-results.txt','SQL/JS source-stamp parity: '+parity.length+' stored records PASS\n'+result+'\nAll fixtures rolled back. No live database writes.\n');console.log(result);console.log('SQL/JS source-stamp parity',parity.length,'PASS');
})().catch(e=>{console.error(e.message);process.exitCode=1});
