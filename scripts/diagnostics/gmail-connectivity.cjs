'use strict';
// Read-only, credential-free Gmail connectivity control. HTTP 401 is expected.
const fs=require('fs'),cp=require('child_process'),readline=require('readline');
async function worker(client,installScoped){
 const net=require('net'),dns=require('dns'),https=require('https');
 const lookup=dns.lookup,connect=net.Socket.prototype.connect;let current;
 net.Socket.prototype.connect=function(...args){const r=current;if(r){this.once('lookup',e=>{r.dns_ms=performance.now()-r.start;r.dns_error=e?.code||null;});this.once('connect',()=>{r.connect_ms=performance.now()-r.start;r.family=this.remoteFamily;});this.once('secureConnect',()=>{r.tls_ms=performance.now()-r.start;});this.on('connectionAttemptFailed',(_ip,_port,family,e)=>r.attempts.push({family,code:e.code,syscall:e.syscall||null}));}return connect.apply(this,args);};
 let request;if(client==='n8n'){const root=require('path').dirname(require.resolve('n8n-core',{paths:['/usr/local/lib/node_modules/n8n']}));request=require(root+'/execution-engine/node-execution-context/utils/request-helper-functions.js').httpRequest;}
 const errors=e=>[{code:e?.code||e?.name||'unknown',syscall:e?.syscall||null},...(e?.errors||[]).flatMap(errors),...(e?.cause?errors(e.cause):[])];
 console.log(JSON.stringify({type:'ready',client,node:process.version,autoSelectFamily:net.getDefaultAutoSelectFamily(),attemptTimeout:net.getDefaultAutoSelectFamilyAttemptTimeout()}));
 for await(const line of require('readline').createInterface({input:process.stdin})){
  const c=JSON.parse(line);if(c.stop)break;
  dns.lookup=c.mode==='ipv4'?function(host,options,cb){if(typeof options==='function'){cb=options;options={};}return lookup.call(dns,host,{...(typeof options==='object'?options:{}),family:4},cb);}:lookup;
  if(c.mode==='scoped')installScoped(dns);
  const r=current={type:'request',client,mode:c.mode,round:c.round,at:new Date().toISOString(),start:performance.now(),attempts:[],status:null,errors:[]};
  const url='https://gmail.googleapis.com/gmail/v1/users/me/profile';
  try{
   if(client==='n8n'){const result=await request({url,method:'GET',timeout:12000,abortSignal:AbortSignal.timeout(15000),returnFullResponse:true,ignoreHttpStatusErrors:true,disableFollowRedirect:true});r.status=result.statusCode;r.response_ms=performance.now()-r.start;}
   else await new Promise((resolve,reject)=>{const q=https.get(url,{agent:false,timeout:12000},res=>{r.status=res.statusCode;r.first_byte_ms=performance.now()-r.start;res.resume();res.on('end',resolve);res.on('error',reject);});q.on('timeout',()=>q.destroy(Object.assign(Error('timeout'),{code:'ETIMEDOUT'})));q.on('error',reject);});
  }catch(e){r.errors=errors(e);}
  r.elapsed_ms=Math.round(performance.now()-r.start);delete r.start;r.expected_response=r.status===401;
  // Phase events are diagnostic, not proof that a logical send is safe to retry.
  console.log(JSON.stringify(r));current=null;
 }
}
async function main(){
 const scoped=process.argv.includes('--scoped'),candidate=scoped?'scoped':'ipv4';
 const stamp=new Date().toISOString().replace(/[:.]/g,'-');
 const dir='documentation/strategy-contract-v2/gmail-connectivity-'+stamp+(scoped?'-scoped':'')+(process.argv.includes('--final')?'-final':'');fs.mkdirSync(dir,{recursive:true});
 const output=fs.createWriteStream(dir+'/requests.jsonl');const workers=[];
 for(const client of ['n8n','host']){
  const install=require('../network/gmail-ipv4.cjs').install;
  const code='('+worker.toString()+')('+JSON.stringify(client)+','+install.toString()+').catch(()=>{console.error("probe_failed");process.exitCode=1;})';
  const p=client==='n8n'?cp.spawn('docker',['exec','-i','n8n','node','-e',code]):cp.spawn(process.execPath,['-e',code]);
  let ready;const w={p,client},start=new Promise(resolve=>ready=resolve);
  readline.createInterface({input:p.stdout}).on('line',line=>{const row=JSON.parse(line);output.write(JSON.stringify(row)+'\n');if(row.type==='ready')ready();else{w.resolve?.(row);w.resolve=null;}});
  p.stderr.on('data',()=>console.error(client+': diagnostic error (details withheld)'));
  p.on('exit',code=>{if(code){ready();w.resolve?.({client,error:'worker_exit'});}});workers.push(w);await start;
 }
 const rows=[];
 try{for(let round=1;round<=20;round++){
  const host=workers[1],container=workers[0];
  const control=new Promise(resolve=>{host.resolve=resolve;host.p.stdin.write(JSON.stringify({round,mode:'default'})+'\n');});
  for(const mode of round%2?['default',candidate]:[candidate,'default'])rows.push(await new Promise(resolve=>{container.resolve=resolve;container.p.stdin.write(JSON.stringify({round,mode})+'\n');}));
  rows.push(await control);if(round%5===0)console.log(round+'/20 interleaved rounds');
 }}finally{for(const w of workers)w.p.stdin.end('{"stop":true}\n');output.end();}
 const summary={requests:rows.length,groups:{}};
 for(const key of ['n8n:default','n8n:'+candidate,'host:default']){const group=rows.filter(r=>r.client+':'+r.mode===key),times=group.map(r=>r.elapsed_ms).sort((a,b)=>a-b);summary.groups[key]={total:group.length,expected_401:group.filter(r=>r.expected_response).length,p50_ms:times[Math.floor(times.length/2)],max_ms:times.at(-1),failures:group.filter(r=>!r.expected_response).map(r=>({round:r.round,at:r.at,errors:r.errors,attempts:r.attempts,connect_ms:r.connect_ms,tls_ms:r.tls_ms}))};}
 fs.writeFileSync(dir+'/summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
}
if(require.main===module)main().catch(()=>{console.error('Connectivity probe failed');process.exitCode=1;});
