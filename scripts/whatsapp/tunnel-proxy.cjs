'use strict';
const http=require('node:http'),fs=require('node:fs'),cb=require('./callback.cjs');
function authorize(method,url,headers,raw,secrets){
 const parsed=new URL(url,'http://localhost');
 if(parsed.pathname!=='/whatsapp-meta'||!['GET','POST'].includes(method))return {status:404};
 if(method==='GET'){
  if(parsed.search.length>4096)return {status:400};
  const keys=['hub.mode','hub.verify_token','hub.challenge'];
  if(keys.some(k=>parsed.searchParams.getAll(k).length!==1))return {status:400};
  const q=Object.fromEntries(keys.map(k=>[k,parsed.searchParams.get(k)]));
  const result=cb.challenge(q,secrets.verifyToken);
  return result.status===200?{status:200,path:'/webhook/whatsapp-meta?'+new URLSearchParams(q)}:{status:403};
 }
 if(parsed.search||headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json')return {status:415};
 try{cb.parse(raw,headers['x-hub-signature-256'],secrets.appSecret);return {status:200,path:'/webhook/whatsapp-meta'};}catch{return {status:401};}
}
function create(secrets){return http.createServer((req,res)=>{
 // No request logging: query strings can contain the verification token.
 res.setHeader('cache-control','no-store');
 let size=0,chunks=[];req.on('error',()=>{if(!res.writableEnded)res.end();});
 req.on('data',b=>{size+=b.length;if(size>262144){res.writeHead(413);res.end();req.destroy();}else chunks.push(b);});
 req.on('end',()=>{
  if(res.writableEnded)return;const raw=Buffer.concat(chunks),gate=authorize(req.method,req.url,req.headers,raw,secrets);
  if(gate.status!==200){res.writeHead(gate.status);return res.end();}
  const headers=req.method==='POST'?{'content-type':'application/json','content-length':raw.length,'x-hub-signature-256':req.headers['x-hub-signature-256']}:{};
  const upstream=http.request({hostname:'127.0.0.1',port:5678,path:gate.path,method:req.method,headers,timeout:15000},reply=>{res.writeHead(reply.statusCode,{'content-type':'text/plain','cache-control':'no-store'});reply.pipe(res);});
  upstream.on('error',()=>{if(!res.headersSent)res.writeHead(503);if(!res.writableEnded)res.end('BACKEND_UNAVAILABLE');});upstream.on('timeout',()=>upstream.destroy());
  res.on('close',()=>{if(!res.writableFinished)upstream.destroy();});upstream.end(raw);
 });
});}
module.exports={authorize,create};
if(require.main===module){const secret=fs.readFileSync('.local/whatsapp-callback/app-secret.txt','utf8').trim(),token=fs.readFileSync('.local/whatsapp-callback/verify-token.txt','utf8').trim();if(!/^[a-f0-9]{32}$/i.test(secret)||!/^[a-f0-9]{64}$/.test(token))throw Error('CALLBACK_SECRETS_REQUIRED');const server=create({appSecret:secret,verifyToken:token});server.requestTimeout=20000;server.headersTimeout=10000;server.listen(5690,'127.0.0.1',()=>console.log('WhatsApp-only proxy listening on loopback:5690; no tunnel started'));}
