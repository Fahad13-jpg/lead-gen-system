'use strict';
// Real n8n timers, mocked boundaries, isolated SQLite, no credentials or network.
const fs=require('fs'),path=require('path'),cp=require('child_process'),assert=require('assert/strict');
const name='email-real-schedules-'+Date.now(),dir=path.resolve('.local/'+name);
function docker(args){const r=cp.spawnSync('docker',args,{encoding:'utf8',timeout:480000,maxBuffer:2e6});if(r.status!==0)throw Error('Scratch Docker operation failed: '+args[0]);return r.stdout.trim();}
const specs=[
 {file:'.local/email-lifecycle-runtime-20261015/workflow.json',id:'timerEmail',kind:'email',last:'Assertions'},
 {file:'.local/reply-scan-runtime-20261018/workflow.json',id:'timerReply',kind:'reply',last:'Check Reply Persistence'}
];
assert(!fs.existsSync(dir),'Existing schedule test; do not overwrite evidence');fs.mkdirSync(dir);
for(const s of specs){
 const w=JSON.parse(fs.readFileSync(s.file));w.id=s.id;w.name='Isolated timer '+s.kind;w.active=false;
 for(const n of w.nodes){assert(!n.credentials);assert(!['n8n-nodes-base.httpRequest','n8n-nodes-base.postgres','n8n-nodes-base.gmail'].includes(n.type));}
 const trigger=w.nodes.find(n=>n.name==='Schedule Trigger');assert(trigger);
 Object.assign(trigger,{type:'n8n-nodes-base.scheduleTrigger',typeVersion:1.2,parameters:{rule:{interval:[{field:'seconds',secondsInterval:10}]}}});
 const last=w.nodes.find(n=>n.name===s.last);assert(last?.type==='n8n-nodes-base.code');
 const original=last.parameters.jsCode;
 // The original assertions still execute. Evidence is emitted only afterward.
 last.parameters.jsCode=`const verified=(()=>{${original}\n})();\nrequire('fs').writeFileSync('/tmp/schedule-results/${s.kind}-'+String(verified.json.case||verified.json.activity_id)+'.json',JSON.stringify({kind:'${s.kind}',execution:$execution.id,result:verified.json}));return verified;`;
 fs.writeFileSync(path.join(dir,s.id+'.json'),JSON.stringify(w));
}
fs.writeFileSync(path.join(dir,'run.cjs'),String.raw`
const fs=require('fs'),cp=require('child_process'),crypto=require('crypto');
async function main(){
fs.mkdirSync('/tmp/schedule-results');
const env={...process.env,DB_TYPE:'sqlite',N8N_USER_FOLDER:'/tmp/schedule-state',N8N_ENCRYPTION_KEY:crypto.randomBytes(24).toString('hex'),NODE_FUNCTION_ALLOW_BUILTIN:'fs',N8N_RUNNERS_ENABLED:'false',N8N_DIAGNOSTICS_ENABLED:'false',N8N_VERSION_NOTIFICATIONS_ENABLED:'false',N8N_TEMPLATES_ENABLED:'false'};
for(const id of ['timerEmail','timerReply'])for(const args of [['import:workflow','--input=/tmp/test/'+id+'.json'],['update:workflow','--id='+id,'--active=true']]){
 const r=cp.spawnSync('n8n',args,{env,encoding:'utf8',timeout:60000});if(r.status!==0)throw Error('Scratch CLI failed '+args[0]);
}
const log=fs.openSync('/tmp/schedule-results/server.log','w');
const server=cp.spawn('n8n',['start'],{env,stdio:['ignore',log,log]});
try{
 let ready=false;for(let i=0;i<150;i++){await new Promise(r=>setTimeout(r,2000));if(fs.readdirSync('/tmp/schedule-results').filter(x=>x.endsWith('.json')).length===12){ready=true;break;}if(server.exitCode!==null)throw Error('Scratch server exited');}
 if(!ready)throw Error('Timed out awaiting both scheduled workflows');
 const rows=fs.readdirSync('/tmp/schedule-results').filter(x=>x.endsWith('.json')).map(f=>JSON.parse(fs.readFileSync('/tmp/schedule-results/'+f)));
 if(rows.some(r=>!r.execution)||rows.filter(r=>r.kind==='email').length!==8||rows.filter(r=>r.kind==='reply').length!==4)throw Error('Incomplete timer results');
 fs.writeFileSync('/tmp/schedule-results/verified.json',JSON.stringify({passed:true,trigger:'real n8n Schedule Trigger every 10 seconds (test only)',network:'none',providers:'mocked',database:'isolated SQLite; application queries mocked',cases:rows},null,2));
}finally{server.kill('SIGTERM');await Promise.race([new Promise(r=>server.once('exit',r)),new Promise(r=>setTimeout(r,10000))]);if(server.exitCode===null)server.kill('SIGKILL');fs.closeSync(log);}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
`);
const image=docker(['inspect','n8n','--format','{{.Image}}']);assert(/^sha256:[a-f0-9]{64}$/.test(image));
docker(['create','--name',name,'--network','none','--memory','1g','--label','codex.scratch=email-real-schedules','--entrypoint','node',image,'/tmp/test/run.cjs']);
docker(['cp',dir+'/.',name+':/tmp/test']);
let failed;try{docker(['start','-a',name]);}catch(e){failed=e;}
docker(['cp',name+':/tmp/schedule-results/.',dir]);if(failed)throw failed;
const result=JSON.parse(fs.readFileSync(path.join(dir,'verified.json')));assert.equal(result.passed,true);
fs.writeFileSync('documentation/strategy-contract-v2/email-real-schedules-20261020.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({passed:true,email_cases:8,reply_cases:4,network:'none',production_changed:false}));
