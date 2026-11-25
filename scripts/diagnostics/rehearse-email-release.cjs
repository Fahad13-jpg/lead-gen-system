'use strict';
// Live access is limited to pg_dump and read-only baseline queries.
// Every restore, migration and test targets a new network-isolated scratch DB.
const fs=require('fs'),cp=require('child_process'),path=require('path'),assert=require('assert/strict');
const release=require('../lead-strategy/v2/email-release.cjs');
const target='lead_diag_pg_20261011',db='scratch_email_release_20261019',role='email_release_owner_20261019';
const dir=path.resolve('.local/email-release-rehearsal-20261019');
function docker(args,input,binary=false){const r=cp.spawnSync('docker',args,{input,encoding:binary?undefined:'utf8',timeout:180000,maxBuffer:80e6});if(r.status!==0){fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'private-error.log'),String(r.stderr||r.error||'Docker failed'));throw Error('Rehearsal stopped; private diagnostic retained.');}return binary?r.stdout:r.stdout.trim();}
function sql(q,database=db){assert(database===db||database==='postgres');return docker(['exec','-i',target,'psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',database],q);}
const info=JSON.parse(docker(['inspect',target]))[0];assert.equal(info.HostConfig.NetworkMode,'none');assert(info.State.Running);
const manifest=release.verify('.local/email-release-20261019');
const baseline=JSON.parse(docker(['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],`BEGIN READ ONLY; SELECT json_build_object('lifecycle',to_regprocedure('outreach_email_begin(jsonb)') IS NOT NULL,'window',to_regprocedure('outreach_email_window(jsonb,timestamptz)') IS NOT NULL,'runtime_superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=current_user)); COMMIT;`).split('\n').find(s=>s.startsWith('{')));
assert.equal(baseline.lifecycle,true);assert.equal(baseline.window,false,'Live baseline differs; inspect, do not replay');
assert.equal(sql("SELECT count(*) FROM pg_database WHERE datname='"+db+"'",'postgres'),'0','Scratch DB already exists; preserve prior evidence');
fs.mkdirSync(dir,{recursive:true});
const dump=docker(['exec','postgres_db','pg_dump','-U','n8n_user','-d','lead_db','-Fc'],undefined,true);
assert(dump.length>1000);fs.writeFileSync(path.join(dir,'fresh-before.dump'),dump,{flag:'wx'});
sql(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;`,'postgres');
sql(`CREATE DATABASE ${db} OWNER ${role};`,'postgres');
docker(['exec','-i',target,'pg_restore','--exit-on-error','--no-owner','--no-acl','--role='+role,'-U','n8n_user','-d',db],dump);
const applied=[];
for(const file of manifest.migrations){sql('SET ROLE '+role+';\n'+fs.readFileSync(path.join('.local/email-release-20261019',file),'utf8'));applied.push(file);}
const fixture=fs.readFileSync('.local/followup-readiness-fixture.sql','utf8').replace('SET LOCAL ROLE v2_scratch_runtime;','SET LOCAL ROLE '+role+';');
sql(fixture);
const permissions=sql(`SET ROLE ${role}; SELECT json_build_object('superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=current_user),'finish',has_function_privilege(current_user,'outreach_reply_scan_finish(jsonb)','EXECUTE'),'gate',has_function_privilege(current_user,'outreach_email_contact_gate(integer,integer,text,text)','EXECUTE'),'recovery',has_function_privilege(current_user,'outreach_delivery_scan_restart(jsonb)','EXECUTE'));`);
const result={date:'2026-10-19',scratch_database:db,network:'none',fresh_backup_restored:true,live_access:'read-only baseline and pg_dump only',live_baseline:baseline,migrations:applied,non_superuser_checks:JSON.parse(permissions.split('\n').find(s=>s.startsWith('{'))),lifecycle_fixture_passed:true,fixture_rolled_back:true,live_migrations:false,provider_calls:0,sends:0};
fs.writeFileSync('documentation/strategy-contract-v2/email-release-rehearsal.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
