'use strict';
// Authorized draft-only rollout. No AI allowance, ledger, sender activation or migration 016 changes.
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),assert=require('node:assert/strict');
const dir=path.resolve('.local/strategy-v2-deployment-20261014'),id='27W04lgTGdgFMWUx';
const before=JSON.parse(fs.readFileSync(path.join(dir,'before.json'),'utf8'));
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:300000,maxBuffer:20e6});if(r.status!==0){fs.writeFileSync(path.join(dir,'last-error.log'),(r.stdout||'')+(r.stderr||''));throw Error('Docker operation failed; private diagnostic saved');}return r.stdout.trim();}
function sql(s){return docker(['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],s);}
function control(enabled){sql('UPDATE strategy_controls SET enabled='+Boolean(enabled)+' WHERE id;');}
function runCli(args){return docker(['exec','n8n','n8n',...args]);}
function importFile(file){docker(['cp',file,'n8n:/tmp/strategy-v2-import.json']);runCli(['import:workflow','--input=/tmp/strategy-v2-import.json','--projectId=xLW48WqYIkxblH0N']);runCli(['update:workflow','--id='+id,'--active='+before.workflow.active]);}
function composeUp(){docker(['compose','up','-d','--no-deps','--pull','never','n8n']);}
async function healthy(){for(let i=0;i<45;i++){try{const r=await fetch('http://127.0.0.1:5678/healthz',{signal:AbortSignal.timeout(2000)});if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,1000));}throw Error('n8n health check failed');}
async function main(){
 const action=process.argv[2];
 if(action==='apply'){
  assert(fs.statSync(path.join(dir,'before.dump')).size>1000,'Backup required');
  assert.equal(sql("SELECT count(*) FROM strategy_jobs WHERE status IN ('pending','processing')"),'0','Pending planner work must be reviewed first');
  assert.equal(sql("SELECT count(*) FROM strategy_ai_controls WHERE enabled OR monthly_limit<>0"),'0','AI allowance must stay zero');
  assert.equal(sql("SELECT count(*) FROM workflow_entity WHERE active AND name ~* '(^7[A-D]? |^8 |outreach executor|follow.?up manager)'"),'0','Sending workflows must be inactive');
  assert.equal(sql("SELECT count(*) FROM pg_proc WHERE proname='strategy_reservation_context'"),'0','Unexpected prior migration; inspect first');
  const desired=JSON.parse(fs.readFileSync('workflows/06C_outreach_strategy_generator.json'));
  assert.deepEqual(desired.connections,before.workflow.connections);
  assert.equal(desired.nodes.length,before.workflow.nodes.length);
  const strip=w=>w.nodes.map(n=>{n=structuredClone(n);if(n.type==='n8n-nodes-base.code')delete n.parameters.jsCode;return n;});
  assert.deepEqual(strip(desired),strip(before.workflow),'Non-code configuration changed');
  const staged={...desired,id,active:false};fs.writeFileSync(path.join(dir,'import.json'),JSON.stringify(staged));
  fs.writeFileSync(path.join(dir,'rollback-workflow.json'),JSON.stringify({...before.workflow,active:false}));
  const compose=fs.readFileSync('docker-compose.yml','utf8');
  fs.writeFileSync(path.join(dir,'compose-before.yml'),compose.replace(/^      - (?:NODE_FUNCTION_ALLOW_BUILTIN=crypto|N8N_RUNNERS_ENABLED=false|STRATEGY_CONTRACT_VERSION=strategy_v2)\r?\n/gm,''));
  fs.writeFileSync(path.join(dir,'apply-started.json'),JSON.stringify({at:new Date().toISOString()}),{flag:'wx'});
  control(false);
  sql(fs.readFileSync('database/migrations/017_strategy_v2_compatibility.sql','utf8'));
  console.log('Applied migration 017. Planner claims paused, AI unchanged.');
  importFile(path.join(dir,'import.json'));
  console.log('06C imported; restarting only n8n with the tested settings.');
  composeUp();await healthy();console.log('n8n is healthy. Planner remains paused pending verification.');
 }else if(action==='verify'){
  await healthy();
  const live=JSON.parse(sql("SELECT row_to_json(w) FROM workflow_entity w WHERE id='"+id+"'"));
  const desired=JSON.parse(fs.readFileSync(path.join(dir,'import.json')));
  assert.deepEqual(live.nodes,desired.nodes);assert.deepEqual(live.connections,desired.connections);assert.equal(live.active,before.workflow.active);
  assert.equal(sql("SELECT count(*) FROM strategy_ai_controls WHERE enabled OR monthly_limit<>0"),'0');
  assert.equal(sql("SELECT count(*) FROM workflow_entity WHERE active AND name ~* '(^7[A-D]? |^8 |outreach executor|follow.?up manager)'"),'0');
  assert.equal(sql("SELECT count(*) FROM pg_proc WHERE proname='strategy_reservation_context'"),'1');
  const info=JSON.parse(docker(['inspect','n8n']))[0];const env=Object.fromEntries(info.Config.Env.map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)];}));
  assert.equal(env.STRATEGY_CONTRACT_VERSION,'strategy_v2');assert.equal(env.NODE_FUNCTION_ALLOW_BUILTIN,'crypto');assert.equal(env.N8N_RUNNERS_ENABLED,'false');
  console.log('Verified exact workflow, active state, v2 settings, zero AI allowance and inactive senders.');
 }else if(action==='resume'){
  assert.equal(sql("SELECT count(*) FROM strategy_jobs WHERE status IN ('pending','processing')"),'0');
  control(before.controls.enabled);
  fs.writeFileSync(path.join(dir,'completed.json'),JSON.stringify({at:new Date().toISOString(),scope:'06C draft-only and 017',migration016:false,ai_allowance:0,sending_enabled:false}));
  console.log('Restored prior planner claim setting. Draft-only rollout complete; no model call or send.');
 }else if(action==='rollback'){
  control(false);importFile(path.join(dir,'rollback-workflow.json'));
  sql('BEGIN;\n'+before.functions.join('\n')+"\nDROP FUNCTION IF EXISTS strategy_reservation_context(jsonb);\nCOMMIT;");
  fs.copyFileSync(path.join(dir,'compose-before.yml'),'docker-compose.yml');composeUp();await healthy();control(before.controls.enabled);
  console.log('Restored previous 06C, function definitions, runtime settings and planner control.');
 }else throw Error('Expected apply, verify, resume or rollback');
}
main().catch(e=>{console.error(e.message);console.error('If apply started, claims remain paused. Inspect private backup; use rollback if required.');process.exitCode=1;});
