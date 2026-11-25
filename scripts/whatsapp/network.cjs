'use strict';
const dns=require('node:dns').promises,https=require('node:https'),net=require('node:net'),{Readable}=require('node:stream');
function publicIPv4(ip){if(!net.isIPv4(ip))return false;const [a,b,c]=ip.split('.').map(Number);return a>0&&a<224&&a!==10&&a!==127&&!(a===100&&b>=64&&b<=127)&&!(a===169&&b===254)&&!(a===172&&b>=16&&b<=31)&&!(a===192&&(b===168||b===0||b===2))&&!(a===198&&(b===18||b===19||b===51&&c===100))&&!(a===203&&b===0&&c===113);}
async function resolveIPv4(){
 // Isolated instances: no OS DNS, Docker DNS or process-wide defaults changed.
 for(const servers of [null,['1.1.1.1'],['8.8.8.8']]){
  const resolver=new dns.Resolver({timeout:2000,tries:1});if(servers)resolver.setServers(servers);
  try{const addresses=await resolver.resolve4('graph.facebook.com'),ip=addresses.find(publicIPv4);if(ip)return ip;}catch{}
 }
 throw Error('META_DNS_UNAVAILABLE');
}
function scopedFetch(ports,readOnly,signup=false){return async(url,options)=>{
 const target=new URL(url);
 const keys=[...target.searchParams.keys()].sort().join(',');
 const route=signup?options?.method==='GET'&&(
  /^\/v\d{1,3}\.\d\/oauth\/access_token$/.test(target.pathname)&&keys==='client_id,client_secret,code'||
  /^\/v\d{1,3}\.\d\/debug_token$/.test(target.pathname)&&keys==='input_token'||
  /^\/v\d{1,3}\.\d\/\d{5,30}\/phone_numbers$/.test(target.pathname)&&!target.search
 ):readOnly?(options?.method==='GET'&&((/^\/v\d{1,3}\.\d\/\d{5,30}\/phone_numbers$/.test(target.pathname)&&!target.search)||(/^\/v\d{1,3}\.\d\/\d{5,30}\/message_templates$/.test(target.pathname)&&target.search==='?fields=id,name,language,status,category,components,parameter_format&limit=100'))):(options?.method==='POST'&&!target.search&&/^\/v\d{1,3}\.\d\/\d{5,30}\/messages$/.test(target.pathname));
 if(target.origin!=='https://graph.facebook.com'||target.username||target.password||target.hash||!route||options.redirect!=='error')throw Error('META_DESTINATION_REJECTED');
 const ip=await (ports.resolveIPv4||resolveIPv4)();if(!publicIPv4(ip))throw Error('META_PUBLIC_IP_REQUIRED');
 if(options.signal?.aborted)throw Error('META_REQUEST_ABORTED');
 return await new Promise((resolve,reject)=>{
  const lookup=(hostname,opts,cb)=>hostname==='graph.facebook.com'?cb(null,ip,4):cb(Error('META_DESTINATION_REJECTED'));
  const req=(ports.request||https.request)(target,{method:options.method,headers:options.headers,signal:options.signal,lookup,family:4,autoSelectFamily:false,agent:false},res=>resolve({status:res.statusCode,body:Readable.toWeb(res)}));
  req.on('error',()=>reject(Error('META_CONNECTION_UNCONFIRMED')));req.end(options.body);
 });
};}
function createFetch(ports={}){return scopedFetch(ports,false);}
function createReadFetch(ports={}){return scopedFetch(ports,true);}
function createSignupFetch(ports={}){return scopedFetch(ports,false,true);}
module.exports={publicIPv4,resolveIPv4,createFetch,createReadFetch,createSignupFetch};
