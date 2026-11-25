'use strict';
const cp=require('child_process'),fs=require('fs'),assert=require('assert/strict');
const container='lead_diag_pg_20261011',db='scratch_email_concurrency_20261015';
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:60000,maxBuffer:2e6});if(r.status)throw Error(String(r.stderr||r.error).slice(0,1000));return r.stdout.trim();}
const args=database=>['exec','-i',container,'psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',database];
const sql=q=>docker(args(db),q);
async function race(q){return new Promise((resolve,reject)=>{const c=cp.spawn('docker',args(db));let out='',err='';c.stdout.on('data',d=>out+=d);c.stderr.on('data',d=>err+=d);c.on('error',reject);c.on('exit',code=>code?reject(Error(err.slice(0,1000))):resolve(out));c.stdin.end(q);});}
async function main(){
 const i=JSON.parse(docker(['inspect',container]))[0];assert.equal(i.HostConfig.NetworkMode,'none');assert(i.State.Running);
 assert.equal(docker(args('postgres'),`SELECT count(*) FROM pg_database WHERE datname='${db}'`),'0','Existing concurrency DB retained; do not overwrite');
 docker(args('postgres'),`CREATE DATABASE ${db} TEMPLATE scratch_v2_release_20261014`);
 let setup=fs.readFileSync('tests/lead-strategy/email-lifecycle.sql','utf8');
 setup=setup.slice(0,setup.indexOf(" ASSERT outreach_email_begin(p||'{\"to_email\""));
 setup+=" PERFORM set_config('lead_test.arg',p::text,false); END $test$; SELECT current_setting('lead_test.arg'); COMMIT;";
 const p=JSON.parse(sql(setup).split('\n').find(x=>x.startsWith('{')));
 const clone=`BEGIN; SET LOCAL ROLE v2_scratch_runtime;
 DO $t$ DECLARE old strategy_plans%ROWTYPE;j bigint;pid bigint;p jsonb;r jsonb;BEGIN
 SELECT * INTO old FROM strategy_plans WHERE id=${p.plan_id} AND org_id=1;
 INSERT INTO strategy_jobs(org_id,campaign_id,campaign_version,lead_id,request_id,status,fingerprint)
 VALUES(1,old.campaign_id,1,167,'concurrency-second','completed','fixture') RETURNING id INTO j;
 INSERT INTO strategy_plans(org_id,job_id,campaign_id,campaign_version,lead_id,body,fingerprint,content_hash,expires_at)
 VALUES(1,j,old.campaign_id,1,167,old.body,'fixture',old.content_hash,old.expires_at) RETURNING id INTO pid;
 INSERT INTO strategy_approvals(org_id,plan_id,action,actor,content_hash) VALUES(1,pid,'approve','SCRATCH',old.content_hash);
 p:='${JSON.stringify(p).replace(/'/g,"''")}'::jsonb||jsonb_build_object('plan_id',pid);
 r:=outreach_dispatch_reserve(p);p:=p||jsonb_build_object('lease',r->>'lease');
 PERFORM set_config('lead_test.arg',p::text,false); END $t$;SELECT current_setting('lead_test.arg');COMMIT;`;
 const p2=JSON.parse(sql(clone).split('\n').find(x=>x.startsWith('{')));
 const command=p=>`BEGIN;SET LOCAL ROLE v2_scratch_runtime;SELECT outreach_email_begin('${JSON.stringify(p).replace(/'/g,"''")}'::jsonb);SELECT pg_sleep(1);COMMIT;`;
 const outputs=await Promise.all([race(command(p)),race(command(p2))]);
 const results=outputs.map(s=>JSON.parse(s.split('\n').find(x=>x.startsWith('{'))));
 assert.equal(results.filter(r=>r.execution_authorized===true).length,1);
 assert.equal(results.filter(r=>r.reason==='daily_quota_reached').length,1);
 const result={database:db,network:'none',concurrent_sessions:2,quota_limit:1,attempts_started:1,quota_blocked:1,context:'scratch test double',sends:0};
 fs.writeFileSync('documentation/strategy-contract-v2/email-concurrency-results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
