'use strict';
const http=require('node:http'),crypto=require('node:crypto'),fs=require('node:fs');
function createServer({token,operations}){
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw Error('CREDENTIAL_ADAPTER_SETUP_REQUIRED');
 let active=0;
 const routes={'/v1/encrypt':'encrypt','/v1/rotate-gmail':'gmail','/v1/rotate-smtp':'smtp','/v1/runtime-check':'hashes'};
 const safe=new Set(['GMAIL_RECONNECT_IDENTITY_REVIEW_REQUIRED','GMAIL_RECONNECT_ACCOUNT_MISMATCH','CREDENTIAL_INPUT_INVALID']);
 const server=http.createServer(async(req,res)=>{
  const reply=(status,value)=>{if(res.destroyed||res.writableEnded)return;res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
  if(req.url==='/health/live'&&req.method==='GET')return reply(200,{status:'ok'});
  const received=Buffer.from(req.headers.authorization||''),expected=Buffer.from('Bearer '+token);
  if(received.length!==expected.length||!crypto.timingSafeEqual(received,expected))return reply(401,{error:'UNAUTHORIZED'});
  if(req.method!=='POST'||!Object.hasOwn(routes,req.url))return reply(404,{error:'NOT_FOUND'});
  if(req.headers['content-type']!=='application/json')return reply(415,{error:'JSON_REQUIRED'});
  if(active>=4)return reply(503,{error:'CREDENTIAL_ADAPTER_BUSY'});
  active++;try{const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>196608)return reply(413,{error:'INPUT_TOO_LARGE'});chunks.push(chunk);}let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return reply(400,{error:'CREDENTIAL_INPUT_INVALID'});}
   if(!body||typeof body!=='object'||Array.isArray(body))return reply(400,{error:'CREDENTIAL_INPUT_INVALID'});
   const value=operations[routes[req.url]](body);reply(200,{value});
  }catch(error){reply(422,{error:safe.has(error.message)?error.message:'CREDENTIAL_OPERATION_UNCONFIRMED'});}finally{active--;}
 });server.requestTimeout=15000;server.headersTimeout=5000;server.maxHeadersCount=20;server.maxRequestsPerSocket=50;return server;
}
function main(){
 const root='/usr/local/lib/node_modules/n8n',config=JSON.parse(fs.readFileSync(process.env.N8N_CONFIG_FILE||'/home/node/.n8n/config','utf8'));
 const key=process.env.N8N_ENCRYPTION_KEY||config.encryptionKey;if(typeof key!=='string'||!key)throw Error('CREDENTIAL_ADAPTER_SETUP_REQUIRED');
 const{Cipher}=require(require.resolve('n8n-core',{paths:[root]})),token=fs.readFileSync(process.env.CREDENTIAL_ADAPTER_TOKEN_FILE||'/run/secrets/credential-adapter-token','utf8').trim();
 const server=createServer({token,operations:require('./operations.cjs').operations({cipher:new Cipher({encryptionKey:key})})});
 server.listen(3013,'0.0.0.0',()=>console.log('CREDENTIAL_ADAPTER_READY'));
 const stop=()=>server.close(()=>process.exit(0));process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
if(require.main===module)try{main();}catch{console.error('CREDENTIAL_ADAPTER_SETUP_UNAVAILABLE');process.exitCode=1;}
module.exports={createServer};
