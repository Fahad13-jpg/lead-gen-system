'use strict';
const fs=require('fs'),{run,owner,reader}=require('./h-role-test.cjs'),{dir}=require('./h-permissions.cjs'),{basic}=require('../lead-enrichment/worker.cjs'),rt=require('../lead-strategy/runtime.cjs');
const q=s=>"'"+s.replace(/'/g,"''")+"'",j=x=>q(JSON.stringify(x))+'::jsonb';
async function main(){const fixture=require('../../tests/lead-enrichment/fixtures/benchmark-signals.json').find(x=>x.lead.id===167);const good=await basic({lead:fixture.lead},async url=>{const r=fixture.snapshots.find(x=>x.request_url===url);if(!r)throw Error('No capture');return r.response});
 const raw=require('../../.local/scratch-diagnostics-20261011/source-rows.json').find(x=>x.lead_id===445).raw_data;
 const config=rt.campaign({org_id:1,config:{name:'Scratch H permissions',mode:'template',channels:['email'],timezone:'UTC',sender:{name:'Scratch',company:'Scratch'},offer:{name:'Scratch',description:'Scratch only',approved_points:[]},cta:{text:'Scratch'}}}).config;
 const paths=[['pages'],['evidence'],['services'],['quality_flags'],['signals','social','facebook'],['signals','social','instagram'],['signals','web_presence','checks'],['signals'],['signals','social'],['signals','web_presence']];
 let fuzz='',cases=0;
 for(const path of paths)for(const value of [null,'bad',{},undefined]){const expr=value===undefined?`g #- ${q('{'+path.join(',')+'}')}`:`jsonb_set(g,${q('{'+path.join(',')+'}')},${j(value)})`;cases++;fuzz+=`
 b:=${expr}; UPDATE enrichment_profiles SET basic=b,basic_at=now() WHERE org_id=1 AND lead_id=167;
 r:=lead_trust_report(1,167); ASSERT r->>'website_presence'='unknown',${q('trust malformed '+path+' '+String(value))};
 UPDATE enrichment_profiles SET basic=g WHERE org_id=1 AND lead_id=167;
 UPDATE enrichment_tasks SET status='processing',attempts=1,lease=md5(${q('h-fuzz-'+cases)}),lease_until=now()+interval '5 minutes',fingerprint=enrichment_fingerprint(1,167,'basic') WHERE id=t;
 INSERT INTO enrichment_attempts(lease,task_id) VALUES(md5(${q('h-fuzz-'+cases)}),t);
 r:=enrichment_finish(jsonb_build_object('id',t,'lease',md5(${q('h-fuzz-'+cases)}),'status','complete','result',b));
 ASSERT r->>'status'='failed',${q('finish malformed '+path+' '+String(value))};
 ASSERT (SELECT basic=g FROM enrichment_profiles WHERE org_id=1 AND lead_id=167),'malformed refresh overwrote good basic';
 `;}
 for(const value of [null,'bad',{},undefined]){const b={...raw};if(value===undefined)delete b.openingHours;else b.openingHours=value;fuzz+=`r:=enrichment_stamp_source('google_maps',${j(b)},NULL); ASSERT r->>'website_result'='unknown','malformed openingHours';\n`;cases++;}
 for(const value of [null,'bad',{},[],{id:'99999999999999999999999999999999999999'},{id:{}}]){fuzz+=`r:=enrichment_finish(${j(value)});ASSERT r->>'status'='failed','invalid envelope must fail';\n r:=enrichment_stamp_source('google_maps',${j(value)},NULL);ASSERT r->>'website_result'='unknown','invalid raw must be unknown';\n`;cases++;}
 const outputs=[];
 for(const role of [owner,reader]){const sql=`BEGIN; SET LOCAL ROLE ${role};
 DO $test$ DECLARE g jsonb:= ${j(good)};b jsonb;r jsonb;t bigint; campaign bigint;old_research jsonb;old_basic_at timestamptz;old_research_at timestamptz;old_freshness jsonb;BEGIN
 ASSERT NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user),'test role is superuser';
 ASSERT enrichment_fingerprint(1,167,'basic') IS NOT NULL; ASSERT jsonb_typeof(enrichment_source_checks(1,167))='array';
 SELECT id INTO t FROM enrichment_tasks WHERE org_id=1 AND lead_id=167 AND kind='basic';
 UPDATE enrichment_tasks SET status='processing',attempts=1,lease=repeat('d',32),lease_until=now()+interval '5 minutes',fingerprint=enrichment_fingerprint(1,167,'basic') WHERE id=t;
 INSERT INTO enrichment_attempts(lease,task_id) VALUES(repeat('d',32),t);
 ASSERT enrichment_task_input(t,repeat('d',32)) IS NOT NULL,'task input denied';
 r:=enrichment_finish(jsonb_build_object('id',t,'lease',repeat('d',32),'status','complete','result',g));ASSERT r->>'saved'='true','valid finish failed';
 SELECT basic INTO g FROM enrichment_profiles WHERE org_id=1 AND lead_id=167;
 ASSERT lead_trust_report(1,167)->>'website_presence'='present','valid trust missing';
 ASSERT enrichment_report(1,167) IS NOT NULL,'report missing';
 r:=strategy_campaign_save(${j({org_id:1,config})});campaign:=(r->>'campaign_id')::bigint;ASSERT strategy_context(1,campaign,167) IS NOT NULL,'strategy context missing';
 ASSERT lead_trust_report(1,167)->'warnings' ? 'template_site_suspected','template fixture must have warning';
 ASSERT NOT (lead_trust_report(1,167)->'conflicts' ? 'template_site_suspected'),'template warning is not a conflict';
 UPDATE enrichment_profiles SET research=jsonb_build_object('version','enrichment_v1','linkedin',jsonb_build_object('profiles','[]'::jsonb),'input_fingerprint',enrichment_fingerprint(1,167,'research'),'test_marker','preserve_failed_refresh'),research_at=now() WHERE org_id=1 AND lead_id=167;
 SELECT research,basic_at,research_at INTO old_research,old_basic_at,old_research_at FROM enrichment_profiles WHERE org_id=1 AND lead_id=167;
 old_freshness:=lead_trust_report(1,167)->'freshness';
 UPDATE enrichment_tasks SET status='processing',attempts=1,lease=md5('preservation-'||current_user),lease_until=now()+interval '5 minutes',fingerprint=enrichment_fingerprint(1,167,'basic') WHERE id=t;
 INSERT INTO enrichment_attempts(lease,task_id) VALUES(md5('preservation-'||current_user),t);
 b:=g||jsonb_build_object('status','failed','reason','temporary_source_failure','retryable',true,'pages',jsonb_build_array(jsonb_build_object('url','https://fixture.invalid/','usable_html',false,'status',NULL,'error_class','ETIMEDOUT')));
 r:=enrichment_finish(jsonb_build_object('id',t,'lease',md5('preservation-'||current_user),'status','failed','result',b));ASSERT r->>'status'='failed','failed refresh accepted';
 ASSERT (SELECT basic=g AND research=old_research AND basic_at=old_basic_at AND research_at=old_research_at FROM enrichment_profiles WHERE org_id=1 AND lead_id=167),'failed refresh lost evidence/research/timestamps';
 ASSERT lead_trust_report(1,167)->'freshness'=old_freshness,'failed refresh changed freshness';
 ASSERT (SELECT result->'result'->'pages'->0->>'error_class'='ETIMEDOUT' FROM enrichment_attempts WHERE lease=md5('preservation-'||current_user)),'failure diagnostics not retained';
 ${fuzz}
 END $test$;SELECT 'PASS role ${role}: full function chain and ${cases} malformed cases';ROLLBACK;`;
 outputs.push(run(sql));}
 fs.writeFileSync(dir+'/sql-fuzz-role-results.txt',outputs.join('\n')+'\nAll fixtures rolled back.\n');console.log(outputs.join('\n'));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
