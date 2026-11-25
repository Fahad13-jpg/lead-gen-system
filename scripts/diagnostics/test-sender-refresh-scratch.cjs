'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:60000,maxBuffer:1000000});assert.equal(r.status,0,String(r.stderr||'SCRATCH_FAILED').slice(0,1200));return r.stdout.trim();}
async function main(){const container='lead_diag_pg_20261011',database='postgres';const info=JSON.parse(docker(['inspect',container]))[0];assert.equal(info.HostConfig.NetworkMode,'none');const running=info.State.Running;if(!running)docker(['start',container]);try{
 let ready=false;for(let i=0;i<30;i++){if(cp.spawnSync('docker',['exec',container,'pg_isready','-U','n8n_user','-d',database],{stdio:'ignore',timeout:3000}).status===0){ready=true;break;}await new Promise(r=>setTimeout(r,1000));}assert.ok(ready,'SCRATCH_NOT_READY');
 const migration=fs.readFileSync('database/migrations/058_sender_connection_refresh.sql','utf8').replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'');
 const query=`BEGIN;
 CREATE TEMP TABLE organizations(id integer PRIMARY KEY,status text);
 CREATE TEMP TABLE org_sender_memberships(org_id integer,subject text,active boolean);
 CREATE TEMP TABLE sender_connections(org_id integer,connection_id text,owner_subject text,provider text,credential_ref text,inbox_credential_ref text,email text,sharing text,version integer,state text,daily_limit integer,mailbox_rolling_limit integer,min_interval_seconds integer,send_capable boolean,reply_capable boolean,checked_at timestamptz,PRIMARY KEY(org_id,connection_id));
 INSERT INTO organizations VALUES(1,'active');
 INSERT INTO org_sender_memberships VALUES(1,repeat('7',64),true);
 INSERT INTO sender_connections(org_id,connection_id,owner_subject,provider,credential_ref,inbox_credential_ref,email,sharing,version,state,daily_limit,mailbox_rolling_limit,min_interval_seconds,send_capable,reply_capable,checked_at)
 VALUES(1,'refresh_fixture',repeat('7',64),'gmail','refresh_fixture_ref',NULL,'sender@example.test','private',7,'ready',10,10,300,true,true,now()-interval '25 hours');
 ${migration}
 DO $test$ DECLARE r jsonb;p jsonb:='{"email":"sender@example.test","credential_ref":"refresh_fixture_ref","send":true,"read_replies":true}';stamp timestamptz;
 BEGIN
 r:=sender_connection_refreshed(1,'refresh_fixture',7,p);
 ASSERT r->>'state'='ready' AND r->>'version'='7' AND r->>'refreshed'='true','same account must retain version';
 SELECT checked_at INTO stamp FROM sender_connections WHERE connection_id='refresh_fixture';
 ASSERT stamp>now()-interval '1 minute','freshness must advance';
 r:=sender_connection_refreshed(1,'refresh_fixture',7,p);ASSERT r->>'refreshed'='false','recent checks must be inert';
 ASSERT (SELECT checked_at=stamp FROM sender_connections WHERE connection_id='refresh_fixture'),'recent check timestamp unchanged';
 ASSERT sender_connection_refreshed(1,'refresh_fixture',6,p)->>'error'='CHECK_STALE','old version fenced';
 UPDATE sender_connections SET checked_at=now()-interval '13 hours' WHERE connection_id='refresh_fixture';
 r:=sender_connection_refreshed(1,'refresh_fixture',7,p||'{"send":false}');ASSERT r->>'state'='reconnect_required' AND r->>'version'='8','auth failure must fence campaign';
 ASSERT (SELECT NOT send_capable AND NOT reply_capable FROM sender_connections WHERE connection_id='refresh_fixture'),'failed capabilities cleared';
 UPDATE sender_connections SET state='disabled',version=9 WHERE connection_id='refresh_fixture';
 ASSERT sender_connection_refreshed(1,'refresh_fixture',8,p)->>'error'='CHECK_STALE','concurrent pause preserved';
 UPDATE sender_connections SET state='ready',version=10,send_capable=true,reply_capable=true,checked_at=now()-interval '13 hours',provider='smtp',inbox_credential_ref='refresh_inbox' WHERE connection_id='refresh_fixture';
 r:=sender_connection_refreshed(1,'refresh_fixture',10,p||'{"inbox_credential_ref":"wrong"}');ASSERT r->>'state'='reconnect_required','SMTP inbox must match';
 UPDATE sender_connections SET state='ready',version=12,send_capable=true,reply_capable=true,checked_at=now()-interval '13 hours' WHERE connection_id='refresh_fixture';
 r:=sender_connection_refreshed(1,'refresh_fixture',12,p||'{"inbox_credential_ref":"refresh_inbox"}');ASSERT r->>'state'='ready' AND r->>'version'='12','SMTP success retains version';
 UPDATE org_sender_memberships SET active=false;
 ASSERT sender_connection_refreshed(1,'refresh_fixture',12,p)->>'error'='MEMBERSHIP_REQUIRED','revoked owner blocked';
 END $test$;
 ROLLBACK;`;
 docker(['exec','-i',container,'psql','-Xq','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',database],query);
 const report={passed:true,isolated_network:true,rolled_back:true,checks:['stable version on success','timestamp renewal','fresh-check no-op','version fencing','failure revokes capabilities','pause preserved','SMTP inbox binding','revoked membership'],emails_sent:0,provider_requests:0};fs.mkdirSync('.local/email-completion-20261115',{recursive:true});fs.writeFileSync('.local/email-completion-20261115/refresh-scratch.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{if(!running)docker(['stop',container]);}}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
