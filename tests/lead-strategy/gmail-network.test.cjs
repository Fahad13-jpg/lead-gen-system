'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {install}=require('../../scripts/network/gmail-ipv4.cjs');
test('only Gmail API and OAuth resolve as IPv4; preserve lookup shape',()=>{
 const calls=[],dns={lookup(...args){calls.push(args);return 42;}};const original=dns.lookup,restore=install(dns),cb=()=>{};
 assert.equal(dns.lookup('gmail.googleapis.com',cb),42);assert.deepEqual(calls.pop(),['gmail.googleapis.com',{family:4},cb]);
 dns.lookup('OAUTH2.GOOGLEAPIS.COM.',{all:true,hints:32,verbatim:true},cb);assert.deepEqual(calls.pop()[1],{all:true,hints:32,verbatim:true,family:4});
 dns.lookup('gmail.googleapis.com',6,cb);assert.deepEqual(calls.pop()[1],{family:4});
 for(const host of ['api.apify.com','api.groq.com','emailvalidation.abstractapi.com','postgres','example.com','gmail.googleapis.com.attacker.test','127.0.0.1']){
  const options={family:6,all:true};dns.lookup(host,options,cb);assert.deepEqual(calls.pop(),[host,options,cb]);
 }
 restore();assert.equal(dns.lookup,original);
});
test('loading as a normal module does not replace DNS',()=>{const dns=require('node:dns'),before=dns.lookup;require('../../scripts/network/gmail-ipv4.cjs');assert.equal(dns.lookup,before);});
test('Node --require actually installs the scoped preload',()=>{
 const cp=require('node:child_process'),path=require('node:path');
 const r=cp.spawnSync(process.execPath,['--require',path.resolve('scripts/network/gmail-ipv4.cjs'),'-e','const d=require("dns"); if(d.lookup.name!=="lookup"||!d.lookup.toString().includes("hosts.has"))process.exit(1)'],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
});
