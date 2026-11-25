'use strict';
const fs=require('fs'),cp=require('child_process'),crypto=require('crypto');
const dir='documentation/permissions-fuzz-review-20261012';fs.mkdirSync(dir,{recursive:true});
const run=(args,extra={})=>{const r=cp.spawnSync('docker',args,{encoding:'utf8',maxBuffer:5e6,...extra});if(r.status!==0)throw Error('Scratch Docker operation failed: '+args.slice(0,2).join(' ')+'; details withheld');return r.stdout.trim()};
async function main(){const old=JSON.parse(fs.readFileSync('.local/scratch-diagnostics-20261011/environment.json'));const env={...process.env,H_N8N_IMAGE:old.image,H_PG_IMAGE:old.pgImage,H_DB_PASSWORD:crypto.randomBytes(24).toString('hex')};
 const compose=['compose','-p','hreview20261012','-f','scripts/diagnostics/h-scratch-compose.yml'];
 const existing=cp.spawnSync('docker',['inspect','hreview20261012-postgres-1','--format','{{json .Config.Env}}'],{encoding:'utf8'});
 if(existing.status===0){if(run(['inspect','hreview20261012-postgres-1','--format','{{index .Config.Labels "codex.scratch"}}'])!=='h-review-20261012')throw Error('Scratch label mismatch');env.H_DB_PASSWORD=JSON.parse(existing.stdout).find(x=>x.startsWith('POSTGRES_PASSWORD=')).slice('POSTGRES_PASSWORD='.length);}
 run([...compose,'up','-d','postgres'],{env});const pg=run([...compose,'ps','-q','postgres'],{env});
 for(let i=0;i<60;i++){if(cp.spawnSync('docker',['exec',pg,'pg_isready','-U','scratch_admin'],{stdio:'ignore'}).status===0)break;await new Promise(r=>setTimeout(r,1000));}
 if(run(['exec',pg,'psql','-U','scratch_admin','-d','n8n_baseline','-Atc',"SELECT count(*) FROM pg_database WHERE datname='n8n_ipv6off'"])==='0')run(['exec',pg,'createdb','-U','scratch_admin','n8n_ipv6off']);run([...compose,'up','-d','baseline','ipv6off'],{env});
 const result={project:'hreview20261012',services:{}};
 for(const [name,port]of [['baseline',12878],['ipv6off',12879]]){const container=run([...compose,'ps','-q',name],{env});let ready=false;
  for(let i=0;i<90;i++){try{const r=await fetch('http://127.0.0.1:'+port+'/healthz/readiness');if(r.status===200){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,1000));}
  if(!ready)throw Error('Scratch service did not become ready');const endpoints={};for(const endpoint of ['/','/rest/settings','/healthz/readiness','/webhook/h4-unregistered-probe']){const r=await fetch('http://127.0.0.1:'+port+endpoint);endpoints[endpoint]={status:r.status,bytes:(await r.text()).length};}
  run(['cp','scripts',container+':/tmp/h-scripts']);const helper=JSON.parse(run(['exec',container,'node','-e',"require('/tmp/h-scripts/lead-enrichment/worker.cjs').basic({lead:{company_name:'Scratch fixture',website:null}},async()=>{throw Error('network forbidden')}).then(r=>console.log(JSON.stringify({status:r.status,reason:r.reason,signal:r.signals.web_presence.state})))"]));
  result.services[name]={container,port,endpoints,helper,ipv6_disabled:run(['exec',container,'cat','/proc/sys/net/ipv6/conf/all/disable_ipv6']),database_workflows:run(['exec',pg,'psql','-U','scratch_admin','-d',name==='baseline'?'n8n_baseline':'n8n_ipv6off','-Atc','SELECT count(*) FROM workflow_entity'])};
 }
 fs.writeFileSync(dir+'/service-test.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
