'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const base=require('./strategy-v2-scratch.cjs');
const db='scratch_strategy_races_20261013',role='v2_scratch_runtime';
const quote=x=>"'"+JSON.stringify(x).replace(/'/g,"''")+"'::jsonb";
const sync=q=>base.sql(q,db);
function session(label,query,hold=false){
 const p=cp.spawn('docker',['exec','-i',base.container,'psql','-X','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',db,'-At']);
 let output='',errors='',readyResolve,readyReject;const ready=new Promise((r,j)=>{readyResolve=r;readyReject=j;});
 const done=new Promise((resolve,reject)=>{p.stdout.on('data',d=>{output+=d;if(output.includes('HELD'))readyResolve();});p.stderr.on('data',d=>errors+=d);p.on('error',e=>{readyReject(e);reject(e);});p.on('exit',code=>{if(code!==0){const e=Error(label+': '+errors.slice(0,1200));readyReject(e);reject(e);}else resolve(output);});});
 // Ensure an early failure is observed even when waiting on the other connection.
 done.catch(()=>{});ready.catch(()=>{});
 p.stdin.write(`SET application_name='${label}';SET ROLE ${role};${query}\n`);
 if(!hold)p.stdin.end();
 return {ready,done,end:q=>p.stdin.end(q+'\n')};
}
function json(output){const line=output.split(/\r?\n/).find(x=>x.startsWith('{')||x.startsWith('['));assert(line,'JSON result missing');return JSON.parse(line);}
async function blocked(label){
 for(let i=0;i<20;i++){
  if(sync(`SELECT count(*) FROM pg_stat_activity WHERE datname='${db}' AND application_name='${label}' AND cardinality(pg_blocking_pids(pid))>0`)==='1')return;
  await new Promise(r=>setTimeout(r,200));
 }
 throw Error('Expected real lock wait not observed: '+label);
}
async function lockedPair(aQuery,bQuery,label){
 const a=session(label+'-a','BEGIN;'+aQuery+";SELECT 'HELD';",true);let b;
 try{await a.ready;b=session(label+'-b',bQuery);await blocked(label+'-b');a.end('COMMIT;');const result=await Promise.all([a.done,b.done]);return result.map(json);}
 catch(e){a.end('ROLLBACK;');await a.done.catch(()=>{});if(b)await b.done.catch(()=>{});throw e;}
}
async function main(){
 base.check();
 const start=cp.spawnSync('docker',['start',base.container],{encoding:'utf8',timeout:30000});if(start.status!==0)throw Error('Could not start isolated diagnostic container');
 let ready=false;for(let i=0;i<30;i++){if(cp.spawnSync('docker',['exec',base.container,'pg_isready','-U','n8n_user'],{stdio:'ignore',timeout:5000}).status===0){ready=true;break;}await new Promise(r=>setTimeout(r,1000));}if(!ready)throw Error('Scratch PostgreSQL not ready');
 if(base.sql(`SELECT count(*) FROM pg_database WHERE datname='${db}'`,'postgres')!=='0')throw Error('Race database already exists; will not overwrite it');
 base.sql(`CREATE DATABASE ${db} TEMPLATE ${base.db}`,'postgres');
 const config={name:'Isolated concurrency fixture',mode:'ai',channels:['email'],offer:{description:'Scratch fixture only'},cta:{text:'Review?'},expiry_days:7};
 const campaign=JSON.parse(sync(`UPDATE strategy_jobs SET status='failed' WHERE status IN ('pending','processing');UPDATE strategy_ai_requests SET reserved_at=now()-interval '1 year';UPDATE enrichment_ai_requests SET reserved_at=now()-interval '1 year';UPDATE strategy_controls SET enabled=true;SELECT strategy_campaign_save(${quote({org_id:1,config})})` ).split(/\r?\n/).find(x=>x.startsWith('{'))).campaign_id;
 assert(campaign);
 for(const suffix of ['a','b'])sync(`SELECT strategy_enqueue(${quote({org_id:1,campaign_id:campaign,lead_id:167,request_id:'race-fixture-'+suffix})})`);
 const results=[];
 const a=session('v2-claim-a',"BEGIN;SELECT coalesce(jsonb_agg(value),'[]') FROM strategy_claim('race-a',1) value;SELECT 'HELD';",true);
 try{
  await a.ready;
  const b=session('v2-claim-b',"BEGIN;SELECT coalesce(jsonb_agg(value),'[]') FROM strategy_claim('race-b',1) value;ROLLBACK;");
  const bOutput=await b.done; // Must finish while A still holds its claim lock.
  a.end('ROLLBACK;');const aa=json(await a.done),bb=json(bOutput);
  assert.equal(aa.length,1);assert.equal(bb.length,1);assert.notEqual(aa[0].id,bb[0].id);
  results.push({test:'simultaneous_claims',passed:true,job_ids:[aa[0].id,bb[0].id],evidence:'B completed while A held row lock; distinct claims'});
 }catch(e){a.end('ROLLBACK;');await a.done.catch(()=>{});throw e;}
 const claimed=JSON.parse(sync("SELECT jsonb_agg(value) FROM strategy_claim('race-fixtures',2) value"));assert.equal(claimed.length,2);
 sync('UPDATE strategy_ai_controls SET enabled=true,monthly_limit=1 WHERE org_id=1');
 const args=claimed.map(x=>({id:x.id,org_id:1,lease:x.lease,wants_ai:true,fingerprint:x.input.fingerprint}));
 const gates=await lockedPair(`SELECT strategy_ai_gate(${quote(args[0])})`,`SELECT strategy_ai_gate(${quote(args[1])})`,'v2-reserve');
 assert.equal(gates.filter(x=>x.allowed===true).length,1);assert.equal(sync("SELECT count(*) FROM strategy_ai_requests WHERE org_id=1 AND reserved_at>=date_trunc('month',now())"),'1');
 results.push({test:'concurrent_last_budget_slot',passed:true,responses:gates,evidence:'Observed B waiting on A lock; only one reservation created'});
 const plan=JSON.parse(fs.readFileSync('documentation/strategy-contract-v2/lead-167.json')).ai_plan;
 plan.blocking_reasons=[]; // Isolated approval fixture only, never changes a saved local/live plan.
 const finish={...args[0],plan,ai_status:'ai_completed',usage:{}};
 const finishes=await lockedPair(`SELECT strategy_finish(${quote(finish)})`,`SELECT strategy_finish(${quote(finish)})`,'v2-finish');
 assert(finishes.every(r=>r.saved));assert.equal(finishes[1].replayed,true);assert.equal(sync(`SELECT count(*) FROM strategy_plans WHERE job_id=${args[0].id}`),'1');
 results.push({test:'concurrent_finish_replay',passed:true,evidence:'Observed B waiting; second finish replayed same plan; exactly one plan row'});
 const stored=JSON.parse(sync(`SELECT jsonb_build_object('id',id,'hash',content_hash) FROM strategy_plans WHERE job_id=${args[0].id}`));
 const approval={org_id:1,plan_id:stored.id,action:'approve',actor:'scratch reviewer',content_hash:stored.hash};
 const pair=await lockedPair(`UPDATE strategy_plans SET body=body||'{"concurrency_fixture":"changed"}'::jsonb,content_hash=md5((body||'{"concurrency_fixture":"changed"}'::jsonb)::text) WHERE id=${stored.id};SELECT '{"changed":true}'::jsonb`,`SELECT strategy_approval(${quote(approval)})`,'v2-approve');
 assert.equal(pair[1].error,'CONTENT_CHANGED');assert.equal(sync(`SELECT count(*) FROM strategy_approvals WHERE plan_id=${stored.id}`),'0');
 results.push({test:'approval_against_concurrent_content_change',passed:true,evidence:'Observed B waiting; stale content hash rejected; no approval inserted'});
 const report={database:db,container:base.container,role,production_changed:false,provider_calls:0,tests:results,retained:'Only dedicated clone contains committed concurrency fixtures; original scratch and production unchanged.'};
 fs.writeFileSync('documentation/strategy-contract-v2/concurrency-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
