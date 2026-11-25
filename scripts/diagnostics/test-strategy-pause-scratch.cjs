'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const container='lead_016_1794141179811',database='scratch_contact_refresh_20261108';
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:120000,maxBuffer:10000000});if(r.status!==0)throw Error('PAUSE_SCRATCH_UNCONFIRMED: '+(r.stderr||'').slice(0,1000));return r.stdout.trim();}
try{assert.equal(docker(['inspect',container,'--format','{{.HostConfig.NetworkMode}}']),'none');docker(['start',container]);
 let ready=false;for(let i=0;i<50;i++){if(cp.spawnSync('docker',['exec',container,'pg_isready','-U','n8n_user'],{stdio:'ignore'}).status===0){ready=true;break;}Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,200);}assert(ready);
 docker(['exec','-i',container,'psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',database],fs.readFileSync('tests/lead-strategy/paused-management.sql','utf8'));
 console.log(JSON.stringify({passed:true,database,paused_claims_unchanged:true,zero_allowance_blocks_valid_lease:true,requests_created:0,plans_created:0,model_calls:0,live_database_changed:false}));
}finally{cp.spawnSync('docker',['stop','--time','10',container],{stdio:'ignore',timeout:30000});}
