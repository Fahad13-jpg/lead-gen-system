'use strict';
const fs=require('fs'),cp=require('child_process'),path=require('path'),assert=require('assert/strict');
const contract=require('../lead-strategy/v2/contract.cjs'),fixtures=require('../lead-strategy/v2/fixtures.cjs');
const name='email-lifecycle-runtime-20261015',dir=path.resolve('.local/email-lifecycle-runtime-20261015');
function docker(args){const r=cp.spawnSync('docker',args,{encoding:'utf8',timeout:240000,maxBuffer:2e6});if(r.status!==0)throw Error(String(r.stderr||r.error).slice(0,800));return r.stdout.trim();}
async function main(){
 fs.mkdirSync(dir,{recursive:true});
 const w=JSON.parse(fs.readFileSync('workflows/07a_email_outreach_executor.json','utf8'));
 const n=name=>w.nodes.find(n=>n.name===name);
 const input=structuredClone((await fixtures.benchmarks())[0].input);input.campaign.config.channels=['email'];input.campaign.config.sequence=input.campaign.config.sequence.map(s=>({...s,channel:'email'}));
 const prepared=contract.build(input,{now:'2026-10-12T00:00:00Z',readinessSnapshot:{email:{status:'ready',reasons:[]}}});
 const body=contract.plan(prepared,contract.template(prepared),'template_completed');
 const cases=['accepted','timeout','empty_receipt','reservation_denied','begin_denied','finish_rejected','followup_accepted','followup_timeout'];
 const credentialRef=n('Send Email - Gmail').credentials.gmailOAuth2.id;
 const rows=cases.map((kind,i)=>({org_id:1,plan_id:i+1,step:kind.startsWith('followup_')?2:1,content_hash:'a'.repeat(32),body,email:'demo@example.org',dispatch_check:{ready:true},sender:{credential_ref:credentialRef,email:'sender@example.org'},parent_activity:{org_id:1,plan_id:i+1,step:1,content_hash:'a'.repeat(32),state:'provider_accepted',credential_ref:credentialRef,sender_email:'sender@example.org',external_id:'abcdef1234'},_case:kind}));
 function mock(name,jsCode,mode='runOnceForEachItem'){
  const x=n(name);x.type='n8n-nodes-base.code';x.typeVersion=2;x.parameters={mode,jsCode};delete x.credentials;delete x.onError;delete x.disabled;return x;
 }
 Object.assign(n('Schedule Trigger'),{type:'n8n-nodes-base.manualTrigger',typeVersion:1,parameters:{}});
 mock('Get Email-Ready Leads','return '+JSON.stringify(rows)+'.map(json=>({json}));','runOnceForAllItems');
 mock('Check Not Unsubscribed','return {json:{unsubscribe_count:0}};');
 // Exercise the actual sender gate with a scratch-only explicit binding.
 const candidateNode=n('Get Email-Ready Leads');
 candidateNode.parameters.jsCode=candidateNode.parameters.jsCode.replace('.map(json=>({json}))',".map(json=>({json:{...json,sender_policy:{enabled:true,credential_ref:json.sender.credential_ref,sender_email:json.sender.email,daily_limit:10,mailbox_rolling_limit:20,min_interval_seconds:300}}}))");
 n('Daily limit check').parameters.jsCode=n('Daily limit check').parameters.jsCode.replace('const binding=null;','const binding='+JSON.stringify({org_id:1,email:'sender@example.org',credential_ref:credentialRef})+';');
 mock('Load Sender Profile',"return {json:{emailAddress:'sender@example.org'}};");
 mock('Load Previous Gmail Message',"const row=$json;return {json:{id:'abcdef1234',threadId:'11112222',payload:{headers:[{name:'From',value:'sender@example.org'},{name:'To',value:'demo@example.org'},{name:'Subject',value:row.subject_line},{name:'Message-ID',value:'<original@example.org>'}]}}};");
 const kind="const kind=$('Get Email-Ready Leads').item.json._case;";
 mock('Reserve Approved Email',kind+"return {json:{result:{ready:kind!=='reservation_denied',reserved:kind!=='reservation_denied',lease:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',execution_authorized:false}}};");
 mock('Begin Email Attempt',kind+"return {json:{result:{ready:kind!=='begin_denied',execution_authorized:kind!=='begin_denied'}}};");
 mock('Send Email - Gmail',kind+"if($json.dispatch_allowed!==true)throw Error('UNAUTHORIZED_TRANSPORT');return {json:['timeout','followup_timeout'].includes(kind)?{error:{message:'MOCK timeout'}}:kind==='empty_receipt'?{}:{id:'1234abcdef'}};");
 mock('Log Email Sent',kind+"const p=$json.finish_payload;if(p.step!==$('Get Email-Ready Leads').item.json.step||p.org_id!==1||p.plan_id!==$('Get Email-Ready Leads').item.json.plan_id||p.lease!=='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')throw Error('ITEM_LINKAGE');const expected=['timeout','followup_timeout','empty_receipt'].includes(kind)?'ambiguous':'provider_accepted';if(p.outcome!==expected)throw Error('WRONG_RECEIPT');return {json:{result:{saved:kind!=='finish_rejected',state:expected,retry_allowed:false}}};");
 mock('Mark Email Sent','return {json:{dispatch_result:$json.result,legacy_followup_authorized:false}};');
 w.nodes.push({id:'assertions',name:'Assertions',type:'n8n-nodes-base.code',typeVersion:2,position:[4000,0],parameters:{mode:'runOnceForEachItem',jsCode:kind+"if(kind==='reservation_denied'){if($json.reservation_allowed!==false)throw Error('RESERVATION_BYPASS');}else if(kind==='begin_denied'){if($json.dispatch_allowed!==false)throw Error('BEGIN_BYPASS');}else{if(!$json.dispatch_result)throw Error('MISSING_RECEIPT');if($json.dispatch_result.saved!==(kind!=='finish_rejected'))throw Error('FALSE_SUCCESS');}return {json:{case:kind,pass:true}};"}});
 const target=[{node:'Assertions',type:'main',index:0}];
 w.connections['Email Reserved?'].main[1]=target;w.connections['Email Attempt Authorized?'].main[1]=target;w.connections['Mark Email Sent']={main:[target]};
 w.nodes=w.nodes.filter(x=>x.name!=='Mock Email Ready Leads');
 for(const x of w.nodes){delete x.credentials;assert(!['n8n-nodes-base.gmail','n8n-nodes-base.postgres','n8n-nodes-base.httpRequest'].includes(x.type));}
 w.id='scratchEmailLifecycle';w.active=false;delete w.meta;w.settings={executionOrder:'v1'};
 fs.writeFileSync(path.join(dir,'workflow.json'),JSON.stringify(w));
 fs.writeFileSync(path.join(dir,'run.cjs'),`const fs=require('fs'),cp=require('child_process'),crypto=require('crypto');
fs.mkdirSync('/tmp/email-out',{recursive:true});const env={...process.env,N8N_USER_FOLDER:'/tmp/email-'+crypto.randomBytes(8).toString('hex'),N8N_ENCRYPTION_KEY:crypto.randomBytes(24).toString('hex')};
for(const args of [['import:workflow','--input=/tmp/email/workflow.json'],['execute','--id=scratchEmailLifecycle','--rawOutput']]){
const r=cp.spawnSync('n8n',args,{env,encoding:'utf8',timeout:180000,maxBuffer:12e6});fs.writeFileSync('/tmp/email-out/'+args[0].replace(':','-')+'.log',(r.stdout||'')+(r.stderr||''));if(r.status)process.exit(1);
if(args[0]==='execute'){let result;for(let i=0;i<r.stdout.length;i++){if(r.stdout[i]!=='{')continue;try{result=JSON.parse(r.stdout.slice(i,r.stdout.lastIndexOf('}')+1));break;}catch{}}
const d=result?.data?.resultData||result?.resultData;const rows=d?.runData?.Assertions?.flatMap(x=>x.data?.main?.[0]||[]).map(x=>x.json)||[];
if(rows.length!==8||new Set(rows.map(x=>x.case)).size!==8||rows.some(x=>x.pass!==true)||d?.error)process.exit(2);
fs.writeFileSync('/tmp/email-out/results.json',JSON.stringify({cases:rows,network:'none',real_providers:false,sql:'mocked; separately scratch tested'},null,2));}}
`);
 const image=docker(['inspect','n8n','--format','{{.Image}}']);assert(/^sha256:[a-f0-9]{64}$/.test(image));
 if(!process.argv.includes('--resume'))docker(['create','--name',name,'--network','none','--memory','768m','--label','codex.scratch=email-lifecycle','--env','DB_TYPE=sqlite','--env','N8N_RUNNERS_ENABLED=false','--env','N8N_DIAGNOSTICS_ENABLED=false','--env','N8N_VERSION_NOTIFICATIONS_ENABLED=false','--env','N8N_TEMPLATES_ENABLED=false','--entrypoint','node',image,'/tmp/email/run.cjs']);
 const info=JSON.parse(docker(['inspect',name]))[0];assert.equal(info.HostConfig.NetworkMode,'none');assert.equal(info.Image,image);assert.equal(info.Config.Labels['codex.scratch'],'email-lifecycle');assert.equal(info.Mounts.length,0);assert(!info.State.Running);
 docker(['cp',dir+'/.',name+':/tmp/email']);let failure;try{docker(['start','-a',name]);}catch(e){failure=e;}
 docker(['cp',name+':/tmp/email-out/.',dir]);if(failure)throw failure;
 const result=JSON.parse(fs.readFileSync(path.join(dir,'results.json'),'utf8'));fs.writeFileSync('documentation/strategy-contract-v2/email-workflow-results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
