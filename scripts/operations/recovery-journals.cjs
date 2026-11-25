'use strict';
const fs=require('node:fs'),path=require('node:path');
function collect(root,{maxFiles=2000,maxBytes=16777216}={}){
 const workspace=fs.realpathSync(root),files=[];let bytes=0;
 function visit(relative,depth=0){
  if(depth>10)throw Error('BACKUP_JOURNAL_LIMIT');const target=path.resolve(workspace,relative);
  if(!target.startsWith(workspace+path.sep))throw Error('BACKUP_JOURNAL_PATH_INVALID');
  if(!fs.existsSync(target))return;const stat=fs.lstatSync(target);
  if(stat.isSymbolicLink())throw Error('BACKUP_JOURNAL_LINK_REJECTED');
  if(stat.isDirectory()){for(const entry of fs.readdirSync(target))visit(path.join(relative,entry),depth+1);return;}
  if(!stat.isFile()||stat.size>1048576)throw Error('BACKUP_JOURNAL_FILE_INVALID');
  bytes+=stat.size;if(files.length>=maxFiles||bytes>maxBytes)throw Error('BACKUP_JOURNAL_LIMIT');
  files.push({name:relative.split(path.sep).join('/'),file:target});
 }
 for(const directory of ['.local/smtp-provisioning','.local/campaign-slices'])visit(directory);
 return files;
}
module.exports={collect};
