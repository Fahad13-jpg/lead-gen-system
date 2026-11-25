'use strict';
const fs=require('fs'),cp=require('child_process'),assert=require('assert/strict');
const container='lead_diag_pg_20261011',db='scratch_v2_release_20261014';
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',maxBuffer:2e6,timeout:60000});if(r.status!==0)throw Error(String(r.stderr||r.error).slice(0,1800));return r.stdout.trim();}
function sql(q){return docker(['exec','-i',container,'psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',db],q);}
const info=JSON.parse(docker(['inspect',container]))[0];assert.equal(info.HostConfig.NetworkMode,'none');
if(!info.State.Running)docker(['start',container]);
let ready=false;for(let i=0;i<30;i++){if(cp.spawnSync('docker',['exec',container,'pg_isready','-U','n8n_user'],{stdio:'ignore'}).status===0){ready=true;break;}Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1000);}assert(ready);
assert.equal(sql("SELECT count(*) FROM pg_proc WHERE proname='outreach_dispatch_recheck'"),'1');
sql(fs.readFileSync('database/migrations/020_email_dispatch_lifecycle.sql','utf8'));
console.log(sql(fs.readFileSync('tests/lead-strategy/email-lifecycle.sql','utf8')));
console.log('Scratch only: '+container+'/'+db+'; migration 020 NOT applied to live database.');
