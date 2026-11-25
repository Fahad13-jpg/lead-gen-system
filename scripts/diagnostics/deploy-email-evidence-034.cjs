'use strict';
// Narrow local SQL correction. No rows, workflow activation, or provider calls.
const fs=require('fs'),cp=require('child_process'),assert=require('assert/strict');
const dir='.local/email-evidence-034';
function docker(args,input,binary=false){const r=cp.spawnSync('docker',args,{input,encoding:binary?undefined:'utf8',timeout:120000,maxBuffer:100e6});assert.equal(r.status,0,'Docker operation failed; output suppressed');return binary?r.stdout:r.stdout.trim();}
const sql=q=>docker(['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],q);
const json=q=>JSON.parse(sql(q));
const body=s=>s.match(/AS \$\$([\s\S]*?)\$\$;/)[1].trim();
function snapshot(){return json("SELECT json_build_object('contacts',(SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM lead_contacts t),'leads',(SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM cleaned_leads t),'plans',(SELECT count(*) FROM strategy_plans),'activities',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) FROM outreach_activities t),'workflows',(SELECT md5(jsonb_agg(jsonb_build_object('id',id,'active',active,'nodes',nodes,'connections',connections) ORDER BY id)::text) FROM workflow_entity));");}
function verify(){
 assert.equal(sql("SELECT prosrc FROM pg_proc WHERE oid='outreach_email_eligibility(jsonb)'::regprocedure").trim(),body(fs.readFileSync(dir+'/034.sql','utf8')));
 assert.deepEqual(snapshot(),JSON.parse(fs.readFileSync(dir+'/before.json')));
 assert.equal(sql("SELECT has_function_privilege('n8n_user','outreach_email_eligibility(jsonb)','EXECUTE')"),'t');
 const counts=json("SELECT json_agg(t) FROM (SELECT x->>'allowed' AS allowed,x->>'classification' AS classification,x->>'reason' AS reason,count(*) FROM cleaned_leads l CROSS JOIN LATERAL (SELECT outreach_email_eligibility(strategy_context(1,1,l.id)) AS x) r WHERE l.org_id=1 GROUP BY 1,2,3) t");
 const result={checked_at:new Date().toISOString(),migration:34,sql_verified:true,data_preserved:true,counts,emails_sent:0,activation:false};
 fs.writeFileSync('documentation/strategy-contract-v2/email-evidence-034-deployment.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
try{
 if(process.argv[2]==='verify')verify();
 else{
  assert.equal(process.argv[2],'apply');assert(!fs.existsSync(dir),'Existing deployment; inspect then verify');
  assert.equal(sql("SELECT prosrc FROM pg_proc WHERE oid='outreach_email_eligibility(jsonb)'::regprocedure").trim(),body(fs.readFileSync('database/migrations/033_optional_email_verification.sql','utf8')));
  assert.equal(sql('SELECT enabled FROM strategy_controls WHERE id'),'f');
  assert.equal(sql("SELECT count(*) FROM strategy_jobs WHERE status IN ('pending','processing')"),'0');
  fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/before.json',JSON.stringify(snapshot()));
  fs.writeFileSync(dir+'/rollback.sql',sql("SELECT pg_get_functiondef('outreach_email_eligibility(jsonb)'::regprocedure)"));
  const dump=docker(['exec','postgres_db','pg_dump','-U','n8n_user','-d','lead_db','-Fc'],undefined,true);assert(dump.length>1000);fs.writeFileSync(dir+'/before.dump',dump);assert(docker(['exec','-i','postgres_db','pg_restore','--list'],dump).includes('TABLE DATA public lead_contacts'));
  fs.copyFileSync('database/migrations/034_email_evidence_compatibility.sql',dir+'/034.sql');sql(fs.readFileSync(dir+'/034.sql','utf8'));verify();
 }
}catch(e){console.error(e.message);process.exitCode=1;}
