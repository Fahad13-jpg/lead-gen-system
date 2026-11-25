'use strict';
// User-approved ONE self-addressed message. Real transport; isolated SQL test data.
// Never replay this script after an uncertain result. No live campaign activation.
const fs=require('fs'),cp=require('child_process'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const executor=require('../lead-strategy/v2/email-executor.cjs');
const dir=path.resolve('.local/email-self-test-20261019'),container='lead_diag_pg_20261011',db='scratch_email_selftest_20261019',cli='gmail-selftest-20261019';
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:240000,maxBuffer:12e6});if(r.status!==0)throw Error('SELF_TEST_COMMAND_FAILED');return r.stdout.trim();}
function sql(q,database=db){assert([db,'postgres'].includes(database));return docker(['exec','-i',container,'psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',database],q);}
const literal=v=>"'"+JSON.stringify(v).replace(/'/g,"''")+"'::jsonb";
const parse=out=>JSON.parse(out.split('\n').find(s=>s.startsWith('{')));
async function main(){
 const review=JSON.parse(fs.readFileSync('.local/email-self-test-review-20261019.json','utf8')),m=review.message;
 assert.equal(process.argv[2],'--approved-one-self-email');
 assert.equal(crypto.createHash('sha256').update(JSON.stringify(m)).digest('hex'),review.review_hash);
 assert.equal(review.review_hash,'25c6a6c68df7c5e012e75b3f8a5577a3567b792fa38d03f61775c51e3bc4645e');
 assert.equal(m.to,'mohmmadfahad53408@gmail.com');assert.equal(m.from,m.to);assert.equal(m.max_messages,1);assert.equal(m.automatic_retries,false);assert.deepEqual(m.followups,[]);
 assert.equal(JSON.parse(fs.readFileSync('documentation/strategy-contract-v2/gmail-profile-verification-20261019.json')).profile_verified,true);
 assert(!fs.existsSync(dir),'Prior self-test exists: inspect/reconcile, never resend');
 const pg=JSON.parse(docker(['inspect',container]))[0];assert.equal(pg.HostConfig.NetworkMode,'none');assert(pg.State.Running);
 const service=JSON.parse(docker(['inspect','n8n']))[0];
 const live=docker(['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],`BEGIN READ ONLY; SELECT json_build_object('active',(SELECT count(*) FROM workflow_entity WHERE id IN ('gTjsUEP8VLlxKfWf','TrgeZrs4ILZnrXuJ') AND active),'credentials',(SELECT json_agg(json_build_object('id',id,'name',name,'type',type,'data',data)) FROM credentials_entity WHERE id='${m.credential_ref.replace(/'/g,"''")}')); COMMIT;`);
 const state=parse(live);assert.equal(state.active,0);assert.equal(state.credentials.length,1);assert.equal(state.credentials[0].type,'gmailOAuth2');
 fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,'approval.json'),JSON.stringify({review_hash:review.review_hash,approval:'User continued after explicit one-message approval request',max_messages:1,created_at:new Date().toISOString()}));
 sql(`CREATE DATABASE ${db} TEMPLATE scratch_email_release_20261019;`,'postgres');
 const timing={timezone:'UTC',sending_window:{start_hour:0,end_hour:24,weekdays:[1,2,3,4,5,6,7]},sequence:[{step:1,channel:'email',delay_days:0}]};
 const policy=JSON.parse(fs.readFileSync('.local/email-sender-review-20261019.json')).email_dispatch;
 const config={...timing,email_dispatch:{...policy,enabled:true}};
 const body={version:'strategy_v2',state:'template_completed',execution_authorized:true,validation_errors:[],blocking_reasons:[],strategy:{step1:{channel:'email',parts:[{text:m.body}]}},artifacts:{schedule:timing,email_draft:{subject:m.subject,body:m.body}}};
 // Readiness is an explicitly labelled scratch fixture, not a live lead assertion.
 const context={fingerprint:'self-test-fixture',suppressed:false,replied:false,lead:{email:m.to},report:{trust:{fields:{emails:[{value:m.to,status:'provider_verified'}]}}}};
 sql(`BEGIN;
 CREATE OR REPLACE FUNCTION strategy_context(p_org integer,p_campaign bigint,p_lead integer) RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT CASE WHEN p_org=1 AND p_lead=167 THEN ${literal(context)} ELSE '{}'::jsonb END $$;
 DO $fixture$ DECLARE c bigint;j bigint;pid bigint;b jsonb:=${literal(body)}; BEGIN
 UPDATE cleaned_leads SET email=${"'"+m.to.replace(/'/g,"''")+"'"} WHERE id=167 AND org_id=1;
 INSERT INTO strategy_campaigns(org_id) VALUES(1) RETURNING id INTO c;
 INSERT INTO strategy_campaign_versions(org_id,campaign_id,version,config) VALUES(1,c,1,${literal(config)});
 INSERT INTO strategy_jobs(org_id,campaign_id,campaign_version,lead_id,request_id,status,fingerprint) VALUES(1,c,1,167,'approved-self-test-20261019','completed','self-test-fixture') RETURNING id INTO j;
 INSERT INTO strategy_plans(org_id,job_id,campaign_id,campaign_version,lead_id,body,fingerprint,content_hash,expires_at) VALUES(1,j,c,1,167,b,'self-test-fixture',md5(b::text),now()+interval '1 hour') RETURNING id INTO pid;
 INSERT INTO strategy_approvals(org_id,plan_id,action,actor,content_hash) VALUES(1,pid,'approve','USER_APPROVED_ONE_SELF_TEST',md5(b::text));
 END $fixture$; COMMIT;`);
 const row=parse(sql(`SELECT json_build_object('org_id',p.org_id,'plan_id',p.id,'step',1,'content_hash',p.content_hash,'body',p.body,'email',c.email) FROM strategy_plans p JOIN strategy_jobs j ON j.id=p.job_id JOIN cleaned_leads c ON c.id=p.lead_id AND c.org_id=p.org_id WHERE j.request_id='approved-self-test-20261019'`));
 fs.writeFileSync(path.join(dir,'test-plan.json'),JSON.stringify(row));
 const reservation=parse(sql('SELECT outreach_email_step_reserve('+literal({org_id:row.org_id,plan_id:row.plan_id,step:1,content_hash:row.content_hash})+')'));
 assert.equal(reservation.reserved,true,'Self-test reservation denied');
 let calls=0;
 async function transport(request){
  assert.equal(++calls,1);assert.equal(request.to,m.to);assert.equal(request.subject,m.subject);assert.equal(request.body,m.body);
  fs.writeFileSync(path.join(dir,'transport-started.json'),JSON.stringify({at:new Date().toISOString(),review_hash:review.review_hash}),{flag:'wx'});
  const encrypted=path.join(dir,'credentials.encrypted.json');fs.writeFileSync(encrypted,JSON.stringify(state.credentials),{flag:'wx'});
  const w={id:'approvedSelfEmail',name:'Approved single self email',active:false,settings:{executionOrder:'v1'},nodes:[
   {id:'manual',name:'Manual',type:'n8n-nodes-base.manualTrigger',typeVersion:1,position:[0,0],parameters:{}},
   {id:'send',name:'Send One Self Email',type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position:[200,0],retryOnFail:false,parameters:{method:'POST',url:'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',authentication:'predefinedCredentialType',nodeCredentialType:'gmailOAuth2',sendBody:true,specifyBody:'json',jsonBody:JSON.stringify(request.gmail_request),options:{timeout:20000}},credentials:{gmailOAuth2:{id:m.credential_ref,name:state.credentials[0].name}}}
  ],connections:{Manual:{main:[[{node:'Send One Self Email',type:'main',index:0}]]}}};
  fs.writeFileSync(path.join(dir,'workflow.json'),JSON.stringify(w));
  fs.writeFileSync(path.join(dir,'run.cjs'),String.raw`
const fs=require('fs'),cp=require('child_process');const key=JSON.parse(fs.readFileSync('/home/node/.n8n/config','utf8')).encryptionKey;
const env={...process.env,DB_TYPE:'sqlite',N8N_USER_FOLDER:'/tmp/self-state',N8N_ENCRYPTION_KEY:process.env.N8N_ENCRYPTION_KEY||key};
let receipt={error:'not_executed'};
for(const args of [['import:credentials','--input=/tmp/self/credentials.encrypted.json'],['import:workflow','--input=/tmp/self/workflow.json'],['execute','--id=approvedSelfEmail','--rawOutput']]){
 const r=cp.spawnSync('n8n',args,{env,encoding:'utf8',timeout:180000,maxBuffer:12e6});if(args[0]!=='execute'){if(r.status!==0)break;continue;}
 let result;for(let i=0;i<(r.stdout||'').length;i++){if(r.stdout[i]!=='{')continue;try{result=JSON.parse(r.stdout.slice(i,r.stdout.lastIndexOf('}')+1));break;}catch{}}
 const data=result?.data?.resultData||result?.resultData;const msg=data?.runData?.['Send One Self Email']?.[0]?.data?.main?.[0]?.[0]?.json;
 receipt=msg&&!data?.error&&/^[a-f0-9]{8,64}$/i.test(msg.id||'')?{id:msg.id,threadId:msg.threadId}:{error:'send_result_uncertain'};
}fs.writeFileSync('/tmp/self-receipt.json',JSON.stringify(receipt));
`);
  const key=(service.Config.Env||[]).filter(e=>e.startsWith('N8N_ENCRYPTION_KEY='));
  docker(['create','--name',cli,'--network','bridge','--volumes-from','n8n:ro','--env','DB_TYPE=sqlite','--env','N8N_RUNNERS_ENABLED=false','--env','N8N_DIAGNOSTICS_ENABLED=false','--env','N8N_VERSION_NOTIFICATIONS_ENABLED=false','--env','N8N_TEMPLATES_ENABLED=false',...key.flatMap(v=>['--env',v]),'--entrypoint','node',service.Image,'/tmp/self/run.cjs']);
  docker(['cp',dir+'/.',cli+':/tmp/self']);docker(['start','-a',cli]);
  docker(['cp',cli+':/tmp/self-receipt.json',path.join(dir,'receipt.json')]);
  const receipt=JSON.parse(fs.readFileSync(path.join(dir,'receipt.json')));
  const done=JSON.parse(docker(['inspect',cli]))[0];assert.equal(done.State.Running,false);docker(['rm',cli]);fs.unlinkSync(encrypted);return receipt;
 }
 const result=await executor.execute(row,reservation.lease,{sender:{email:m.from,credential_ref:m.credential_ref},executeQuery:async q=>parse(sql(q)),transport},{enabled:true});
 const recorded=parse(sql(`SELECT json_build_object('state',dispatch_metadata->>'state','attempts',dispatch_metadata->>'attempts','external_id',external_id) FROM outreach_activities WHERE org_id=1 AND dispatch_metadata->>'plan_id'='${row.plan_id}' AND dispatch_metadata->>'step'='1'`));
 const report={checked_at:new Date().toISOString(),recipient:m.to,subject:m.subject,result,recorded,transport_calls:calls,scratch_database:db,readiness:'synthetic self-test fixture only',live_campaigns_changed:false,prospects_contacted:0,automatic_retry:false,production_quota_note:'Count this external test when approving any same-day live rollout.'};
 fs.writeFileSync('documentation/strategy-contract-v2/email-self-test-result-20261019.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
main().catch(()=>{console.error('Self-test stopped. Inspect retained state; do not rerun or resend without reconciliation.');process.exitCode=1;});
