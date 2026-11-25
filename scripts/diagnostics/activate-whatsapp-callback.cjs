'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const dir='.local/whatsapp-callback',id='managedWhatsappCallback046';
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:180000,maxBuffer:30e6});assert.equal(r.status,0,'CALLBACK_SETUP_COMMAND_FAILED; private output suppressed');return r.stdout.trim();}
const sql=q=>docker(['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],q);
function snapshot(){return JSON.parse(sql("SELECT json_build_object('activities',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM outreach_activities t),'plans',(SELECT count(*) FROM strategy_plans),'workflows',(SELECT md5(coalesce(jsonb_agg(jsonb_build_object('id',id,'active',active,'nodes',nodes,'connections',connections) ORDER BY id)::text,'')) FROM workflow_entity WHERE id<>'managedWhatsappCallback046') )"));}
assert(!fs.existsSync(dir+'/activation-progress.json'),'INSPECT_EXISTING_PROGRESS_BEFORE_REPEAT');
const current=JSON.parse(docker(['inspect','n8n']))[0];assert(current.State.Running);
assert.equal(sql("SELECT count(*) FROM execution_entity WHERE status IN ('new','running','waiting')"),'0','EXECUTIONS_PRESENT');
assert.equal(sql("SELECT active FROM workflow_entity WHERE id='"+id+"'"),'f');
const state={before:snapshot(),callback_activated:false,recreated:false};fs.writeFileSync(dir+'/activation-progress.json',JSON.stringify(state,null,2));
const envFile=fs.readFileSync(dir+'/callback.env','utf8');assert(envFile.includes('WHATSAPP_CALLBACK_ENABLED=false'));
fs.writeFileSync(dir+'/callback.env.before',envFile,{mode:0o600});
fs.writeFileSync(dir+'/callback.env',envFile.replace('WHATSAPP_CALLBACK_ENABLED=false','WHATSAPP_CALLBACK_ENABLED=true'),{mode:0o600});
const project=current.Config.Labels['com.docker.compose.project'];assert(/^[a-z0-9_-]+$/.test(project));
const compose=['compose','-p',project,'-f',path.resolve('docker-compose.yml'),'-f',path.resolve(dir+'/compose.callback.yml')];
const planned=JSON.parse(docker([...compose,'config','--format','json'])).services.n8n;
const old=Object.fromEntries(current.Config.Env.map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1)];}));
for(const [key,value]of Object.entries(planned.environment))if(!key.startsWith('WHATSAPP_')&&key in old)assert.equal(String(value),old[key],'UNRELATED_ENV_CHANGE:'+key);
const image=JSON.parse(docker(['image','inspect',planned.image]))[0];assert.equal(image.Id,current.Image,'IMAGE_CHANGE_BLOCKED');
fs.writeFileSync(dir+'/callback-workflow-before.json',sql("SELECT row_to_json(w) FROM workflow_entity w WHERE id='"+id+"'"));
docker(['exec','n8n','n8n','update:workflow','--id='+id,'--active=true']);state.callback_activated=true;fs.writeFileSync(dir+'/activation-progress.json',JSON.stringify(state,null,2));
docker([...compose,'up','-d','--no-deps','--no-build','--pull','never','--force-recreate','n8n']);state.recreated=true;fs.writeFileSync(dir+'/activation-progress.json',JSON.stringify(state,null,2));
assert.deepEqual(snapshot(),state.before,'EXISTING_STATE_CHANGED');assert.equal(sql("SELECT active FROM workflow_entity WHERE id='"+id+"'"),'t');
console.log(JSON.stringify({callback_only_active:true,dispatch_disabled:true,existing_state_preserved:true,messages_sent:0,tunnel_started:false}));
