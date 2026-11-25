'use strict';
// Diagnostic processes only. GET models, never inference; credentials live only in memory/stdin.
const cp=require('child_process'),fs=require('fs'),readline=require('readline');
async function worker(client,ipv4){
 const net=require('net');let current,key;const scope='api.groq.com';
 if(client==='n8n'&&ipv4){const https=require('https'),original=https.request;https.request=function(options,...args){if(options?.hostname===scope||options?.host===scope)options={...options,family:4,lookup:(host,opts,cb)=>require('dns').lookup(host,{...opts,family:4},cb)};return original.call(this,options,...args)}}
 let request,dispatcher;if(client==='n8n'){const root=require('path').dirname(require.resolve('n8n-core',{paths:['/usr/local/lib/node_modules/n8n']}));request=require(root+'/execution-engine/node-execution-context/utils/request-helper-functions.js').httpRequest;}
 if(client==='fetch'&&ipv4){const {Agent}=require(require.resolve('undici',{paths:['/usr/local/lib/node_modules/n8n']}));dispatcher=new Agent({connect:{family:4}});}
 const original=net.Socket.prototype.connect;net.Socket.prototype.connect=function(...args){const r=current;if(r){this.once('connect',()=>{r.tcp=true;r.family=this.remoteFamily});this.once('secureConnect',()=>r.tls=true);this.on('connectionAttemptFailed',(ip,port,family,e)=>r.attempts.push({family,code:e.code,syscall:e.syscall||null}));}return original.apply(this,args)};
 const errors=e=>[{code:e?.code||e?.name||'unknown',syscall:e?.syscall||null},...(e?.errors||[]).flatMap(errors),...(e?.cause?errors(e.cause):[])];
 console.log(JSON.stringify({type:'ready',node:process.version,client,ipv4,autoSelectFamily:net.getDefaultAutoSelectFamily(),dns:require('dns').getServers()}));
 for await(const line of require('readline').createInterface({input:process.stdin})){const c=JSON.parse(line);if(c.key){key=c.key;continue}if(c.stop)break;const started=performance.now();current={type:'request',round:c.round,at:new Date().toISOString(),tcp:false,tls:false,attempts:[],status:null,errors:[]};
 try{const headers={Authorization:'Bearer '+key};if(request){const r=await request({url:'https://api.groq.com/openai/v1/models',method:'GET',headers,timeout:12000,abortSignal:AbortSignal.timeout(15000),returnFullResponse:true,ignoreHttpStatusErrors:true,disableFollowRedirect:true});current.status=r.statusCode;}else{const r=await fetch('https://api.groq.com/openai/v1/models',{headers,dispatcher,signal:AbortSignal.timeout(15000),redirect:'error'});current.status=r.status;await r.arrayBuffer();}}catch(e){current.errors=errors(e)}current.elapsed_ms=Math.round(performance.now()-started);current.end_at=new Date().toISOString();console.log(JSON.stringify(current));current=null;}
 if(dispatcher)await dispatcher.close();process.exit(0);
}
async function main(){
 const env=JSON.parse(fs.readFileSync('.local/scratch-diagnostics-20261011/environment.json'));const dnsName='lead_diag_dns_20261012';
 const run=args=>cp.execFileSync('docker',args,{encoding:'utf8'}).trim();
 if(run(['inspect','lead_diag_base_20261011','--format','{{index .Config.Labels "codex.scratch"}}'])!=='lead-diagnostic-20261011')throw Error('Scratch identity mismatch');
 if(cp.spawnSync('docker',['inspect',dnsName],{stdio:'ignore'}).status===0)throw Error('Scratch DNS name already exists');
 run(['run','-d','--name',dnsName,'--label','codex.scratch=lead-diagnostic-20261012','--network',env.network,'--dns','1.1.1.1','--dns','8.8.8.8','--entrypoint','node',env.image,'-e','setInterval(()=>{},1000)']);
 const key=run(['exec','n8n','node','-e','process.stdout.write(process.env.GROQ_API_KEY||"")']);if(!key)throw Error('Missing credential');
 const dir='documentation/hardening-review-20261012';fs.mkdirSync(dir,{recursive:true});const output=fs.createWriteStream(dir+'/connectivity-control.jsonl');
 const workers=[];
 for(const container of ['lead_diag_base_20261011',dnsName,'windows_host'])for(const [client,ipv4]of container==='windows_host'?[['fetch',false]]:[['n8n',false],['n8n',true],['fetch',true]]){
  const code='('+worker.toString()+')('+JSON.stringify(client)+','+ipv4+').catch(()=>{console.error("diagnostic_failed");process.exit(1)})';
  const proc=container==='windows_host'?cp.spawn(process.execPath,['-e',code]):cp.spawn('docker',['exec','-i',container,'node','-e',code]);
  const item={container,client,ipv4,proc};let ready,rejectReady;const started=new Promise((resolve,reject)=>{ready=resolve;rejectReady=reject});
  readline.createInterface({input:proc.stdout}).on('line',line=>{const r=JSON.parse(line);output.write(JSON.stringify({...r,container,client,ipv4})+'\n');if(r.type==='ready')ready();else if(item.resolve){item.resolve(r);item.resolve=null}});
  proc.on('exit',code=>{if(code){rejectReady(Error('Probe process failed'));item.reject?.(Error('Probe process failed'));}});proc.stderr.on('data',()=>console.error('Probe stderr withheld'));proc.stdin.write(JSON.stringify({key})+'\n');await started;workers.push(item);
 }
 const request=(w,round)=>new Promise((resolve,reject)=>{w.resolve=resolve;w.reject=reject;w.proc.stdin.write(JSON.stringify({round})+'\n')});
 // Containers run in parallel; within each container configurations rotate sequentially.
 for(let round=1;round<=100;round++){await Promise.all(['lead_diag_base_20261011',dnsName,'windows_host'].map(async container=>{for(const w of workers.filter(w=>w.container===container))await request(w,round)}));if(round%10===0)console.log(round+'/100 rounds');}
 for(const w of workers)w.proc.stdin.end(JSON.stringify({stop:true})+'\n');output.end();console.log('700 token-free requests complete');
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={worker};
