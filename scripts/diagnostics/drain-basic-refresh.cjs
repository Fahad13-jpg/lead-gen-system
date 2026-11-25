'use strict';
// Bounded operator drain of the existing BASIC queue. Never resets a task or
// invokes research, AI, LinkedIn, Apify, verification, outreach or a new schedule.
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const dir='.local/basic-drain-'+Date.now();fs.mkdirSync(dir,{recursive:true});
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:120000,maxBuffer:10000000});if(r.status!==0)throw Error('BASIC_DRAIN_COMMAND_UNCONFIRMED');return r.stdout.trim();}
const sql=q=>docker(['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],q);
const q=s=>"'"+String(s).replace(/'/g,"''")+"'";
const rows=s=>{const text=sql(s);return text?text.split('\n').map(JSON.parse):[];};
const report={started_at:new Date().toISOString(),max_tasks:20,max_batches:10,tasks:[],paid_provider_calls:0,model_calls:0,sends:0};
function save(){fs.writeFileSync(dir+'/result.json',JSON.stringify(report,null,2));}
try{
 const controls=rows(`SELECT json_build_object('ai',(SELECT enabled FROM enrichment_ai_controls WHERE id),'linkedin',(SELECT enabled FROM enrichment_linkedin_controls WHERE id),'verification',(SELECT verification_enabled FROM contact_controls WHERE id),'enabled',(SELECT enabled FROM enrichment_controls WHERE id))`)[0];
 assert.equal(controls.ai,false);assert.equal(controls.linkedin,false);assert.equal(controls.verification,false);assert.equal(controls.enabled,true);
 for(let batch=0;batch<10;batch++){
  if(Number(sql("SELECT count(*) FROM enrichment_tasks WHERE kind='basic' AND status='processing'"))>0){report.stop_reason='existing_basic_work_in_progress';break;}
  const tasks=rows("SELECT value FROM enrichment_claim('basic',2) value");
  if(!tasks.length){report.stop_reason='no_due_eligible_basic_tasks';break;}
  for(const t of tasks){assert(/^\d+$/.test(String(t.id))&&/^[a-f0-9]{32}$/.test(t.lease));
   const kind=sql(`SELECT kind FROM enrichment_tasks WHERE id=${t.id} AND lease=${q(t.lease)}`);assert.equal(kind,'basic');
   const result=JSON.parse(docker(['exec','n8n','node','/home/node/.n8n/enrichment-stage/worker.cjs',String(t.id),t.lease]));
   assert.equal(String(result.id),String(t.id));assert.equal(result.lease,t.lease);
   fs.writeFileSync(dir+'/task-'+t.id+'.json',JSON.stringify(result,null,2));
   const saved=rows(`SELECT enrichment_finish(${q(JSON.stringify(result))}::jsonb)`)[0];
   const item={id:t.id,saved:saved.saved,status:saved.status,reason:result.result?.reason||null,failure_class:result.result?.failure_class||null,pages:result.result?.pages?.length||0};report.tasks.push(item);save();console.log(JSON.stringify(item));
  }
 }
 report.finished_at=new Date().toISOString();report.remaining=rows("SELECT json_build_object('status',status,'count',count(*)) FROM enrichment_tasks WHERE kind='basic' GROUP BY status ORDER BY status");save();console.log(JSON.stringify({completed:report.tasks.length,remaining:report.remaining,stop_reason:report.stop_reason||'batch_bound_reached',report_directory:dir}));
}catch(e){report.error='BASIC_DRAIN_STOPPED';save();console.error(e.message);process.exitCode=1;}
