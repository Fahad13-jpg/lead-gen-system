'use strict';
// Exposes exactly one route, never n8n UI, API, other webhooks or credentials.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{authorized}=require('./tool-gateway.cjs');
const config=JSON.parse(fs.readFileSync(path.resolve('.local/calling-tools-20261028/private.json'),'utf8'));
http.createServer((req,res)=>{
 if(req.method!=='POST'||req.url!=='/tools'){res.writeHead(404);return res.end();}
 if(!authorized(req.headers,config.token)){res.writeHead(401);return res.end('{"ok":false,"reason":"unauthorized"}');}
 if(req.headers['content-type']?.split(';')[0]!=='application/json'){res.writeHead(415);return res.end();}
 let size=0,chunks=[];req.on('data',b=>{size+=b.length;if(size>262144){res.writeHead(413);res.end();req.destroy();}else chunks.push(b);});req.on('end',()=>{
  if(res.writableEnded)return;const body=Buffer.concat(chunks);
  const upstream=http.request({hostname:'127.0.0.1',port:5678,path:'/webhook/retell-call-tools-v1',method:'POST',timeout:50000,headers:{'content-type':'application/json','content-length':body.length,'x-call-tool-token':config.token}},response=>{res.writeHead(response.statusCode,{'content-type':'application/json','cache-control':'no-store'});response.pipe(res);});
  upstream.on('error',()=>{if(!res.headersSent)res.writeHead(503);res.end('{"ok":false,"reason":"backend_unavailable"}');});upstream.on('timeout',()=>upstream.destroy());upstream.end(body);
 });
}).listen(5689,'127.0.0.1',()=>console.log('Tool-only proxy ready on loopback:5689'));
