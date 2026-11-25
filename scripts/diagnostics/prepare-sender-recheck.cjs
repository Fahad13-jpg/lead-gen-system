'use strict';
// Prepare private artifacts only. Deployment is a separate explicit operator step.
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const dir='.local/sender-recheck-20261108';
function command(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:30000,maxBuffer:2000000});assert.equal(r.status,0,'Read-only Docker inspection failed');return r.stdout.trim();}
const sql=q=>JSON.parse(command(['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],q));
assert(!fs.existsSync(dir),'Prepared artifacts already exist; inspect rather than overwrite');
const w=sql("SELECT json_build_object('id',id,'name',name,'active',active,'nodes',nodes,'connections',connections,'settings',settings) FROM workflow_entity WHERE id='managedSmtpcheck'");
assert.equal(w.active,false);const check=w.nodes.find(n=>n.type==='CUSTOM.managedSender');assert.equal(check.parameters.operation,'check');assert.equal(check.parameters.release,'null');
assert.deepEqual(JSON.parse(check.parameters.binding),{org_id:1,connection_id:'fahad-gmail-smtp'});
assert.equal(w.nodes.filter(n=>n.type!=='n8n-nodes-base.stickyNote').length,2);
const candidate=structuredClone(w),template=require('../sender-connections/package.cjs').workflows()[2];
candidate.nodes.push(...template.nodes.filter(n=>['check-schedule','automatic-check-note'].includes(n.id)));
candidate.connections['Check pending sender every minute']={main:[[{node:check.name,type:'main',index:0}]]};
candidate.settings={...w.settings,saveDataSuccessExecution:'none',saveDataErrorExecution:'none',saveManualExecutions:false};
// Build imports inactive. Activation is a distinct deployment command.
candidate.active=false;
fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/before-workflow.json',JSON.stringify(w,null,2));fs.writeFileSync(dir+'/workflow.json',JSON.stringify(candidate,null,2));
fs.writeFileSync(dir+'/before-worker.cjs',command(['exec','n8n','cat','/home/node/.n8n/custom/lead-system/scripts/sender-connections/worker.cjs']));
const repo=JSON.parse(fs.readFileSync('workflows/09b_sender_connection_check.json','utf8'));
for(const n of template.nodes.filter(n=>['check-schedule','automatic-check-note'].includes(n.id)))if(!repo.nodes.some(old=>old.id===n.id))repo.nodes.push(n);
repo.connections['Check pending sender every minute']=template.connections['Check pending sender every minute'];repo.settings.saveManualExecutions=false;
fs.writeFileSync('workflows/09b_sender_connection_check.json',JSON.stringify(repo,null,2)+'\n');
console.log(JSON.stringify({prepared:dir,schedule_minutes:1,existing_binding_preserved:true,workflow_active:false,deployed:false,emails_sent:0}));
