'use strict';
const cp=require('child_process'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const dir=path.resolve('.local/scratch-diagnostics-20261011');fs.mkdirSync(dir,{recursive:true});
const run=(args,opts={})=>cp.execFileSync('docker',args,{encoding:'utf8',maxBuffer:4e6,...opts}).trim();
const image=run(['inspect','n8n','--format','{{.Image}}']);
const networks=JSON.parse(run(['inspect','n8n','--format','{{json .NetworkSettings.Networks}}']));const network=Object.keys(networks)[0];
const names=['lead_diag_base_20261011','lead_diag_noipv6_20261011','lead_diag_nodeoff_20261011','lead_diag_nodetimeout_20261011'];
for(const [i,name] of names.entries()){
 const existing=cp.spawnSync('docker',['inspect',name],{stdio:'ignore'}).status===0;if(existing)throw Error('Scratch name already exists: '+name);
 const extra=i===1?['--sysctl','net.ipv6.conf.all.disable_ipv6=1','--sysctl','net.ipv6.conf.default.disable_ipv6=1']:i===2?['-e','NODE_OPTIONS=--no-network-family-autoselection']:i===3?['-e','NODE_OPTIONS=--network-family-autoselection-attempt-timeout=1500']:[];
 run(['run','-d','--name',name,'--label','codex.scratch=lead-diagnostic-20261011','--network',network,...extra,'--entrypoint','node',image,'-e','setInterval(()=>{},1000)']);
 console.log(name,run(['exec',name,'node','-e',"console.log(JSON.stringify({node:process.version,autoSelectFamily:require('net').getDefaultAutoSelectFamily(),timeout:require('net').getDefaultAutoSelectFamilyAttemptTimeout(),ipv6_disabled:require('fs').readFileSync('/proc/sys/net/ipv6/conf/all/disable_ipv6','utf8').trim()}))"]));
}
const backup=path.join(dir,'lead_db-latest.dump');const dump=cp.execFileSync('docker',['exec','postgres_db','pg_dump','-U','n8n_user','-d','lead_db','-Fc'],{maxBuffer:200e6});fs.writeFileSync(backup,dump);
const dbName='scratch_lead_diag_20261011',pg='lead_diag_pg_20261011',pgImage=run(['inspect','postgres_db','--format','{{.Image}}']);
run(['run','-d','--name',pg,'--label','codex.scratch=lead-diagnostic-20261011','--network','none','-e','POSTGRES_USER=n8n_user','-e','POSTGRES_DB='+dbName,'-e','POSTGRES_PASSWORD',pgImage],{env:{...process.env,POSTGRES_PASSWORD:crypto.randomBytes(24).toString('hex')}});
async function main(){for(let i=0;i<30;i++){if(cp.spawnSync('docker',['exec',pg,'pg_isready','-U','n8n_user','-d',dbName],{stdio:'ignore'}).status===0)break;await new Promise(r=>setTimeout(r,1000));}
 const restore=cp.spawnSync('docker',['exec','-i',pg,'pg_restore','-U','n8n_user','-d',dbName,'--no-owner','--exit-on-error'],{input:dump,maxBuffer:4e6});
 if(restore.status!==0){fs.writeFileSync(path.join(dir,'restore-errors.txt'),restore.stderr);throw Error('Scratch restore failed; details saved privately');}
 fs.writeFileSync(path.join(dir,'environment.json'),JSON.stringify({names,pg,dbName,image,pgImage,backup,backup_at:new Date().toISOString(),backup_bytes:dump.length,restore:'success',network},null,2));console.log('Restored fresh read-only backup into isolated database '+dbName);}
main().catch(e=>{console.error(e.message);process.exitCode=1});
