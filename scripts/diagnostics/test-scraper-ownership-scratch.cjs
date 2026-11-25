'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const container='lead_016_1794141179811',database='scratch_contact_refresh_20261108';
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:120000,maxBuffer:10000000});if(r.status!==0)throw Error('SCRAPER_SCRATCH_UNCONFIRMED: '+(r.stderr||'').slice(0,1000));return r.stdout.trim();}
try{assert.equal(docker(['inspect',container,'--format','{{.HostConfig.NetworkMode}}']),'none');docker(['start',container]);
 let ready=false;for(let i=0;i<50;i++){if(cp.spawnSync('docker',['exec',container,'pg_isready','-U','n8n_user'],{stdio:'ignore'}).status===0){ready=true;break;}Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,200);}assert(ready);
 for(const file of ['03_google_maps_scraper.json','03a_yellow_pages_scraper.json']){const w=JSON.parse(fs.readFileSync('workflows/'+file));let test=fs.readFileSync('tests/lead-gathering/ownership.sql','utf8');
  for(const [name,marker] of [['Save Run','SAVE_RUN_SQL'],['Heartbeat','HEARTBEAT_SQL']]){const query=w.nodes.find(n=>n.name===name).parameters.query;assert(!query.includes('$save$')&&!query.includes('$heartbeat$'));test=test.replaceAll('/* '+marker+' */',query);}
  docker(['exec','-i',container,'psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',database],test);
 }
 console.log(JSON.stringify({passed:true,database,actual_scraper_queries_tested:2,stale_worker_and_org_fenced:true,existing_run_retained:true,no_charges_created:true,live_database_changed:false,provider_calls:0}));
}finally{cp.spawnSync('docker',['stop','--time','10',container],{stdio:'ignore',timeout:30000});}
