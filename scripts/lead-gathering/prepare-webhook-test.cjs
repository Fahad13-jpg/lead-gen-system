// Build production graphs with only provider I/O and database credentials replaced.
// The isolated n8n instance uses a separate SQLite database and port 5680.
const fs=require('node:fs');
const files=require('./catalog.cjs').workflows.slice(1).map(w=>w.file);
const workflows=files.map((f,i)=>({...JSON.parse(fs.readFileSync('workflows/'+f)),id:'gatheringWebhookTest'+i,active:false}));
for(const w of workflows)for(const n of w.nodes){
 if(n.type.endsWith('.postgres'))n.credentials={postgres:{id:'gatheringTestPg',name:'Gathering test database'}};
 if(n.name.startsWith('Dispatch ' )&&n.type.endsWith('.httpRequest'))n.parameters.url=n.parameters.url.replace('n8n:5678','127.0.0.1:5680');
 const replacements={
  'Start Apify Actor':`const j=$('Prepare Actor').first(0).json;if(j.job_name.startsWith('Resume'))throw new Error('Resume incorrectly attempted a new paid run');if(j.billing_mode==='platform'&&j.apify_api_key!=='apify_api_TESTPLATFORM')throw new Error('Wrong platform account');if(j.billing_mode==='byok'&&j.apify_api_key!=='apify_api_TEST')throw new Error('Wrong BYOK account');return {statusCode:201,body:{data:{id:'mock-'+j.id,defaultDatasetId:'mock-data-'+j.id}}};`,
  'Check Actor Status':`const j=$('Prepare Actor').first(0).json;const aborted=$getWorkflowStaticData('global')['aborted'+j.id];return {statusCode:200,body:{data:{id:$('Parse Run').first(0).json.run_id,status:aborted?'ABORTED':j.job_name.startsWith('Cancel')?'RUNNING':j.job_name.startsWith('Failure')?'FAILED':'SUCCEEDED',usageTotalUsd:0.017}}};`,
  'Abort Expired Run':`const j=$('Prepare Actor').first(0).json;$getWorkflowStaticData('global')['aborted'+j.id]=true;return {statusCode:200};`,
  'Get Dataset':`const j=$('Prepare Actor').first(0).json,country=j.request_settings?.country_code||(j.source==='yellow_pages'?'US':'PK');
   if(j.source==='facebook_pages')return {statusCode:200,body:[{pageId:'100000001',pageName:'Fixture business',pageUrl:'https://www.facebook.com/offline.fixture/',phone:'+15125550123',website:'https://fixture.example',categories:['Page','Plumbing Service']}]};
   if(j.source==='yelp')return {statusCode:200,body:[{bizId:'offline_yelp_fixture',name:'Fixture plumbing',directUrl:'https://www.yelp.com/biz/offline-fixture-austin',phone:'+15125550123',website:'https://fixture.example',address:{addressLine1:'1 Fixture Road',city:'Austin',regionCode:'TX',country:'US'},categories:['Plumbing']}]};
   return {statusCode:200,body:[{title:'Branch clinic',placeId:'webhook-branch-1',phone:'+1555000099',website:'https://chain.example',address:'1 Main Road',countryCode:country,categoryName:'Dentist',location:{lat:33.7,lng:73}},{title:'Branch clinic',placeId:'webhook-branch-2',phone:'+1555000099',website:'https://chain.example',address:'2 Main Road',countryCode:country,categoryName:'Dentist',location:{lat:33.701,lng:73}},{title:'Duplicate clinic',placeId:'webhook-branch-1',countryCode:country,categoryName:'Dentist',location:{lat:33.7,lng:73}},{title:'Distant clinic',placeId:'webhook-far',countryCode:country,categoryName:'Dentist',location:{lat:35,lng:73}}]};`
 };
 if(replacements[n.name]){n.type='n8n-nodes-base.code';n.typeVersion=2;n.parameters={mode:'runOnceForAllItems',jsCode:replacements[n.name]};delete n.credentials;delete n.retryOnFail;}
 if(n.type.endsWith('.wait'))n.parameters.amount=2;
}
// Stall recovery is disabled. The queue dispatcher uses only the isolated test DB.
workflows[0].nodes=workflows[0].nodes.filter(n=>n.name!=='Check Stalled Jobs');delete workflows[0].connections['Check Stalled Jobs'];
for(const w of workflows)for(const n of w.nodes)if(n.type.endsWith('.httpRequest')&&String(n.parameters.url).includes('api.apify.com'))throw Error('UNSTUBBED_PROVIDER_REQUEST');
fs.writeFileSync('.local/gathering-deploy/webhook-test.json',JSON.stringify(workflows));
console.log('Prepared isolated webhook test workflows.');
