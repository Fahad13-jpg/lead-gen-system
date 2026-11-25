'use strict';
// Optional preload for Google authentication in networks without working IPv6 routes.
// Hostnames, TLS verification, permissions and retry behavior remain unchanged.
function install(dns=require('node:dns')){
 const original=dns.lookup;
 const hosts=new Set(['oauth2.googleapis.com','www.googleapis.com','identitytoolkit.googleapis.com','securetoken.googleapis.com','firebase.googleapis.com']);
 function lookup(hostname,options,callback){
  if(typeof hostname!=='string'||!hosts.has(hostname.toLowerCase().replace(/\.$/,'')))return original.apply(dns,arguments);
  if(typeof options==='function'){callback=options;options={};}
  return original.call(dns,hostname,{...(options&&typeof options==='object'?options:{}),family:4},callback);
 }
 dns.lookup=lookup;
 return()=>{if(dns.lookup===lookup)dns.lookup=original;};
}
module.exports={install};
if(!module.parent||module.parent.id==='internal/preload')install();
