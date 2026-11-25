'use strict';
// Real dashboard SQL against isolated fixtures; no providers or live DB writes.
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),{dataService}=require('../dashboard/data.cjs');
const container='lead_016_1794141179811',database='scratch_contact_refresh_20261108';
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:120000,maxBuffer:10000000});if(r.status!==0)throw Error('JOB_PROGRESS_SCRATCH_FAILED: '+(r.stderr||'').slice(0,1600));return r.stdout.trim();}
async function main(){let query;await dataService({pool:{query:async q=>{query=q;return{rows:[{total:0,jobs:[]}]};}},identity:{principal:async()=>{}}}).jobs('fixture',{org_id:'940081',limit:'100'});
 assert.equal(docker(['inspect',container,'--format','{{.HostConfig.NetworkMode}}']),'none');docker(['start',container]);
 let ready=false;for(let i=0;i<50;i++){if(cp.spawnSync('docker',['exec',container,'pg_isready','-U','n8n_user'],{stdio:'ignore'}).status===0){ready=true;break;}Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,200);}assert(ready);
 assert(!query.includes('$progress$'));
 const setup=`BEGIN;DO $$
 DECLARE j integer;m integer;old_job integer;running_job integer;s integer;s2 integer;other_source integer;c integer;view jsonb;item jsonb;
 BEGIN
 ASSERT current_database()='scratch_contact_refresh_20261108';
 INSERT INTO organizations(id,org_name,status) VALUES(940081,'Progress fixture','active'),(940082,'Other fixture','active');
 INSERT INTO scraping_jobs(org_id,job_name,source,search_query,location,max_results,status,result_mode,total_leads,duplicate_count,completion_reason) VALUES(940081,'New fixture','google_maps','Clinic','Fixture',5,'completed','new',2,9,'candidate_limit_reached') RETURNING id INTO j;
 INSERT INTO scraping_jobs(org_id,job_name,source,search_query,location,max_results,status,result_mode) VALUES(940081,'Matching fixture','google_maps','Clinic','Fixture',5,'completed','matching') RETURNING id INTO m;
 INSERT INTO scraping_jobs(org_id,job_name,source,search_query,location,max_results,status) VALUES(940081,'Legacy fixture','google_maps','Clinic','Fixture',5,'completed') RETURNING id INTO old_job;
 INSERT INTO scraping_jobs(org_id,job_name,source,search_query,location,max_results,status,result_mode) VALUES(940081,'Running fixture','google_maps','Clinic','Fixture',5,'running','new') RETURNING id INTO running_job;
 INSERT INTO staging_leads(org_id,job_id,company_name,source,cleaning_status) VALUES(940081,j,'Fixture A','google_maps','cleaned') RETURNING id INTO s;
 INSERT INTO staging_leads(org_id,job_id,company_name,source,cleaning_status) VALUES(940081,j,'Fixture A duplicate','google_maps','cleaned') RETURNING id INTO s2;
 INSERT INTO staging_leads(org_id,company_name,source) VALUES(940082,'Other source','google_maps') RETURNING id INTO other_source;
 INSERT INTO cleaned_leads(org_id,staging_id,company_name) VALUES(940081,s,'Fixture A') RETURNING id INTO c;
 INSERT INTO cleaning_links(staging_id,org_id,cleaned_id) VALUES(s,940081,c),(s2,940081,c);
 INSERT INTO enrichment_profiles(org_id,lead_id,basic,basic_at) VALUES(940081,c,jsonb_build_object('status','partial','input_fingerprint',enrichment_fingerprint(940081,c,'basic')),now());
 INSERT INTO enrichment_tasks(org_id,lead_id,staging_id,kind,status) VALUES(940081,c,s,'basic','failed');
 INSERT INTO gathering_results(job_id,ordinal,org_id,lead_id,disposition,reason,snapshot) VALUES
 (j,0,940081,s,'existing','organization_already_has_business','{}'),(j,1,940081,s,'existing','organization_already_has_business','{}'),
 (j,2,940082,other_source,'reused',NULL,'{}'),(m,0,940081,s,'reused',NULL,'{}'),(m,1,940081,s2,'reused',NULL,'{}');
 EXECUTE $progress$SELECT to_jsonb(answer) FROM (${query}) answer$progress$ INTO view;
 FOR item IN SELECT value FROM jsonb_array_elements(view->'jobs') LOOP
  IF (item->>'id')::integer=j THEN
   ASSERT item->>'staged_count'='2' AND item->>'cleaned_count'='1' AND item->>'assessed_count'='1','Distinct pipeline counts inflated';
   ASSERT item->>'basic_current_count'='1' AND item->>'basic_failed_count'='1','Current evidence and failed refresh must remain separate';
   ASSERT item->>'existing_match_count'='1' AND item->>'duplicate_count'='9' AND item->>'target_shortfall'='3','New target/existing-match/tenant counts incorrect';
  ELSIF (item->>'id')::integer=m THEN ASSERT item->>'existing_match_count'='2' AND item->>'target_shortfall'='3','Matching/reused counts incorrect';
  ELSIF (item->>'id')::integer=old_job THEN ASSERT item->>'existing_match_count' IS NULL AND item->>'target_shortfall' IS NULL,'Legacy counts invented';
  ELSIF (item->>'id')::integer=running_job THEN ASSERT item->>'target_shortfall' IS NULL,'Running search has a final shortfall'; END IF;
 END LOOP;
 ASSERT jsonb_array_length(view->'jobs')=4;
 END $$;ROLLBACK;`;
 docker(['exec','-i',container,'psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',database],setup);
 console.log(JSON.stringify({passed:true,database,checks:['distinct_stage_links','current_evidence_retained_on_failure','new_target_shortfall','distinct_existing_matches','matching_reuse','cross_org_excluded','legacy_unknown','running_not_final'],live_database_changed:false,provider_calls:0}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>cp.spawnSync('docker',['stop','--time','10',container],{stdio:'ignore',timeout:30000}));
