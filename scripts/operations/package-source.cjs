'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const tag=process.env.RELEASE_TAG||'20261123';
if(!/^20[0-9]{6}(?:-[1-9][0-9]*)?$/.test(tag))throw Error('RELEASE_TAG_INVALID');
const output=path.join(root,`releases/leadmorrow-deploy-${tag}.tar.gz`);
const listFile=path.join(root,`.local/deploy-source-files-${tag}.txt`);
const names=[];
function walk(relative){for(const item of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){const rel=(relative+'/'+item.name).replaceAll('\\','/');if(item.isDirectory()){if(['node_modules','.local','.git','diagnostics'].includes(item.name))continue;walk(rel);}else if(item.isFile()){
 if((item.name.startsWith('.env')||item.name.endsWith('.env'))&&item.name!=='.env.example')continue;
 if(/\.(?:key|pem|dump|log)$/i.test(item.name)||/client_secret|firebase-admin|backup\.sql/i.test(item.name))continue;
 names.push(rel);
}}}
for(const dir of ['scripts','workflows','deployment','dashboard/src','dashboard/public','dashboard/scripts','dashboard/build','database/migrations'])walk(dir);
for(const file of ['dashboard/package.json','dashboard/package-lock.json','dashboard/vite.config.mjs','dashboard/index.html','dashboard/.env.example'])names.push(file);
names.sort();fs.writeFileSync(listFile,names.join('\n')+'\n');
if(fs.existsSync(output))throw Error('PACKAGE_EXISTS_DO_NOT_OVERWRITE');
const tarCommand=process.platform==='win32'?'tar.exe':'tar';
const run=cp.spawnSync(tarCommand,['-czf',output,'-T',listFile],{cwd:root,encoding:'utf8',timeout:120000,windowsHide:true});
if(run.error||run.status!==0)throw Error('PACKAGE_FAILED '+(run.error?.message||run.stderr||`exit_${run.status}`));
const sha256=crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex');
fs.writeFileSync(output+'.sha256',sha256+'  '+path.basename(output)+'\n');
console.log(JSON.stringify({file:output,files:names.length,bytes:fs.statSync(output).size,sha256,contains_database_data:false,contains_private_environment:false}));
