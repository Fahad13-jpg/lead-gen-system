'use strict';
// No plaintext dump is written to disk. The backup key is not included in backups.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const{Readable}=require('node:stream');const crypto=require('./backup-crypto.cjs');
const defaults=['.env','.local/gathering-api-key','.local/n8n-api-key','.local/n8n-api-key.txt','.local/credential-adapter/gateway.json','.local/credential-adapter/token','.local/gmail-onboarding/config.json','.local/gmail-onboarding/state.key','.local/sms-gate/config.json','.local/sms-gate/encryption.key','.local/calling-accounts/encryption.key','.local/calling-tools-20261028/private.json','.local/whatsapp-embedded-signup/config.private.json'];
function command(args){const child=cp.spawn('docker',args,{windowsHide:true,stdio:['pipe','pipe','pipe']});child.stdin.end();child.stderr.resume();const done=new Promise((resolve,reject)=>{child.on('error',()=>reject(Error('BACKUP_COMMAND_UNAVAILABLE')));child.on('close',code=>code===0?resolve():reject(Error('BACKUP_COMMAND_FAILED')));});done.catch(()=>{});return{child,done};}
async function artifact(dir,name,key,source,done=Promise.resolve()){
 const partial=path.join(dir,name+'.partial'),target=path.join(dir,name);
 try{await Promise.all([crypto.encrypt(source,partial,key),done]);const result=await crypto.verify(partial,key);if(!result.bytes)throw Error('BACKUP_EMPTY');await fs.promises.rename(partial,target);return{name,...result};}
 catch(e){source.destroy();await fs.promises.unlink(partial).catch(()=>{});throw e;}
}
async function backup({root=path.resolve(__dirname,'../..'),output,keyFile,files=defaults,postgres='postgres_db',n8n='n8n',user='n8n_user',database='lead_db'}){
 const key=crypto.keyFile(keyFile),dir=path.resolve(output);if(fs.existsSync(dir))throw Error('BACKUP_OUTPUT_EXISTS');fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const records=[];
 try{
  const dump=command(['exec','-i',postgres,'pg_dump','-U',user,'-d',database,'-Fc']);try{records.push(await artifact(dir,'database.lgb',key,dump.child.stdout,dump.done));}finally{dump.child.kill();}
  const config=command(['exec','-i',n8n,'tar','-czf','-','-C','/home/node/.n8n','.']);try{records.push(await artifact(dir,'n8n-runtime.lgb',key,config.child.stdout,config.done));}finally{config.child.kill();}
  const fileList=files.map(relative=>({name:relative,file:path.resolve(root,relative)}));
  fileList.push(...require('./recovery-journals.cjs').collect(root));
  const required=new Set(['external/firebase-admin.json']);
  // These two references can live outside the repository. Encrypt their contents;
  // recovery requires an explicit mapping rather than writing the source path.
  const firebase=process.env.DASHBOARD_FIREBASE_CREDENTIAL||path.join(process.env.USERPROFILE||process.env.HOME||'','Downloads','firebase-admin.json');fileList.push({name:'external/firebase-admin.json',file:firebase});
  const gmailConfig=path.resolve(root,'.local/gmail-onboarding/config.json');if(fs.existsSync(gmailConfig)){const cfg=JSON.parse(fs.readFileSync(gmailConfig,'utf8'));required.add('.local/gmail-onboarding/state.key');required.add('external/gmail-oauth-client.json');if(cfg.client_file)fileList.push({name:'external/gmail-oauth-client.json',file:path.resolve(root,cfg.client_file)});}
  if(fs.existsSync(path.resolve(root,'.local/sms-gate/config.json')))required.add('.local/sms-gate/encryption.key');
  if(fs.existsSync(path.resolve(root,'.local/credential-adapter/gateway.json')))required.add('.local/credential-adapter/token');
  const saved=[],missing=[];for(const entry of fileList){if(!fs.existsSync(entry.file)){missing.push(entry.name);continue;}const stat=fs.statSync(entry.file);if(!stat.isFile()||stat.size>1048576)throw Error('BACKUP_SECRET_FILE_INVALID');saved.push({name:entry.name,data:fs.readFileSync(entry.file).toString('base64')});}
  if([...required].some(name=>!saved.some(entry=>entry.name===name)))throw Error('BACKUP_REQUIRED_SECRET_MISSING');
  records.push(await artifact(dir,'runtime-secrets.lgb',key,Readable.from([JSON.stringify({files:saved,missing})])));
  const manifest={format:1,created_at:new Date().toISOString(),database,postgres,n8n,artifacts:records,secret_files:saved.map(v=>v.name),missing_secret_files:missing,source_release:'workspace snapshot; keep a separate reviewed source release'};
  await artifact(dir,'manifest.lgb',key,Readable.from([JSON.stringify(manifest)]));
  fs.writeFileSync(path.join(dir,'complete.json'),JSON.stringify({format:1,created_at:manifest.created_at,encrypted_artifacts:4,complete:true}),{flag:'wx',mode:0o600});return{directory:dir,encrypted_artifacts:4,secret_files:saved.length,missing_secret_files:missing.length};
 }catch(e){fs.writeFileSync(path.join(dir,'INCOMPLETE'),e.message,{mode:0o600});throw e;}
}
async function verify({directory,keyFile}){
 const key=crypto.keyFile(keyFile),dir=path.resolve(directory);if(!fs.existsSync(path.join(dir,'complete.json'))||fs.existsSync(path.join(dir,'INCOMPLETE')))throw Error('BACKUP_INCOMPLETE');
 const manifest=await crypto.readSmall(path.join(dir,'manifest.lgb'),key);if(manifest.format!==1||!Array.isArray(manifest.artifacts)||manifest.artifacts.length!==3)throw Error('BACKUP_MANIFEST_INVALID');
 const names=new Set();for(const entry of manifest.artifacts){if(!['database.lgb','n8n-runtime.lgb','runtime-secrets.lgb'].includes(entry.name)||names.has(entry.name))throw Error('BACKUP_MANIFEST_INVALID');names.add(entry.name);const actual=await crypto.verify(path.join(dir,entry.name),key);if(actual.bytes!==entry.bytes||actual.sha256!==entry.sha256)throw Error('BACKUP_DIGEST_MISMATCH');}
 return manifest;
}
if(require.main===module){const[mode,keyFile,output]=process.argv.slice(2);if(!['create','verify'].includes(mode)||!keyFile||!output){console.error('Usage: node scripts/operations/backup.cjs create|verify KEY_FILE NEW_DIRECTORY');process.exitCode=1;}else(mode==='create'?backup({keyFile,output}):verify({directory:output,keyFile}).then(m=>({verified:true,artifacts:m.artifacts.length,missing_secret_files:m.missing_secret_files.length}))).then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('BACKUP_FAILED; retain the source system and inspect the protected backup directory.');process.exitCode=1;});}
module.exports={backup,verify};
