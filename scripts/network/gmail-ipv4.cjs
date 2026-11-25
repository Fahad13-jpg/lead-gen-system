'use strict';
// Optional Node preload. Only Gmail API/OAuth DNS lookups use IPv4.
// No retries, endpoint substitutions, TLS changes or credential handling.
function install(dns=require('node:dns')) {
 const original=dns.lookup;
 const hosts=new Set(['gmail.googleapis.com','oauth2.googleapis.com']);
 function lookup(hostname,options,callback){
  if(typeof hostname!=='string'||!hosts.has(hostname.toLowerCase().replace(/\.$/,'')))return original.apply(dns,arguments);
  if(typeof options==='function'){callback=options;options={};}
  const selected={...(options&&typeof options==='object'?options:{}),family:4};
  return original.call(dns,hostname,selected,callback);
 }
 dns.lookup=lookup;
 return ()=>{if(dns.lookup===lookup)dns.lookup=original;};
}
module.exports={install};
// --require loads this file without a parent. Normal imports remain side-effect free.
if(!module.parent||module.parent.id==='internal/preload')install();
