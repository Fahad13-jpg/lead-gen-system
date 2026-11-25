'use strict';
// Real n8n create/start/pause acceptance using inert fixtures only. No customer
// authority, mail credentials, provider nodes, lead writes or message execution.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const controller=require('../sender-connections/email-batch-release.cjs'),operator=require('../sender-connections/email-batch-operator.cjs');
function fixture(project,run){
 const slice={format:'email_campaign_slice_v1',binding:{org_id:1,email:'sender@example.test',credential_ref:'inert-no-credential'},authority:{campaign_id:1,campaign_version:1,revision:1,scope_hash:'a'.repeat(32),slice_id:run},plan:{plan_id:1,content_hash:'b'.repeat(32),recipient:'recipient@example.test'},target_step:1,expires_at:new Date(Date.now()+3600000).toISOString()};
 const workflow=kind=>({name:'Email installer acceptance '+run+' '+kind,nodes:[
  {id:'schedule',name:'Inert annual trigger',type:'n8n-nodes-base.scheduleTrigger',typeVersion:1.2,position:[0,0],parameters:{rule:{interval:[{field:'cronExpression',expression:'0 0 1 1 *'}]}}},
  {id:'noop',name:'No mail or customer actions',type:'n8n-nodes-base.code',typeVersion:2,position:[220,0],parameters:{mode:'runOnceForAllItems',jsCode:'return [];'}},
  {id:'note',name:'Acceptance fixture only',type:'n8n-nodes-base.stickyNote',typeVersion:1,position:[0,-200],parameters:{content:'INERT LOCAL ACCEPTANCE. No mail credentials, provider nodes or customer data. Leave inactive after the lifecycle check.',width:480,height:160}}
 ],connections:{'Inert annual trigger':{main:[[{node:'No mail or customer actions',type:'main',index:0}]]}},settings:{executionOrder:'v1',timezone:'UTC',saveDataSuccessExecution:'none',saveDataErrorExecution:'none',saveManualExecutions:false},active:false});
 const data={format:'email_campaign_slice_bundle_v1',batch_id:run,project_id:project,slice,workflows:{send:workflow('send'),reply:workflow('reply')},active:false};
 return {...data,digest:crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex')};
}
function inert(bundle){controller.verify(bundle);for(const w of Object.values(bundle.workflows))for(const n of w.nodes){assert.ok(['n8n-nodes-base.scheduleTrigger','n8n-nodes-base.code','n8n-nodes-base.stickyNote'].includes(n.type));assert.ok(!n.credentials);if(n.type==='n8n-nodes-base.code')assert.equal(n.parameters.jsCode,'return [];');if(n.type==='n8n-nodes-base.scheduleTrigger')assert.equal(n.parameters.rule.interval[0].expression,'0 0 1 1 *');}}
async function main(){
 assert.ok(process.argv.includes('--inert-local-acceptance'));
 const root=path.resolve('.local/email-installer-acceptance-20261115');assert.ok(!fs.existsSync(path.join(root,'attempt.json')),'PRIOR_PROBE_INSPECT_BEFORE_REPLAY');fs.mkdirSync(root,{recursive:true});
 const pool=require('../dashboard/start-local-auth.cjs').localPool(),api=operator.client(),ids=new Set(),calls=[];
 try{
  const project=(await pool.query("SELECT \"projectId\" AS id FROM shared_workflow WHERE \"workflowId\"='managedSmtpcheck' LIMIT 1")).rows[0]?.id;assert.ok(project);
  const bundle=fixture(project,crypto.randomBytes(16).toString('hex'));inert(bundle);
  fs.writeFileSync(path.join(root,'bundle.json'),JSON.stringify(bundle,null,2));fs.writeFileSync(path.join(root,'attempt.json'),JSON.stringify({started_at:new Date().toISOString(),mail_nodes:0,credentials:0}));
  const ports={authorize:async()=>inert(bundle),revalidate:async()=>inert(bundle),projectFor:async id=>(await pool.query({text:'SELECT "projectId" FROM shared_workflow WHERE "workflowId"=$1 LIMIT 1',values:[id]})).rows[0]?.projectId,
   request:async(m,u,p)=>{calls.push({method:m,route:u});const r=await api(m,u,p);if(m==='POST'&&u==='/workflows'&&r.id)ids.add(r.id);return r;},
   readJournal:async op=>{try{return JSON.parse(fs.readFileSync(path.join(root,op+'.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}},
   writeJournal:async(op,value)=>fs.writeFileSync(path.join(root,op+'.json'),JSON.stringify(value))};
  try{
   const installed=await controller.install(bundle,ports);assert.equal(installed.sending_active,false);
   const started=await controller.start(bundle,ports);assert.equal(started.reply_active,true);assert.equal(started.sending_active,true);
   const activations=calls.filter(c=>c.method==='POST'&&c.route.endsWith('/activate'));assert.equal(activations[0].route,'/workflows/'+installed.workflows.reply+'/activate');
   const paused=await controller.pause(bundle,ports);assert.equal(paused.sending_active,false);assert.equal(paused.reply_active,true);
   const result={passed:true,actual_n8n_api:true,inert_fixtures_only:true,installed_inactive:true,reply_first_start:true,pause_retains_reply:true,emails_sent:0,provider_nodes:0,customer_campaigns_changed:0,workflows:installed.workflows,checked_at:new Date().toISOString()};
   fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }finally{
   // These IDs came only from this probe's POST receipts; no customer workflow is touched.
   for(const id of ids){const w=await api('GET','/workflows/'+id);assert.ok(w.name.startsWith('Email installer acceptance '+bundle.batch_id+' '));if(w.active)await api('POST','/workflows/'+id+'/deactivate');assert.equal((await api('GET','/workflows/'+id)).active,false);}
   fs.writeFileSync(path.join(root,'cleanup.json'),JSON.stringify({probe_workflows_inactive:true,workflow_ids:[...ids]}));
  }
 }finally{await pool.end();}
}
if(require.main===module)main().catch(e=>{console.error(/^[A-Z][A-Z_]+$/.test(e.message)?e.message:'EMAIL_INSTALLER_ACCEPTANCE_UNCONFIRMED');process.exitCode=1;});
module.exports={fixture,inert};
