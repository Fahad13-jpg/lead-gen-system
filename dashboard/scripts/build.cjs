'use strict';
const path=require('node:path'),{pathToFileURL}=require('node:url');
async function main(){
 const [major,minor]=process.versions.node.split('.').map(Number);
 if(major<24||major===24&&minor<12)throw Error('Build requires Node 24.12 or newer.');
 const root=path.resolve(__dirname,'..');
 const {build}=await import(pathToFileURL(require.resolve('vite',{paths:[root]})).href);
 await build({root,configFile:path.join(root,'vite.config.mjs')});
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={main};
