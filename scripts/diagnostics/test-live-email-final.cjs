'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {Client,docker}=require('./gmail-test-client.cjs'),executor=require('../lead-strategy/v2/email-executor.cjs');
const dir=path.resolve('.local/email-final-test-20261019'),db='scratch_email_final_20261019',pg='lead_diag_pg_20261011';
const to='fah7861234@gmail.com',from='mohmmadfahad53408@gmail.com',ref='ErvKkvbo4c5GQjPn';
const lit=v=>"'"+JSON.stringify(v).replace(/'/g,"''")+"'::jsonb";
const sql=(q,database=db)=>{assert([db,'postgres'].includes(database));return docker(['exec','-i',pg,'psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',database],q);};
const parse=s=>JSON.parse(s.split('\n').find(l=>l.startsWith('{')));
async function main(){
 if(process.argv[2]==='--resume-before-first-send'){
  const row=JSON.parse(fs.readFileSync(path.join(dir,'plan.json')));
  assert(!fs.existsSync(path.join(dir,'attempt-1.json')),'Never repeat an attempted send');
  assert.equal(sql("SELECT count(*) FROM outreach_activities WHERE org_id=1 AND dispatch_metadata->>'plan_id'='"+row.plan_id+"'"),'0');
  const client=new Client(dir,'gmail-final-test-20261019',ref);client.open();try{await send(row,1,client);}finally{client.close();}return;
 }
 assert.equal(process.argv[2],'--approved-two-email-test');assert(!fs.existsSync(dir),'Prior test exists; never replay sends');
 const info=JSON.parse(docker(['inspect',pg]))[0];assert.equal(info.HostConfig.NetworkMode,'none');assert(info.State.Running);
 fs.mkdirSync(dir);sql(`CREATE DATABASE ${db} TEMPLATE scratch_email_release_20261019;`,'postgres');
 const subject='Email executor final verification';
 const first='This is the first email of your approved final verification.';
 const follow='Please reply TEST RECEIVED so we can verify reply detection.';
 const timing={timezone:'UTC',sending_window:{start_hour:0,end_hour:24,weekdays:[1,2,3,4,5,6,7]},sequence:[{step:1,channel:'email',delay_days:0},{step:2,channel:'email',delay_days:0}]};
 const cfg={...timing,email_dispatch:{enabled:true,credential_ref:ref,sender_email:from,daily_limit:10,mailbox_rolling_limit:10,min_interval_seconds:300}};
 const b={version:'strategy_v2',state:'template_completed',execution_authorized:true,validation_errors:[],blocking_reasons:[],strategy:{step1:{channel:'email',parts:[{text:first}]},followups:[{channel:'email',parts:[{text:follow}]}]},artifacts:{schedule:timing,email_draft:{subject,body:first},followup_drafts:[{step:2,intent_index:0,channel:'email',delay_days:0,status:'requires_plan_approval_and_execution_checks',subject,body:follow}]}};
 const context={fingerprint:'thread-test-fixture',suppressed:false,replied:false,lead:{email:to},report:{trust:{fields:{emails:[{value:to,status:'provider_verified'}]}}}};
 sql(`BEGIN;
 CREATE OR REPLACE FUNCTION strategy_context(p_org integer,p_campaign bigint,p_lead integer) RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT CASE WHEN p_org=1 AND p_lead=167 THEN ${lit(context)} ELSE '{}'::jsonb END $$;
 DO $test$ DECLARE c bigint;j bigint;pid bigint;b jsonb:=${lit(b)}; BEGIN
 UPDATE cleaned_leads SET email='${to.replace(/'/g,"''")}' WHERE org_id=1 AND id=167;
 INSERT INTO strategy_campaigns(org_id) VALUES(1) RETURNING id INTO c;
 INSERT INTO strategy_campaign_versions(org_id,campaign_id,version,config) VALUES(1,c,1,${lit(cfg)});
 INSERT INTO strategy_jobs(org_id,campaign_id,campaign_version,lead_id,request_id,status,fingerprint) VALUES(1,c,1,167,'approved-final-test','completed','thread-test-fixture') RETURNING id INTO j;
 INSERT INTO strategy_plans(org_id,job_id,campaign_id,campaign_version,lead_id,body,fingerprint,content_hash,expires_at) VALUES(1,j,c,1,167,b,'thread-test-fixture',md5(b::text),now()+interval '1 day') RETURNING id INTO pid;
 INSERT INTO strategy_approvals(org_id,plan_id,action,actor,content_hash) VALUES(1,pid,'approve','USER_APPROVED_TWO_EMAIL_TEST',md5(b::text)); END $test$; COMMIT;`);
 const row=parse(sql("SELECT json_build_object('org_id',p.org_id,'plan_id',p.id,'content_hash',p.content_hash,'body',p.body,'email',c.email) FROM strategy_plans p JOIN strategy_jobs j ON j.id=p.job_id JOIN cleaned_leads c ON c.id=p.lead_id AND c.org_id=p.org_id WHERE j.request_id='approved-final-test'"));
 fs.writeFileSync(path.join(dir,'plan.json'),JSON.stringify(row));
 const client=new Client(dir,'gmail-final-test-20261019',ref);client.open();
 try{await send(row,1,client);}finally{client.close();}
 console.log('First message attempted. Follow-up requires the five-minute spacing and fresh reply checks; use the explicit follow-up command, never replay this command.');
}
async function send(row,step,client,parent){
 const identity={org_id:row.org_id,plan_id:row.plan_id,step,content_hash:row.content_hash};
 const r=parse(sql('SELECT outreach_email_step_reserve('+lit(identity)+')'));assert(r.reserved,'Reservation denied: '+r.reason);
 const result=await executor.execute({...row,step},r.lease,{sender:{email:from,credential_ref:ref},executeQuery:async q=>parse(sql(q)),loadParent:async()=>parent,transport:async request=>{
  assert.equal(request.to,to);fs.writeFileSync(path.join(dir,'attempt-'+step+'.json'),JSON.stringify({at:new Date().toISOString(),step}),{flag:'wx'});
  const receipt=client.request('POST','messages/send',request.gmail_request);fs.writeFileSync(path.join(dir,'receipt-'+step+'.json'),JSON.stringify(receipt));return receipt;
 }},{enabled:true});
 fs.writeFileSync(path.join(dir,'result-'+step+'.json'),JSON.stringify(result));console.log(JSON.stringify({step,...result}));return result;
}
module.exports={send,sql,parse,dir,db,to,from,ref};
if(require.main===module)main().catch(e=>{console.error(e.message);console.error('Inspect retained state. Do not replay a send.');process.exitCode=1;});

