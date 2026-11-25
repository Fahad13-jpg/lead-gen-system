'use strict';
const cp=require('node:child_process'),assert=require('node:assert/strict');
const container='lead_diag_pg_20261011',template='scratch_email_release_20261019';
const target='scratch_call_concurrency_'+Date.now();
if(!/^scratch_call_concurrency_[0-9]+$/.test(target))throw Error('SCRATCH_DATABASE_REQUIRED');
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:90000,maxBuffer:1000000});if(r.status!==0)throw Error(String(r.stderr||r.error||'scratch failed').slice(0,2200));return r.stdout;}
const info=JSON.parse(docker(['inspect',container]));if(info[0].Name!=='/'+container||info[0].HostConfig.NetworkMode!=='none')throw Error('SCRATCH_ONLY');
const args=db=>['exec','-i',container,'psql','-X','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',db,'-At'];
function concurrent(sql){return new Promise((resolve,reject)=>{const p=cp.spawn('docker',args(target));let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject);p.on('close',code=>code===0?resolve(out):reject(Error(err.slice(0,1200))));p.stdin.end(sql);});}
(async()=>{
 let created=false;
 try{
  docker(args('postgres'),`CREATE DATABASE ${target} TEMPLATE ${template};`);created=true;
  const full=require('./calling-dispatch-scratch.cjs').sql;
  const setup=full.slice(0,full.indexOf(" r:=outreach_call_dispatch_next"))+"END $test$; COMMIT;";
  assert.ok(setup.includes('eligible gate:'));
  docker(args(target),setup);
  const scope="(SELECT org_id FROM strategy_jobs WHERE request_id LIKE 'calling-dispatch-scratch-%' ORDER BY id DESC LIMIT 1)";
  const statement=`BEGIN; SELECT outreach_call_dispatch_next(${scope},'scratch-retell'); SELECT pg_sleep(0.3); COMMIT;`;
  const responses=await Promise.all([concurrent(statement),concurrent(statement)]);
  const results=responses.map(r=>JSON.parse(r.split(/\r?\n/).find(line=>line.startsWith('{'))));
  assert.equal(results.filter(r=>r.authorized===true).length,1,'only one independent session may authorize: '+JSON.stringify(results.map(r=>({authorized:r.authorized,reason:r.reason,deferred:r.deferred}))));
  assert.equal(results.filter(r=>r.authorized===false).length,1);
  const binding=results.find(r=>r.authorized===true);
  const state=JSON.parse(docker(args(target),`SELECT jsonb_build_object('attempts',dispatch_metadata->>'attempts','active',(SELECT count(*) FROM outreach_activities WHERE channel='call' AND dispatch_metadata->>'state'='dispatching')) FROM outreach_activities WHERE id=${Number(binding.activity_id)};`).trim());
  assert.equal(state.attempts,'1');assert.equal(state.active,1);
  // Two independent sessions try to claim the same calendar interval for different calls.
  docker(args(target),`UPDATE outreach_activities SET dispatch_metadata=dispatch_metadata||'{"state":"provider_accepted","provider_call_id":"fixture-one"}'::jsonb WHERE id=${Number(binding.activity_id)};
  INSERT INTO outreach_activities(org_id,lead_id,channel,status,dispatch_metadata)
  SELECT org_id,lead_id,'call','provider_accepted',dispatch_metadata||'{"step":"2","provider_call_id":"fixture-two"}'::jsonb FROM outreach_activities WHERE id=${Number(binding.activity_id)};`);
  const activities=JSON.parse(docker(args(target),`SELECT jsonb_agg(jsonb_build_object('id',id,'call',dispatch_metadata->>'provider_call_id') ORDER BY id) FROM outreach_activities WHERE org_id=${binding.org_id} AND dispatch_metadata->>'plan_id'=(SELECT dispatch_metadata->>'plan_id' FROM outreach_activities WHERE id=${Number(binding.activity_id)}) AND channel='call';`).trim());
  assert.equal(activities.length,2);
  const slot=JSON.parse(docker(args(target),`SELECT cv.config->'call_dispatch'->'calendar'->'slots'->0 FROM strategy_campaign_versions cv JOIN strategy_plans p ON p.org_id=cv.org_id AND p.campaign_id=cv.campaign_id AND p.campaign_version=cv.version WHERE p.org_id=${binding.org_id} AND p.id::text=(SELECT dispatch_metadata->>'plan_id' FROM outreach_activities WHERE id=${Number(binding.activity_id)});`).trim());
  const quote=s=>"'"+String(s).replace(/'/g,"''")+"'";
  const claim=a=>`BEGIN; SELECT outreach_call_booking(jsonb_build_object('org_id',${binding.org_id},'activity_id',${a.id},'provider_call_id','${a.call}','connection_ref','scratch-retell','operation','claim','event_id',repeat('${a===activities[0]?'a':'b'}',64),'calendar_id','fixture@example.invalid','slot_id','fixture-slot','confirmed_by_recipient',true,'start',${quote(slot.start)},'end',${quote(slot.end)}));SELECT pg_sleep(0.3);COMMIT;`;
  const bookingResults=(await Promise.all(activities.map(a=>concurrent(claim(a))))).map(r=>JSON.parse(r.split(/\r?\n/).find(line=>line.startsWith('{'))));
  assert.equal(bookingResults.filter(r=>r.acquired===true).length,1,'one booking claim: '+JSON.stringify(bookingResults));
  assert.equal(bookingResults.filter(r=>r.reason==='slot_locked').length,1);
  console.log(JSON.stringify({database:target,dispatch_sessions:2,authorized_calls:1,booking_sessions:2,acquired_slots:1,result:'passed',live_changed:false}));
 }finally{if(created)docker(args('postgres'),`DROP DATABASE ${target};`);}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
