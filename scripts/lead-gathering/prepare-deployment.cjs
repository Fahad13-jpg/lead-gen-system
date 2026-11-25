// Creates private import artifacts. Never prints keys or credentials.
const fs=require('node:fs'); const crypto=require('node:crypto');
fs.mkdirSync('.local/gathering-deploy',{recursive:true});
const catalog=require('./catalog.cjs').workflows,files=catalog.map(w=>w.file),ids=catalog.map(w=>w.id);
const workflows=files.map((f,i)=>({...JSON.parse(fs.readFileSync('workflows/'+f)),id:ids[i],active:false}));
fs.writeFileSync('.local/gathering-deploy/workflows.json',JSON.stringify(workflows));
if(!fs.existsSync('.local/gathering-api-key'))fs.writeFileSync('.local/gathering-api-key',crypto.randomBytes(32).toString('hex'),{mode:0o600});
const key=fs.readFileSync('.local/gathering-api-key','utf8').trim();
fs.writeFileSync('.local/gathering-deploy/auth.json',JSON.stringify([{id:'leadGatheringAuth',name:'Lead Gathering API',type:'httpHeaderAuth',data:{name:'X-Lead-Gathering-Key',value:key}}]));

// Manual harness uses the same production node parameters, replacing only entry/ACK
// and (in mock mode) provider HTTP responses. Production workflows remain inactive.
const mock=process.argv.includes('--mock');
const scenario=process.argv.find(x=>x.startsWith('--scenario='))?.split('=')[1]||'success';
const runner=structuredClone(workflows[2]);runner.id='gatheringTestRunner';runner.name='Gathering verification (manual only)';
runner.nodes=runner.nodes.filter(n=>n.name!=='Webhook'); delete runner.connections.Webhook;
const acknowledgement=runner.nodes.find(n=>n.name==='Respond ACK'); acknowledgement.type='n8n-nodes-base.code';acknowledgement.typeVersion=2;acknowledgement.parameters={jsCode:'return $input.first().json;'};
const add=(name,type,parameters)=>runner.nodes.push({id:crypto.randomUUID(),name,type:'n8n-nodes-base.'+type,typeVersion:type==='postgres'?2.6:type==='code'?2:1,position:[0,-200],parameters});
add('Manual Test','manualTrigger',{});
const org=mock?900001:1;
const request={org_id:org,billing_mode:mock?'byok':'platform',result_mode:'new',source:'google_maps',job_name:mock?'Gathering simulated test':'Gathering verification — Islamabad dental clinics',search_query:'dental clinics',location:'Islamabad, Pakistan',max_results:5,max_cost_usd:0.5,request_id:process.env.GATHERING_TEST_REQUEST_ID||('gathering_'+Date.now()),scrape_contacts:true,website_filter:'allPlaces',country_code:'PK',refresh:true};
add('Test Request','code',{jsCode:'return {body:'+JSON.stringify(request)+'};'});
const orchestrator=workflows[1];for(const name of ['Validate Request','Enqueue Job','Unwrap Job'])runner.nodes.push(structuredClone(orchestrator.nodes.find(n=>n.name===name)));
const drain=structuredClone(orchestrator.nodes.find(n=>n.name==='Drain Queue'));runner.nodes.push(drain);
add('Job Input','code',{jsCode:'const j=$("Unwrap Job").first(0).json;if(j.error||j.replayed)throw new Error("Test job was not newly admitted: "+JSON.stringify(j));return {body:{job_id:j.job_id,org_id:j.org_id}};'});
function edge(a,b){runner.connections[a]={main:[[{node:b,type:'main',index:0}]]};}
edge('Manual Test','Test Request');edge('Test Request','Validate Request');edge('Validate Request','Enqueue Job');edge('Enqueue Job','Unwrap Job');edge('Unwrap Job','Drain Queue');edge('Drain Queue','Job Input');edge('Job Input','Validate Job');
if(mock){
 for(const n of runner.nodes)if(n.type==='n8n-nodes-base.postgres')n.credentials={postgres:{id:'gatheringTestPg',name:'Gathering test database'}};
 const fixtures={
  'Start Apify Actor':{statusCode:201,body:{data:{id:'mock-run',defaultDatasetId:'mock-dataset'}}},
  'Check Actor Status':{statusCode:200,body:{data:{id:'mock-run',status:scenario==='failed'?'FAILED':'SUCCEEDED',usageTotalUsd:0.017}}},
  'Get Dataset':{statusCode:200,body:scenario==='empty'?[]:[{title:"O'Brien Test Clinic",phone:'+15555550003',placeId:'mock-site-1',website:'https://clinic.example/?tracking=1',emails:['Info@Clinic.example']},{title:'Duplicate',phone:'+15555550003',placeId:'mock-site-1'},{title:'Other Test Clinic',phone:'+15555550004',placeId:'mock-site-2'}]}
 };
 if(scenario==='contact_fixed'){
   fixtures['Get Dataset'].body[0].phone='+15555550005';fixtures['Get Dataset'].body[0].placeId='mock-site-fixed';
   fixtures['Get Dataset'].body[1].phone='+15555550005';fixtures['Get Dataset'].body[1].placeId='mock-site-fixed';
 }
 for(const [name,value]of Object.entries(fixtures)){const n=runner.nodes.find(n=>n.name===name);n.type='n8n-nodes-base.code';n.typeVersion=2;n.parameters={jsCode:'return '+JSON.stringify(value)+';'};delete n.credentials;}
 const wait=runner.nodes.find(n=>n.name==='Wait Before Poll');wait.type='n8n-nodes-base.code';wait.typeVersion=2;wait.parameters={jsCode:'return $input.first().json;'};
}
fs.writeFileSync('.local/gathering-deploy/runner.json',JSON.stringify([runner]));
console.log('Prepared private deployment artifacts and '+(mock?'simulated':'live')+' manual harness.');
