'use strict';
// Installs a tested failure-label correction; no job claims, resets or activation.
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {localPool}=require('../dashboard/start-local-auth.cjs');
const dir=path.resolve('.local/enrichment-diagnostics-'+Date.now()),remote='/home/node/.n8n/enrichment-stage/';
const files=['worker.cjs','observations.cjs'];const normalize=s=>s.replace(/\r\n/g,'\n').trim();
const body=s=>s.slice(s.indexOf('CREATE OR REPLACE FUNCTION enrichment_finish(')).match(/AS \$\$([\s\S]*?)END \$\$;/)[1]+'END ';
function docker(args,input,binary=false){const r=cp.spawnSync('docker',args,{input,encoding:binary?undefined:'utf8',timeout:120000,maxBuffer:100000000});if(r.status!==0)throw Error('ENRICHMENT_INSTALL_UNCONFIRMED');return r.stdout;}
const snapshot=`SELECT jsonb_build_object('workflows',(SELECT md5(jsonb_agg(jsonb_build_object('id',id,'active',active,'nodes',nodes,'connections',connections,'settings',settings) ORDER BY id)::text) FROM workflow_entity),'activities',(SELECT count(*) FROM outreach_activities),'ai_requests',(SELECT count(*) FROM enrichment_ai_requests),'strategy_requests',(SELECT count(*) FROM strategy_ai_requests),'ai_controls',(SELECT jsonb_agg(to_jsonb(t)) FROM enrichment_ai_controls t),'linkedin_controls',(SELECT jsonb_agg(to_jsonb(t)) FROM enrichment_linkedin_controls t),'strategy_controls',(SELECT jsonb_agg(to_jsonb(t) ORDER BY org_id) FROM strategy_ai_controls t)) AS value`;
async function main(){fs.mkdirSync(dir,{recursive:true});assert.equal(cp.spawnSync('git',['check-ignore',dir+'/backup.dump'],{stdio:'ignore'}).status,0);
 const dump=docker(['exec','postgres_db','pg_dump','-U','n8n_user','-d','lead_db','-Fc'],undefined,true);fs.writeFileSync(dir+'/backup.dump',dump);
 for(const name of files){assert.equal(cp.spawnSync(process.execPath,['--check','scripts/lead-enrichment/'+name],{stdio:'ignore'}).status,0);docker(['cp','n8n:'+remote+name,dir+'/'+name]);docker(['cp','scripts/lead-enrichment/'+name,'n8n:'+remote+name+'.next']);}
 const pool=localPool({registryWrite:true}),db=await pool.connect();let installed=false,committed=false;
 try{await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='5s'");await db.query('SELECT id FROM enrichment_controls WHERE id FOR UPDATE');
  assert.equal(Number((await db.query("SELECT count(*) n FROM enrichment_tasks WHERE status='processing'")).rows[0].n),0,'WAIT_FOR_ENRICHMENT_LEASES');
  assert.equal((await db.query('SELECT enabled FROM enrichment_ai_controls WHERE id')).rows[0]?.enabled,false,'AI_MUST_STAY_PAUSED');
  assert.equal((await db.query('SELECT enabled FROM enrichment_linkedin_controls WHERE id')).rows[0]?.enabled,false,'LINKEDIN_MUST_STAY_PAUSED');
  const old=(await db.query("SELECT prosrc,pg_get_functiondef(oid) definition FROM pg_proc WHERE oid='enrichment_finish(jsonb)'::regprocedure")).rows[0];
  assert.equal(normalize(old.prosrc),normalize(body(fs.readFileSync('database/migrations/016_signal_sheet.sql','utf8'))),'LIVE_BASELINE_CHANGED');
  fs.writeFileSync(dir+'/function-before.sql',old.definition+';\n');const before=(await db.query(snapshot)).rows[0].value;fs.writeFileSync(dir+'/before.json',JSON.stringify(before,null,2));
  installed=true;docker(['exec','n8n','node','-e',"const fs=require('fs');for(const name of ['worker.cjs','observations.cjs']){const p='/home/node/.n8n/enrichment-stage/'+name;fs.renameSync(p+'.next',p);}"]);
  const migration=fs.readFileSync('database/migrations/053_enrichment_failure_diagnostics.sql','utf8');await db.query(migration.replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,''));
  assert.equal(normalize((await db.query("SELECT prosrc FROM pg_proc WHERE oid='enrichment_finish(jsonb)'::regprocedure")).rows[0].prosrc),normalize(body(migration)));
  assert.deepEqual((await db.query(snapshot)).rows[0].value,before);await db.query('COMMIT');committed=true;
  const hashes=JSON.parse(docker(['exec','n8n','node','-e',"const fs=require('fs'),c=require('crypto');console.log(JSON.stringify(Object.fromEntries(['worker.cjs','observations.cjs'].map(n=>[n,c.createHash('sha256').update(fs.readFileSync('/home/node/.n8n/enrichment-stage/'+n)).digest('hex')]))))"]));
  for(const name of files)assert.equal(hashes[name],crypto.createHash('sha256').update(fs.readFileSync('scripts/lead-enrichment/'+name)).digest('hex'));
  const result={deployed_at:new Date().toISOString(),migration:53,helpers_verified:true,function_verified:true,workflow_changes:false,job_claims:0,job_resets:0,provider_calls:0,ai_and_paid_controls_unchanged:true,report_directory:dir};fs.writeFileSync(dir+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }catch(e){if(!committed){await db.query('ROLLBACK');if(installed)for(const name of files)docker(['cp',dir+'/'+name,'n8n:'+remote+name]);}throw e;}finally{db.release();await pool.end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
