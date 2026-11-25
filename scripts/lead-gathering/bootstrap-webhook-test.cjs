// Run inside the n8n container. Credentials are copied privately, never logged.
const fs=require('node:fs'),cp=require('node:child_process');
const dir='/tmp/gathering-webhook-test';fs.mkdirSync(dir,{recursive:true,mode:0o700});
function cli(args,env=process.env){const r=cp.spawnSync('n8n',args,{env,encoding:'utf8'});if(r.status!==0)throw new Error('n8n '+args[0]+' failed: '+r.stderr+' '+r.stdout);console.log(args[0]+' succeeded');}
cli(['export:credentials','--id=gatheringTestPg','--decrypted','--output='+dir+'/test-pg.json']);fs.chmodSync(dir+'/test-pg.json',0o600);
const env={...process.env,DB_TYPE:'sqlite',N8N_USER_FOLDER:dir,N8N_PORT:'5680',N8N_DIAGNOSTICS_ENABLED:'false',N8N_VERSION_NOTIFICATIONS_ENABLED:'false',N8N_PERSONALIZATION_ENABLED:'false',N8N_RUNNERS_ENABLED:'false'};
cli(['import:credentials','--input='+dir+'/test-pg.json'],env);fs.unlinkSync(dir+'/test-pg.json');
cli(['import:credentials','--input=/tmp/gathering-auth.json'],env);
cli(['import:workflow','--input=/tmp/gathering-webhook-test.json'],env);
const workflows=JSON.parse(fs.readFileSync('/tmp/gathering-webhook-test.json','utf8'));
for(const w of workflows){if(!/^gatheringWebhookTest[0-9]+$/.test(w.id))throw Error('INVALID_ISOLATED_WORKFLOW_ID');cli(['update:workflow','--id='+w.id,'--active=true'],env);}
const log=fs.openSync(dir+'/server.log','a',0o600);
const child=cp.spawn('n8n',['start'],{env,detached:true,stdio:['ignore',log,log]});fs.writeFileSync(dir+'/server.pid',String(child.pid));child.unref();console.log('Isolated webhook server starting on port 5680.');
