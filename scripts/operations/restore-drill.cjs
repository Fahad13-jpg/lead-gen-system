'use strict';
// Restores only to a newly created, randomly named database; never lead_db.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),random=require('node:crypto');
const{verify}=require('./backup.cjs'),{decrypt,keyFile}=require('./backup-crypto.cjs');
function exec(args){return cp.execFileSync('docker',args,{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']});}
async function drill({directory,keyFile:secretFile}){
 const manifest=await verify({directory,keyFile:secretFile}),key=keyFile(secretFile),target='lead_restore_check_'+random.randomBytes(8).toString('hex');
 if(!/^lead_restore_check_[a-f0-9]{16}$/.test(target))throw Error('RESTORE_TARGET_INVALID');
 const container=manifest.postgres;if(!/^[a-zA-Z0-9_-]+$/.test(container))throw Error('RESTORE_CONTAINER_INVALID');
 const user='n8n_user';let created=false;
 try{
  exec(['exec',container,'createdb','-U',user,'--template=template0',target]);created=true;
  const child=cp.spawn('docker',['exec','-i',container,'pg_restore','-U',user,'--no-owner','--no-acl','--exit-on-error','-d',target],{windowsHide:true,stdio:['pipe','ignore','pipe']});child.stderr.resume();
  const done=new Promise((resolve,reject)=>{child.on('error',()=>reject(Error('RESTORE_COMMAND_UNAVAILABLE')));child.on('close',code=>code===0?resolve():reject(Error('RESTORE_FAILED')));});done.catch(()=>{});
  try{await Promise.all([decrypt(path.join(directory,'database.lgb'),key,child.stdin),done]);}finally{child.kill();}
  const rows=exec(['exec',container,'psql','-U',user,'-d',target,'-At','-v','ON_ERROR_STOP=1','-c',"BEGIN READ ONLY; SELECT json_build_object('organizations',(SELECT count(*) FROM organizations),'businesses',(SELECT count(*) FROM cleaned_leads),'workflows',(SELECT count(*) FROM workflow_entity),'gmail_state_table',to_regclass('gmail_oauth_sessions') IS NOT NULL); ROLLBACK;"]);
  const result=JSON.parse(rows.split(/\r?\n/).find(line=>line.startsWith('{')));if(!result.gmail_state_table)throw Error('RESTORE_SCHEMA_INCOMPLETE');return{restored:true,isolated_database:true,...result,production_database_modified:false,messages_sent:0};
 }finally{if(created)exec(['exec',container,'dropdb','-U',user,target]);}
}
if(require.main===module){const[key,directory]=process.argv.slice(2);if(!key||!directory){console.error('Usage: node scripts/operations/restore-drill.cjs KEY_FILE BACKUP_DIRECTORY');process.exitCode=1;}else drill({directory,keyFile:key}).then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('RESTORE_DRILL_FAILED; production database was not targeted.');process.exitCode=1;});}
module.exports={drill};
