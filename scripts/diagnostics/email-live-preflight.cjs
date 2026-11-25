'use strict';
// Read-only live comparison. Never exports credential values or calls Gmail.
const fs=require('fs'),cp=require('child_process'),crypto=require('crypto'),assert=require('assert/strict');
const release=require('../lead-strategy/v2/email-release.cjs');release.verify('.local/email-release-20261019');
function read(query){const r=cp.spawnSync('docker',['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],{input:'BEGIN READ ONLY;\n'+query+'\nCOMMIT;',encoding:'utf8',timeout:60000,maxBuffer:20e6});if(r.status!==0)throw Error('Read-only preflight failed; no live changes attempted');return JSON.parse(r.stdout.split('\n').find(s=>s.startsWith('{')));}
const live=read(`SELECT json_build_object(
 'functions',(SELECT coalesce(json_agg(json_build_object('name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'source',p.prosrc,'owner',pg_get_userbyid(p.proowner))),'[]') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'outreach_%'),
 'workflows',(SELECT coalesce(json_agg(json_build_object('id',id,'name',name,'active',active,'nodes',nodes)),'[]') FROM workflow_entity WHERE id='gTjsUEP8VLlxKfWf' OR EXISTS(SELECT 1 FROM jsonb_array_elements(nodes::jsonb) n WHERE n->>'name'='Check Gmail Inbox')),
 'running',(SELECT count(*) FROM execution_entity WHERE status='running'),
 'ai_enabled',(SELECT count(*) FROM strategy_ai_controls WHERE enabled OR monthly_limit<>0));`);
const normalize=s=>s.replace(/\r\n/g,'\n').trim();
const sha=s=>crypto.createHash('sha256').update(normalize(s)).digest('hex');
const baseline=new Map();
for(const file of ['019_outreach_dispatch_handoff.sql','020_email_dispatch_lifecycle.sql']){
 const sql=fs.readFileSync('database/migrations/'+file,'utf8');
 for(const m of sql.matchAll(/CREATE OR REPLACE FUNCTION (\w+)\([\s\S]*?AS \$\$([\s\S]*?)\$\$;/g))baseline.set(m[1],{file,body:m[2]});
}
assert(baseline.size>=4,'Baseline extraction failed');
const functions=[...baseline].map(([name,b])=>{const found=live.functions.filter(f=>f.name===name);return {name,baseline:b.file,match:found.length===1&&normalize(found[0].source)===normalize(b.body),owner:found[0]?.owner||null,expected_sha256:sha(b.body),actual_sha256:found.length===1?sha(found[0].source):null};});
const extra=live.functions.filter(f=>!baseline.has(f.name)).map(f=>f.name);
const workflowResults=[];
for(const [file,match] of [['07a_email_outreach_executor.json',w=>w.id==='gTjsUEP8VLlxKfWf'],['09_reply_detection.json',w=>w.nodes.some(n=>n.name==='Check Gmail Inbox')]]){
 const matches=live.workflows.filter(match);assert.equal(matches.length,1,'Live workflow identity ambiguous');
 const old=matches[0],desired=JSON.parse(fs.readFileSync('workflows/'+file,'utf8'));
 const notes=old.nodes.filter(n=>n.type==='n8n-nodes-base.stickyNote');
 const preserved=notes.every(n=>desired.nodes.some(d=>JSON.stringify(d)===JSON.stringify(n)));
 const credentialRefs=w=>[...new Set(w.nodes.flatMap(n=>Object.values(n.credentials||{}).map(c=>c.id)))].sort();
 workflowResults.push({file,id:old.id,name:old.name,active:old.active,sticky_notes_preserved:preserved,credential_references_preserved:JSON.stringify(credentialRefs(old))===JSON.stringify(credentialRefs(desired))});
}
const blockers=[];
if(functions.some(f=>!f.match))blockers.push('function_baseline_mismatch');
if(extra.length)blockers.push('unexpected_outreach_functions');
if(workflowResults.some(w=>w.active))blockers.push('target_workflow_active');
if(workflowResults.some(w=>!w.sticky_notes_preserved))blockers.push('sticky_notes_changed');
if(workflowResults.some(w=>!w.credential_references_preserved))blockers.push('credential_references_changed');
if(live.ai_enabled)blockers.push('ai_allowance_not_zero');
if(live.running)blockers.push('executions_running_recheck_before_deploy');
const result={checked_at:new Date().toISOString(),read_only:true,functions,unexpected_functions:extra,workflows:workflowResults,running:live.running,ai_enabled:live.ai_enabled,blockers,gmail_account_verified:false,deploy:false,send:false};
fs.writeFileSync('documentation/strategy-contract-v2/email-live-preflight.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
