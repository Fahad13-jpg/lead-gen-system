'use strict';
// Targeted operator rollout: no workflow imports/activation, paid calls or sends.
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {localPool}=require('../dashboard/start-local-auth.cjs');
const dir=path.resolve('.local/contact-refresh-'+Date.now());
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function docker(args,input,binary=false){const r=cp.spawnSync('docker',args,{input,encoding:binary?undefined:'utf8',timeout:120000,maxBuffer:100000000});if(r.status!==0)throw Error('CONTACT_ROLLOUT_COMMAND_UNCONFIRMED');return r.stdout;}
const normalize=s=>s.replace(/\r\n/g,'\n').trim();
const body=s=>s.slice(s.indexOf('CREATE OR REPLACE FUNCTION contact_sync()')).match(/AS \$\$([\s\S]*?)END \$\$;/)[1]+'END ';
const snapshot=`SELECT jsonb_build_object('workflows',(SELECT md5(jsonb_agg(jsonb_build_object('id',id,'active',active,'nodes',nodes,'connections',connections,'settings',settings) ORDER BY id)::text) FROM workflow_entity),'wallet',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY org_id,reference)::text,'')) FROM gathering_wallet_entries t),'social_cost',(SELECT md5(coalesce(jsonb_agg(jsonb_build_object('id',id,'account',account_id,'cost',actual_cost_usd,'run',run_id) ORDER BY id)::text,'')) FROM contact_social_jobs t WHERE account_id IS NOT NULL),'outreach',(SELECT count(*) FROM outreach_activities),'verification_attempts',(SELECT count(*) FROM contact_attempts WHERE kind='verification')) AS state`;
async function main(){fs.mkdirSync(dir,{recursive:true});assert.equal(cp.spawnSync('git',['check-ignore',dir+'/backup.dump'],{stdio:'ignore'}).status,0);
 const migration=fs.readFileSync('database/migrations/052_contact_negative_refresh.sql','utf8'),runtime=fs.readFileSync('scripts/lead-contacts/runtime.cjs');
 assert.equal(cp.spawnSync(process.execPath,['--check','scripts/lead-contacts/runtime.cjs'],{stdio:'ignore'}).status,0);
 const dump=docker(['exec','postgres_db','pg_dump','-U','n8n_user','-d','lead_db','-Fc'],undefined,true);fs.writeFileSync(dir+'/backup.dump',dump);
 const remote='/home/node/.n8n/contact-stage/runtime.cjs';docker(['cp','n8n:'+remote,dir+'/runtime-before.cjs']);
 docker(['cp','scripts/lead-contacts/runtime.cjs','n8n:'+remote+'.next']);
 const pool=localPool({registryWrite:true});const db=await pool.connect();let installed=false,committed=false;
 try{await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='5s'");
  assert((await db.query('SELECT pg_try_advisory_xact_lock(49302812) AS locked')).rows[0].locked,'SOCIAL_WORKER_BUSY');
  const controls=(await db.query('SELECT * FROM contact_controls WHERE id FOR UPDATE')).rows[0];assert(controls&&!controls.verification_enabled,'VERIFICATION_MUST_REMAIN_PAUSED');
  assert.equal((await db.query('SELECT enabled FROM contact_social_controls WHERE id FOR UPDATE')).rows[0]?.enabled,false,'PAID_DISCOVERY_MUST_REMAIN_PAUSED');
  assert.equal(Number((await db.query("SELECT count(*) n FROM contact_tasks WHERE status='processing'")).rows[0].n),0,'WAIT_FOR_CONTACT_LEASES');
  const old=(await db.query("SELECT prosrc,pg_get_functiondef(oid) AS definition FROM pg_proc WHERE oid='contact_sync()'::regprocedure")).rows[0];
  assert.equal(normalize(old.prosrc),normalize(body(fs.readFileSync('database/migrations/008_contact_quality_social.sql','utf8'))),'LIVE_SYNC_BASELINE_CHANGED');
  fs.writeFileSync(dir+'/function-before.sql',old.definition+';\n');
  const before=(await db.query(snapshot)).rows[0].state;fs.writeFileSync(dir+'/before.json',JSON.stringify({before,controls},null,2));
  docker(['exec','n8n','node','-e',"const fs=require('fs');const p='/home/node/.n8n/contact-stage/runtime.cjs';fs.copyFileSync(p,p+'.pre052');fs.renameSync(p+'.next',p)"]);installed=true;
  await db.query(migration.replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,''));
  assert.equal(normalize((await db.query("SELECT prosrc FROM pg_proc WHERE oid='contact_sync()'::regprocedure")).rows[0].prosrc),normalize(body(migration)));
  assert.deepEqual((await db.query(snapshot)).rows[0].state,before);
  await db.query('COMMIT');committed=true;
  const installedHash=docker(['exec','n8n','node','-e',"console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync('/home/node/.n8n/contact-stage/runtime.cjs')).digest('hex'))"]).trim();assert.equal(installedHash,hash(runtime));
  const result={deployed_at:new Date().toISOString(),migration:52,function_verified:true,runtime_verified:true,backup_sha256:hash(dump),workflow_changes:false,provider_calls:0,sends:0,paid_discovery_enabled:false,verification_enabled:false,report_directory:dir};
  fs.writeFileSync(dir+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }catch(e){if(!committed){await db.query('ROLLBACK');if(installed)docker(['cp',dir+'/runtime-before.cjs','n8n:'+remote]);}throw e;}
 finally{db.release();await pool.end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
