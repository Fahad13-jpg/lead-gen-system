const fs=require('node:fs'),cp=require('node:child_process');
const dir='/tmp/gathering-webhook-test';
(async()=>{
 const pid=Number(fs.readFileSync(dir+'/server.pid','utf8'));
 const cmd=fs.readFileSync('/proc/'+pid+'/cmdline','utf8');if(!cmd.includes('n8n'))throw new Error('Unexpected temporary server process');
 process.kill(pid,'SIGTERM');await new Promise(r=>setTimeout(r,2000));
 const env={...process.env,DB_TYPE:'sqlite',N8N_USER_FOLDER:dir,N8N_PORT:'5680',N8N_DIAGNOSTICS_ENABLED:'false',N8N_VERSION_NOTIFICATIONS_ENABLED:'false',N8N_PERSONALIZATION_ENABLED:'false',N8N_RUNNERS_ENABLED:'false'};
 for(const args of [['import:workflow','--input=/tmp/gathering-webhook-test.json'],['update:workflow','--all','--active=true']]){
  const r=cp.spawnSync('n8n',args,{env,encoding:'utf8'});if(r.status!==0)throw new Error(r.stdout+r.stderr);console.log(args[0]+' succeeded');
 }
 const log=fs.openSync(dir+'/server.log','a',0o600);const child=cp.spawn('n8n',['start'],{env,detached:true,stdio:['ignore',log,log]});fs.writeFileSync(dir+'/server.pid',String(child.pid));child.unref();console.log('Temporary test server restarted.');
})().catch(e=>{console.error(e.message);process.exitCode=1});
