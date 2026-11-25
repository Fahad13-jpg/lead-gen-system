'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const container='lead_016_1794141179811',database='scratch_contact_refresh_20261108';
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:120000,maxBuffer:10000000});if(r.status!==0)throw Error('SCRATCH_TEST_UNCONFIRMED: '+(r.stderr||'').slice(0,1000));return r.stdout.trim();}
try{assert.equal(docker(['inspect',container,'--format','{{.HostConfig.NetworkMode}}']),'none');docker(['start',container]);
 let ready=false;for(let i=0;i<50;i++){if(cp.spawnSync('docker',['exec',container,'pg_isready','-U','n8n_user'],{stdio:'ignore'}).status===0){ready=true;break;}Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,200);}assert(ready);
 const sql=q=>docker(['exec','-i',container,'psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',database],q);
 sql(fs.readFileSync('database/migrations/016_signal_sheet.sql','utf8'));
 sql(fs.readFileSync('database/migrations/053_enrichment_failure_diagnostics.sql','utf8'));
 sql(fs.readFileSync('tests/lead-enrichment/failure-diagnostics.sql','utf8'));
 console.log(JSON.stringify({passed:true,database,source_classes:5,last_good_preserved:true,retry_policy_unchanged:true,malformed_and_stale_rejected:true,provider_calls:0,live_database_changed:false}));
}finally{cp.spawnSync('docker',['stop','--time','10',container],{stdio:'ignore',timeout:30000});}
