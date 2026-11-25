'use strict';
const fs=require('fs'),cp=require('child_process'),path=require('path'),assert=require('assert/strict');
const id='27W04lgTGdgFMWUx',dir=path.resolve('.local/strategy-preview-deployment-20261014');
function docker(args,input){const r=cp.spawnSync('docker',args,{encoding:'utf8',input,maxBuffer:20e6,timeout:240000});if(r.status){fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'error.log'),(r.stdout||'')+(r.stderr||''));throw Error('Operation failed; see private error.log');}return r.stdout.trim();}
function sql(q){return docker(['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],q);}
function restoreControl(enabled){sql('UPDATE strategy_controls SET enabled='+Boolean(enabled)+' WHERE id;');}
async function health(){for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:5678/healthz',{signal:AbortSignal.timeout(2000)})).ok)return;}catch{}await new Promise(r=>setTimeout(r,1000));}throw Error('Health timeout');}
async function install(file,active){docker(['cp',file,'n8n:/tmp/strategy-preview-import.json']);docker(['exec','n8n','n8n','import:workflow','--input=/tmp/strategy-preview-import.json','--projectId=xLW48WqYIkxblH0N']);docker(['exec','n8n','n8n','update:workflow','--id='+id,'--active='+active]);docker(['restart','--time','60','n8n']);await health();}
async function main(){
 if(process.argv[2]==='rollback'){
  const old=JSON.parse(fs.readFileSync(path.join(dir,'before.json')));restoreControl(false);
  const file=path.join(dir,'rollback.json');fs.writeFileSync(file,JSON.stringify({...old.workflow,active:false}));await install(file,old.workflow.active);restoreControl(old.enabled);console.log('Previous draft-only workflow restored.');return;
 }
 if(process.argv[2]!=='apply')throw Error('Expected apply or rollback');
 const evidence=JSON.parse(fs.readFileSync('documentation/strategy-contract-v2/n8n-runtime-results.json'));
 assert.equal(evidence.preview_cases?.length,6,'Actual n8n preview tests required');
 assert.equal(sql("SELECT count(*) FROM strategy_jobs WHERE status IN ('pending','processing')"),'0');
 assert.equal(sql('SELECT count(*) FROM strategy_ai_controls WHERE enabled OR monthly_limit<>0'),'0');
 const old={workflow:JSON.parse(sql("SELECT row_to_json(w) FROM workflow_entity w WHERE id='"+id+"'")),enabled:sql('SELECT enabled FROM strategy_controls WHERE id')==='t'};
 const desired=JSON.parse(fs.readFileSync('workflows/06C_outreach_strategy_generator.json'));
 const strip=w=>{const x=structuredClone(w);for(const n of x.nodes)if(['Prepare Strategy','Validate and Assemble Draft','Build Preview'].includes(n.name))delete n.parameters.jsCode;return {nodes:x.nodes,connections:x.connections,settings:x.settings};};
 assert.deepEqual(strip(desired),strip(old.workflow));
 fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'before.json'),JSON.stringify(old),{flag:'wx'});
 const file=path.join(dir,'import.json');fs.writeFileSync(file,JSON.stringify({...desired,id,active:false}));
 restoreControl(false);console.log('Planner paused; importing preview-compatible draft workflow.');
 await install(file,old.workflow.active);
 const live=JSON.parse(sql("SELECT row_to_json(w) FROM workflow_entity w WHERE id='"+id+"'"));
 assert.deepEqual(live.nodes,desired.nodes);assert.deepEqual(live.connections,desired.connections);assert.equal(live.active,old.workflow.active);
 assert.equal(sql('SELECT count(*) FROM strategy_ai_controls WHERE enabled OR monthly_limit<>0'),'0');
 const smoke=cp.spawnSync(process.execPath,['scripts/lead-strategy/check-live.cjs'],{encoding:'utf8',timeout:90000});
 if(smoke.status!==0)throw Error('API smoke failed; planner remains paused');
 restoreControl(old.enabled);
 fs.writeFileSync('documentation/strategy-contract-v2/preview-deployment.json',JSON.stringify({deployed_at:new Date().toISOString(),workflow_id:id,preview_version:'strategy_v2',actual_n8n_preview_cases:6,api_smoke_passed:true,ai_allowance:0,provider_calls:0,sent:false,migrations_applied:[]},null,2));
 console.log('Preview update deployed and verified. Planner setting restored; no providers or sends.');
}
main().catch(e=>{console.error(e.message);console.error('If import started, planner stays paused; targeted rollback is available.');process.exitCode=1;});
