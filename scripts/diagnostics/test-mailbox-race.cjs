'use strict';
const cp=require('child_process'),fs=require('fs'),assert=require('assert/strict');
const container='lead_diag_pg_20261011',db='scratch_mailbox_race_20261018';
const args=d=>['exec','-i',container,'psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',d];
function docker(a,input){const r=cp.spawnSync('docker',a,{input,encoding:'utf8',timeout:60000,maxBuffer:2e6});if(r.status!==0)throw Error(String(r.stderr||r.error).slice(0,1400));return r.stdout.trim();}
const sql=q=>docker(args(db),q);
function race(q){return new Promise((resolve,reject)=>{const c=cp.spawn('docker',args(db));let out='',err='';c.stdout.on('data',d=>out+=d);c.stderr.on('data',d=>err+=d);c.on('error',reject);c.on('exit',code=>code?reject(Error(err.slice(0,1200))):resolve(out));c.stdin.end(q);});}
async function main(){
 assert.equal(JSON.parse(docker(['inspect',container]))[0].HostConfig.NetworkMode,'none');
 assert.equal(docker(args('postgres'),`SELECT count(*) FROM pg_database WHERE datname='${db}'`),'0','Scratch race database already exists; do not overwrite');
 docker(args('postgres'),`CREATE DATABASE ${db} TEMPLATE scratch_v2_release_20261014`);
 sql(fs.readFileSync('database/migrations/026_mailbox_capacity.sql','utf8'));
 let fixture=fs.readFileSync('.local/followup-readiness-fixture.sql','utf8');
 fixture=fixture.replace('END $test$;',`
 UPDATE strategy_campaign_versions SET config=jsonb_set(config,'{email_dispatch}',config->'email_dispatch'||'{"daily_limit":100,"mailbox_rolling_limit":1,"min_interval_seconds":1}') WHERE campaign_id=c;
 UPDATE outreach_activities SET dispatch_metadata=dispatch_metadata||'{"sender_email":"unrelated@example.org"}' WHERE org_id=1;
 UPDATE outreach_activities SET status='reserved',sent_at=NULL,replied_at=NULL,
 dispatch_metadata=(dispatch_metadata-'started_at'-'quota_day'-'stop_reason')||jsonb_build_object('state','reserved','sender_email','demo@example.org','lease_until',clock_timestamp()+interval '5 minutes')
 WHERE org_id=1 AND dispatch_metadata->>'plan_id' IN (p->>'plan_id',second_arg->>'plan_id');
 PERFORM set_config('mailbox_test.args',jsonb_build_array(p,second_arg)::text,false);
END $test$;`);
 fixture=fixture.replace('ROLLBACK;',"SELECT current_setting('mailbox_test.args'); COMMIT;");
 const p=JSON.parse(sql(fixture).split('\n').find(s=>s.startsWith('[{')));
 const command=value=>`BEGIN; SET LOCAL ROLE v2_scratch_runtime; SELECT outreach_email_step_begin('${JSON.stringify(value).replace(/'/g,"''")}'::jsonb); SELECT pg_sleep(0.3); COMMIT;`;
 const results=(await Promise.all(p.map(value=>race(command(value))))).map(out=>JSON.parse(out.split('\n').find(s=>s.startsWith('{'))));
 assert.equal(results.filter(r=>r.execution_authorized===true).length,1);
 assert.equal(results.filter(r=>r.reason==='mailbox_rolling_limit_reached').length,1);
 const report={database:db,sessions:2,authorized:1,mailbox_quota_blocked:1,sends:0,scope:'synthetic plans in isolated scratch database; same organization, separate plans'};
 fs.writeFileSync('documentation/strategy-contract-v2/mailbox-race-results.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
