'use strict';
const cp=require('child_process'),fs=require('fs'),path=require('path'),readline=require('readline');
async function worker(client,mode){
 const net=require('net'),dns=require('dns'),rl=require('readline');let key,current=null;
 if(mode==='disabled')net.setDefaultAutoSelectFamily(false);
 if(mode==='raised')net.setDefaultAutoSelectFamilyAttemptTimeout(1500);
 if(mode==='ipv4'){const lookup=dns.lookup;dns.lookup=function(host,options,cb){if(typeof options==='function'){cb=options;options={}}return lookup.call(dns,host,{...(typeof options==='object'?options:{}),family:4},cb)}}
 const connect=net.Socket.prototype.connect;
 net.Socket.prototype.connect=function(...args){const record=current;if(record){this.once('connect',()=>{record.tcp=true;record.remote_family=this.remoteFamily});this.once('secureConnect',()=>record.tls=true);this.on('connectionAttemptFailed',(ip,port,family,error)=>record.attempts.push({family,code:error.code,syscall:error.syscall||null}));this.once('lookup',(err,ip,family)=>{record.dns=err?err.code:'resolved';record.lookup_family=family});}return connect.apply(this,args)};
 let request;if(client==='n8n_http'){const root=require('path').dirname(require.resolve('n8n-core',{paths:['/usr/local/lib/node_modules/n8n']}));request=require(root+'/execution-engine/node-execution-context/utils/request-helper-functions.js').httpRequest;}
 const safeErrors=e=>[{code:e?.code||e?.name||'unknown',syscall:e?.syscall||null},...(e?.errors||[]).flatMap(safeErrors),...(e?.cause?safeErrors(e.cause):[])];
 console.log(JSON.stringify({type:'ready',client,mode,node:process.version,autoSelectFamily:net.getDefaultAutoSelectFamily(),attemptTimeout:net.getDefaultAutoSelectFamilyAttemptTimeout(),ipv6_disabled:require('fs').readFileSync('/proc/sys/net/ipv6/conf/all/disable_ipv6','utf8').trim(),routes:require('fs').readFileSync('/proc/net/ipv6_route','utf8')}));
 for await(const line of rl.createInterface({input:process.stdin})){const command=JSON.parse(line);if(command.key){key=command.key;continue}if(command.stop)break;
  current={type:'request',client,mode,round:command.round,at:new Date().toISOString(),tcp:false,tls:false,dns:null,attempts:[],status:null,errors:[]};const started=performance.now();
  try{const headers={Authorization:'Bearer '+key};if(client==='n8n_http'){const r=await request({url:'https://api.groq.com/openai/v1/models',method:'GET',headers,timeout:12000,abortSignal:AbortSignal.timeout(15000),returnFullResponse:true,ignoreHttpStatusErrors:true,disableFollowRedirect:true});current.status=r.statusCode;}else{const r=await fetch('https://api.groq.com/openai/v1/models',{headers,signal:AbortSignal.timeout(15000),redirect:'error'});current.status=r.status;await r.arrayBuffer();}}
  catch(e){current.errors=safeErrors(e);current.header_queued=e.request?!!(e.request._currentRequest||e.request)._headerSent:null;}
  current.elapsed_ms=Math.round(performance.now()-started);current.pre_send_proven=current.status===null&&!current.tls&&current.errors.some(e=>['getaddrinfo','connect'].includes(e.syscall))&&current.errors.filter(e=>e.syscall).every(e=>['getaddrinfo','connect'].includes(e.syscall));
  console.log(JSON.stringify(current));current=null;
 }
 process.exit(0);
}
async function main(){const client=process.argv[2];if(!['fetch','n8n_http'].includes(client))throw Error('Invalid client');const dir=path.resolve('documentation/scratch-review-20261011');fs.mkdirSync(dir,{recursive:true});
 const key=cp.execFileSync('docker',['exec','n8n','node','-e','process.stdout.write(process.env.GROQ_API_KEY||"")'],{encoding:'utf8'}).trim();if(!key)throw Error('Missing credential');
 const configurations=[['default','lead_diag_base_20261011'],['ipv4','lead_diag_base_20261011'],['disabled','lead_diag_base_20261011'],['raised','lead_diag_base_20261011'],['sysctl_noipv6','lead_diag_noipv6_20261011'],['node_options_disabled','lead_diag_nodeoff_20261011'],['node_options_raised','lead_diag_nodetimeout_20261011']];
 const out=fs.createWriteStream(path.join(dir,client+'-interleaved.jsonl')),workers=[];
 for(const [mode,container]of configurations){const proc=cp.spawn('docker',['exec','-i',container,'node','-e','('+worker.toString()+')('+JSON.stringify(client)+','+JSON.stringify(mode)+').catch(()=>{console.error("diagnostic_failed");process.exit(1)})']);
  const item={proc,mode,pending:null};let ready;const started=new Promise(r=>ready=r);readline.createInterface({input:proc.stdout}).on('line',line=>{const r=JSON.parse(line);out.write(JSON.stringify({...r,container})+'\n');if(r.type==='ready')ready();else if(item.pending){const resolve=item.pending;item.pending=null;resolve(r)}});proc.stderr.on('data',()=>console.error('Diagnostic child error; sensitive details withheld'));proc.on('exit',code=>{if(code)console.error('Child exited',mode,code)});proc.stdin.write(JSON.stringify({key})+'\n');await started;workers.push(item);
 }
 for(let round=1;round<=50;round++){for(const w of workers)await new Promise(resolve=>{w.pending=resolve;w.proc.stdin.write(JSON.stringify({round})+'\n')});if(round%10===0)console.log(client,round+'/50 rounds');}
 for(const w of workers)w.proc.stdin.end(JSON.stringify({stop:true})+'\n');out.end();console.log(client,'350 token-free requests complete');}
main().catch(e=>{console.error(e.message);process.exitCode=1});
