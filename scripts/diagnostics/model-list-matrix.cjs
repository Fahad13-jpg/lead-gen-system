'use strict';
// Diagnostic child processes only. GET model list; never imports or executes a workflow.
const fs=require('fs'),cp=require('child_process'),path=require('path');
async function child(client,mode){
 const net=require('net'),dns=require('dns');
 const initial={node:process.version,autoSelectFamily:net.getDefaultAutoSelectFamily(),attemptTimeout:net.getDefaultAutoSelectFamilyAttemptTimeout(),dnsOrder:dns.getDefaultResultOrder()};
 if(mode==='raised_timeout')net.setDefaultAutoSelectFamilyAttemptTimeout(1500);
 if(mode==='disabled')net.setDefaultAutoSelectFamily(false);
 if(mode==='ipv4first')dns.setDefaultResultOrder('ipv4first');
 if(mode==='ipv4'){const original=dns.lookup;dns.lookup=function(host,options,callback){if(typeof options==='function'){callback=options;options={}};return original.call(dns,host,{...(typeof options==='object'?options:{}),family:4},callback)}}
 let request;
 if(client==='n8n_http'){const root=require('path').dirname(require.resolve('n8n-core',{paths:['/usr/local/lib/node_modules/n8n']}));request=require(root+'/execution-engine/node-execution-context/utils/request-helper-functions.js').httpRequest;}
 console.log(JSON.stringify({type:'configuration',client,mode,initial,actual:{autoSelectFamily:net.getDefaultAutoSelectFamily(),attemptTimeout:net.getDefaultAutoSelectFamilyAttemptTimeout(),dnsOrder:dns.getDefaultResultOrder()},proxyConfigured:!!(process.env.HTTPS_PROXY||process.env.https_proxy)}));
 const codes=e=>[...new Set([e?.code,...(e?.errors||[]).flatMap(codes),...(e?.cause?codes(e.cause):[])].filter(Boolean))];
 for(let index=1;index<=100;index++){
  const at=new Date().toISOString(),start=performance.now();let status=null,errors=[];
  try{const headers={Authorization:'Bearer '+process.env.GROQ_API_KEY};
   if(client==='n8n_http'){const r=await request({method:'GET',url:'https://api.groq.com/openai/v1/models',headers,timeout:15000,abortSignal:AbortSignal.timeout(16000),returnFullResponse:true,ignoreHttpStatusErrors:true,disableFollowRedirect:true});status=r.statusCode;}
   else{const r=await fetch('https://api.groq.com/openai/v1/models',{headers,redirect:'error',signal:AbortSignal.timeout(15000)});status=r.status;await r.arrayBuffer();}
   if(status!==200)errors=['HTTP_'+status];
  }catch(e){errors=codes(e);if(!errors.length)errors=[e.name==='TimeoutError'?'DEADLINE_TIMEOUT':'NETWORK_ERROR'];}
  console.log(JSON.stringify({type:'request',client,mode,index,at,status,errors,elapsed_ms:Math.round(performance.now()-start)}));
  await new Promise(r=>setTimeout(r,100));
 }
}
if(require.main===module){const client=process.argv[2];if(!['n8n_http','fetch'].includes(client))throw Error('Select n8n_http or fetch');
 const out=path.resolve('documentation/local-signal-qualifier');fs.mkdirSync(out,{recursive:true});
 (async()=>{for(const mode of ['default','raised_timeout','disabled','ipv4','ipv4first'])await new Promise((resolve,reject)=>{
  const proc=cp.spawn('docker',['exec','-i','n8n','node','-']);const file=fs.createWriteStream(path.join(out,client+'-'+mode+'.jsonl'));
  proc.stdout.pipe(file);let count=0,buffer='';proc.stdout.on('data',b=>{buffer+=b;const lines=buffer.split('\n');buffer=lines.pop();for(const l of lines){try{const r=JSON.parse(l);if(r.type==='request'&&++count%25===0)console.log(client,mode,count+'/100')}catch{}}});proc.stderr.on('data',()=>console.error('Diagnostic child error; no error object printed to protect credentials'));proc.on('exit',c=>c===0?resolve():reject(Error('Probe exited '+c)));
  proc.stdin.end('('+child.toString()+')('+JSON.stringify(client)+','+JSON.stringify(mode)+').catch(()=>{console.error("probe_failed");process.exitCode=1})');
 })})().catch(e=>{console.error(e.message);process.exitCode=1});
}
