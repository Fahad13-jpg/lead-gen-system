'use strict';
// Local files only. Does not modify compose/env, restart n8n, expose a tunnel,
// activate a workflow or register with Meta. Never prints either secret.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function prepare(root='.local/whatsapp-callback'){
 const dir=path.resolve(root),base=path.resolve('.local')+path.sep;
 if(!dir.startsWith(base))throw Error('LOCAL_PRIVATE_DIRECTORY_REQUIRED');
 fs.mkdirSync(dir,{recursive:true});
 const tokenFile=path.join(dir,'verify-token.txt'),secretFile=path.join(dir,'app-secret.txt');
 if(!fs.existsSync(tokenFile))fs.writeFileSync(tokenFile,crypto.randomBytes(32).toString('hex'),{mode:0o600,flag:'wx'});
 if(!fs.existsSync(secretFile))fs.writeFileSync(secretFile,'',{mode:0o600,flag:'wx'});
 const token=fs.readFileSync(tokenFile,'utf8').trim(),secret=fs.readFileSync(secretFile,'utf8').trim();
 if(!/^[a-f0-9]{64}$/.test(token))throw Error('VERIFY_TOKEN_INVALID');
 // Meta app-secret format is hexadecimal. Reject newlines/assignments rather
 // than copying arbitrary file content into an environment file.
 const ready=/^[a-f0-9]{32}$/i.test(secret),envFile=path.join(dir,'callback.env');
 let enabled=false;
 if(ready&&fs.existsSync(envFile)){
  const saved=Object.fromEntries(fs.readFileSync(envFile,'utf8').trim().split(/\r?\n/).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));
  if(saved.WHATSAPP_VERIFY_TOKEN!==token||saved.WHATSAPP_APP_SECRET!==secret)throw Error('CALLBACK_SECRET_ROTATION_REQUIRES_REVIEW');
  if(!['true','false'].includes(saved.WHATSAPP_CALLBACK_ENABLED))throw Error('CALLBACK_ENABLE_STATE_INVALID');
  enabled=saved.WHATSAPP_CALLBACK_ENABLED==='true';
 }
 else if(ready)fs.writeFileSync(envFile,'WHATSAPP_CALLBACK_ENABLED=false\nWHATSAPP_VERIFY_TOKEN='+token+'\nWHATSAPP_APP_SECRET='+secret+'\n',{mode:0o600});
 else if(fs.existsSync(envFile))throw Error('APP_SECRET_INVALID_EXISTING_ENV_NOT_CHANGED');
 const statusFile=path.join(dir,'status.json');
 const previous=fs.existsSync(statusFile)?JSON.parse(fs.readFileSync(statusFile,'utf8')):{};
 const status={...previous,verify_token_prepared:true,app_secret_present:ready,environment_file_prepared:ready,callback_enabled:enabled,applied_to_n8n:previous.applied_to_n8n===true,secrets_printed:false};
 fs.writeFileSync(path.join(dir,'status.json'),JSON.stringify(status,null,2)+'\n');return status;
}
module.exports={prepare};if(require.main===module)console.log(JSON.stringify(prepare()));
