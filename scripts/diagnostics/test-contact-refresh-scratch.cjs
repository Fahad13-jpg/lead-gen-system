'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const container='lead_016_1794141179811',db='scratch_contact_refresh_20261108';
function run(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:120000,maxBuffer:10000000});if(r.status!==0)throw Error('SCRATCH_COMMAND_FAILED: '+(r.stderr||'').slice(0,500));return r.stdout.trim();}
const sql=q=>run(['exec','-i',container,'psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',db],q);
try{
 assert.equal(run(['inspect',container,'--format','{{.HostConfig.NetworkMode}}']),'none');
 run(['start',container]);
 let ready=false;for(let i=0;i<50;i++){if(cp.spawnSync('docker',['exec',container,'pg_isready','-U','n8n_user'],{stdio:'ignore'}).status===0){ready=true;break;}Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,200);}assert(ready);
 run(['exec',container,'createdb','-U','n8n_user',db]);
 const dump=fs.readFileSync('.local/rollout-016-1794141789968/before-016.dump');
 run(['exec','-i',container,'pg_restore','-U','n8n_user','-d',db,'--no-owner','--no-privileges','--exit-on-error'],dump);
 sql(fs.readFileSync('database/migrations/052_contact_negative_refresh.sql','utf8'));
 sql(`BEGIN;
 DO $$ DECLARE tid bigint; BEGIN
 SELECT id INTO tid FROM contact_tasks WHERE org_id=1 AND lead_id=449 AND kind='discovery'; ASSERT tid IS NOT NULL;
 -- Isolate scheduling fixtures; all changes are rolled back in scratch.
 UPDATE contact_tasks SET status='blocked' WHERE kind='discovery' AND id<>tid;
 UPDATE contact_tasks SET status='not_found',completed_at=now()-interval '10 days',input_fingerprint=contact_input_fingerprint(org_id,lead_id,staging_id) WHERE id=tid;
 UPDATE contact_attempts SET reserved_at=now()-interval '10 days' WHERE task_id=tid;
 UPDATE contact_discovery_cache SET expires_at=now()-interval '1 day' WHERE org_id=1;
 PERFORM contact_sync(); ASSERT (SELECT status='pending' FROM contact_tasks WHERE id=tid),'old negative not refreshed';
 ASSERT (SELECT count(*) FROM contact_attempts WHERE task_id=tid)>0,'history lost';
 UPDATE contact_tasks SET status='not_found',completed_at=now()-interval '1 day' WHERE id=tid;
 PERFORM contact_sync(); ASSERT (SELECT status='not_found' FROM contact_tasks WHERE id=tid),'too frequent refresh';
 UPDATE contact_tasks SET status='blocked',completed_at=now()-interval '10 days' WHERE id=tid;
 PERFORM contact_sync(); ASSERT (SELECT status='blocked' FROM contact_tasks WHERE id=tid),'blocked task revived';
 UPDATE contact_tasks SET status='not_found' WHERE id=tid;
 UPDATE contact_discovery_cache SET expires_at=now()+interval '1 day' WHERE org_id=1;
 PERFORM contact_sync(); ASSERT (SELECT status='not_found' FROM contact_tasks WHERE id=tid),'fresh cache ignored';
 UPDATE contact_discovery_cache SET expires_at=now()-interval '1 day' WHERE org_id=1;
 UPDATE contact_attempts SET reserved_at=now() WHERE task_id=tid;
 PERFORM contact_sync(); ASSERT (SELECT status='not_found' FROM contact_tasks WHERE id=tid),'recent attempt ignored';
 UPDATE contact_tasks SET status='processing',lease='fixture' WHERE id=tid;
 PERFORM contact_sync(); ASSERT (SELECT status='processing' AND lease='fixture' FROM contact_tasks WHERE id=tid),'active lease disturbed';
 END $$; ROLLBACK;`);
 console.log(JSON.stringify({passed:true,scratch_database:db,checks:['expired_negative_refresh','attempt_history_retained','weekly_bound','blocked_preserved','fresh_cache_preserved','recent_attempt_preserved','active_lease_preserved'],live_database_changed:false,provider_calls:0}));
}finally{cp.spawnSync('docker',['stop','--time','10',container],{stdio:'ignore',timeout:30000});}
