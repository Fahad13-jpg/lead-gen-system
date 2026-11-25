'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),{promisify}=require('node:util');
const profiles=require('../credential-adapter/runtime-files.cjs');
async function matches(profile){
 if(!Object.hasOwn(profiles,profile))throw Error('RUNTIME_PROFILE_INVALID');const files=profiles[profile],adapter=require('./credential-adapter-client.cjs').fromEnvironment();let remote;
 if(adapter)remote=await adapter.runtimeHashes(profile);
 else{const program=`const f=require('fs'),c=require('crypto');console.log(JSON.stringify(Object.fromEntries(${JSON.stringify(Object.keys(files))}.map(p=>[p,f.existsSync('/home/node/.n8n/custom/'+p)?c.createHash('sha256').update(f.readFileSync('/home/node/.n8n/custom/'+p)).digest('hex'):null]))));`;const result=await promisify(cp.execFile)('docker',['exec','n8n','node','-e',program],{windowsHide:true,timeout:30000,maxBuffer:10000});remote=JSON.parse(result.stdout);}
 for(const[file,source]of Object.entries(files))if(remote?.[file]!==crypto.createHash('sha256').update(await fs.readFile(path.resolve(__dirname,'../..',source))).digest('hex'))return false;return true;
}
module.exports={matches};
