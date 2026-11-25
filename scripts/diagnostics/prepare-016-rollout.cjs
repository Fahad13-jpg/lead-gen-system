'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),{localPool}=require('../dashboard/start-local-auth.cjs');
async function main(){const pool=localPool();try{
 const workflows=(await pool.query(`SELECT id,name,active FROM workflow_entity ORDER BY name`)).rows;
 const controls={};for(const name of ['enrichment_controls','enrichment_ai_controls','enrichment_linkedin_controls'])controls[name]=(await pool.query("SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) AS value FROM "+name+' t')).rows[0].value;
 const inflight=(await pool.query(`SELECT jsonb_build_object('executions',(SELECT count(*) FROM execution_entity WHERE status IN ('new','running','waiting')),'enrichment_tasks',(SELECT count(*) FROM enrichment_tasks WHERE status='processing'),'linkedin_jobs',(SELECT count(*) FROM enrichment_linkedin_jobs WHERE status IN ('starting','running','needs_review'))) AS value`)).rows[0].value;
 const profiles=(await pool.query(`SELECT p.org_id,p.lead_id,c.website IS NOT NULL AS has_website,EXISTS(SELECT 1 FROM cleaning_links l WHERE l.org_id=p.org_id AND l.cleaned_id=p.lead_id AND contact_eligible(l.org_id,l.cleaned_id,l.staging_id)) AS eligible FROM enrichment_profiles p JOIN cleaned_leads c ON c.org_id=p.org_id AND c.id=p.lead_id ORDER BY p.org_id,p.lead_id`)).rows;
 const definitions=(await pool.query(`SELECT p.oid::regprocedure::text AS signature,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('enrichment_fingerprint','enrichment_task_input','enrichment_finish','lead_trust_report')`)).rows;
 const dir='.local/rollout-016-'+Date.now();fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/before-functions.sql',definitions.map(f=>f.definition+';').join('\n'));fs.writeFileSync(dir+'/before-state.json',JSON.stringify({workflows,controls,profiles,inflight},null,2));
 const migration=fs.readFileSync('database/migrations/016_signal_sheet.sql');fs.writeFileSync(dir+'/migration.sql',migration);
 const manifest={prepared_at:new Date().toISOString(),migration_sha256:crypto.createHash('sha256').update(migration).digest('hex'),profile_count:profiles.length,eligible_profiles:profiles.filter(p=>p.eligible).length,canary_leads:[167,445,446,447,449],migration_applied:false};fs.writeFileSync(dir+'/manifest.json',JSON.stringify(manifest,null,2));
 console.log(JSON.stringify({bundle:dir,active_workflows:workflows.filter(w=>w.active).map(w=>({id:w.id,name:w.name})),controls,inflight,profile_count:profiles.length,eligible_profiles:manifest.eligible_profiles,read_only:true}));
}finally{await pool.end();}}
main().catch(()=>{console.error('ROLLOUT_016_PREPARATION_UNCONFIRMED');process.exitCode=1;});
