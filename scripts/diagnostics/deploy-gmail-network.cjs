'use strict';
// Authorized network fix only. No workflow import, activation, DB mutation or sends.
const fs=require('fs'),cp=require('child_process'),assert=require('assert/strict'),crypto=require('crypto');
function docker(args){const r=cp.spawnSync('docker',args,{encoding:'utf8',timeout:120000,maxBuffer:8e6});if(r.status!==0)throw Error('Docker operation failed: '+args[0]);return r.stdout.trim();}
const json=args=>JSON.parse(docker(args));
function state(){return json(['exec','postgres_db','psql','-XAt','-U','n8n_user','-d','lead_db','-c',"SELECT json_build_object('running',(SELECT count(*) FROM execution_entity WHERE status='running'),'workflows',(SELECT md5(jsonb_agg(jsonb_build_object('id',id,'nodes',nodes,'connections',connections,'active',active) ORDER BY id)::text) FROM workflow_entity),'email_active',(SELECT count(*) FROM workflow_entity WHERE id IN ('gTjsUEP8VLlxKfWf','TrgeZrs4ILZnrXuJ') AND active=true));"]);}
async function main(){
 assert.equal(process.argv[2],'--apply');
 const dir='.local/gmail-network-deploy-20261020';assert(!fs.existsSync(dir),'Deployment record exists: do not replay');
 const c=json(['inspect','n8n'])[0],cfg=json(['compose','config','--format','json']);
 const env=Object.fromEntries(c.Config.Env.map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
 assert(!env.NODE_OPTIONS,'Preserve existing Node options; review required');
 for(const [k,v] of Object.entries(cfg.services.n8n.environment))assert.equal(String(v??''),String(env[k]??''),'Compose/live environment drift: '+k);
 assert.equal(json(['image','inspect',cfg.services.n8n.image])[0].Id,c.Image,'Refuse image update');
 const before=state();assert.equal(before.running,0,'Executions in flight');assert.equal(before.email_active,0,'Email must remain inactive');
 const file='docker-compose.yml',source=fs.readFileSync(file,'utf8');
 assert(!source.includes('gmail-ipv4.cjs'));
 const e='      - STRATEGY_CONTRACT_VERSION=strategy_v2',v='      - n8n_data:/home/node/.n8n';assert(source.includes(e)&&source.includes(v));
 const next=source.replace(e,e+'\n      - NODE_OPTIONS=--require=/opt/n8n-network/gmail-ipv4.cjs').replace(v,v+'\n      - ./scripts/network/gmail-ipv4.cjs:/opt/n8n-network/gmail-ipv4.cjs:ro');
 fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/docker-compose.before.yml',source);fs.writeFileSync(dir+'/before.json',JSON.stringify({image:c.Image,...before},null,2));
 fs.writeFileSync(file,next);
 try{
  docker(['compose','config','--quiet']);
  docker(['compose','up','-d','--no-deps','--pull','never','--force-recreate','n8n']);
  let healthy=false;
  for(let i=0;i<30;i++){try{const r=await fetch('http://127.0.0.1:5678/healthz/readiness',{signal:AbortSignal.timeout(3000)});if(r.ok){healthy=true;break;}}catch{}await new Promise(r=>setTimeout(r,2000));}
  assert(healthy,'n8n readiness failed');
  const after=state();assert.equal(after.workflows,before.workflows,'Workflow definitions or activation changed');assert.equal(after.email_active,0);
  const current=json(['inspect','n8n'])[0];assert.equal(current.Image,c.Image);assert(current.Config.Env.includes('NODE_OPTIONS=--require=/opt/n8n-network/gmail-ipv4.cjs'));
  const loaded=json(['exec','n8n','node','-e','console.log(JSON.stringify({loaded:require("dns").lookup.toString().includes("hosts.has")}))']);assert(loaded.loaded);
  const report={at:new Date().toISOString(),deployed:true,readiness:true,same_image:true,workflow_definitions_and_activation_unchanged:true,preload_loaded:true,preload_sha256:crypto.createHash('sha256').update(fs.readFileSync('scripts/network/gmail-ipv4.cjs')).digest('hex'),emails_sent:0,rollback:dir+'/docker-compose.before.yml'};
  fs.writeFileSync('documentation/strategy-contract-v2/gmail-network-deployment-20261020.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }catch(e){fs.writeFileSync(file,source);docker(['compose','up','-d','--no-deps','--pull','never','--force-recreate','n8n']);fs.writeFileSync(dir+'/rolled-back.json',JSON.stringify({at:new Date().toISOString(),reason:e.message}));throw e;}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
