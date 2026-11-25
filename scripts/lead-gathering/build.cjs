'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const rt = require('./runtime.cjs');
const catalog=require('./catalog.cjs').workflows,paths=catalog.map(w=>w.file);
fs.mkdirSync('.local/gathering-before', { recursive: true });
const originals = paths.map(p => {
  const text = fs.readFileSync('workflows/' + (fs.existsSync('workflows/'+p)?p:'03_google_maps_scraper.json'), 'utf8');
  if (!fs.existsSync('.local/gathering-before/' + p)) fs.writeFileSync('.local/gathering-before/' + p, text);
  return JSON.parse(text);
});
const pgCredential = originals[1].nodes.find(n => n.type.endsWith('.postgres')).credentials;
const auth = { httpHeaderAuth: { id: 'leadGatheringAuth', name: 'Lead Gathering API' } };
const code = fn => `return (${fn.toString()})();`;
let nodes, connections;
function reset() { nodes=[]; connections={}; }
function add(name,type,parameters,extra={}) {
  const versions={webhook:2.1,respondToWebhook:1.4,postgres:2.6,code:2,httpRequest:4.2,if:2.2,wait:1.1};
  nodes.push({name,type:'n8n-nodes-base.'+type,typeVersion:versions[type]||1,id:crypto.createHash('sha256').update(name).digest('hex').slice(0,32),position:[nodes.length*240,0],parameters,...extra}); return name;
}
function edge(a,b,output=0){connections[a] ||= {main:[]}; while(connections[a].main.length<=output)connections[a].main.push([]); connections[a].main[output].push({node:b,type:'main',index:0});}
function pg(name,query,params,extra={}){return add(name,'postgres',{operation:'executeQuery',query,options:{queryReplacement:params}},{credentials:pgCredential,...extra});}
function js(name,fn){return add(name,'code',{mode:'runOnceForAllItems',jsCode:typeof fn==='function'?code(fn):fn});}
function iff(name,expr){return add(name,'if',{conditions:{options:{typeValidation:'strict',version:2},conditions:[{id:name,leftValue:expr,rightValue:'',operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}});}
function hook(name,path,method='POST'){return add(name,'webhook',{httpMethod:method,path,authentication:'headerAuth',responseMode:'responseNode',options:{}},{credentials:auth,webhookId:crypto.randomUUID()});}
function response(name,body,status){return add(name,'respondToWebhook',{respondWith:'json',responseBody:body,options:{responseCode:status}});}
function http(name,parameters,read=true){return add(name,'httpRequest',{...parameters,options:{response:{response:{fullResponse:true}},timeout:30000}},{onError:'continueErrorOutput',...(read?{retryOnFail:true,maxTries:3,waitBetweenTries:2000}:{})});}
function apifyHeaders(){return {parameters:[{name:'Authorization',value:"=Bearer {{ $('Prepare Actor').first(0).json.apify_api_key }}"}]};}
function save(index){if(process.argv.includes('--yelp-only')&&![1,5].includes(index))return;require('../workflow-queue-guards.cjs').install(nodes);require('./scraper-safety.cjs').install(nodes,connections);fs.writeFileSync('workflows/'+paths[index],JSON.stringify({name:catalog[index].name,nodes,connections,pinData:{},settings:{executionOrder:'v1',timezone:'UTC',saveDataSuccessExecution:'none',saveDataErrorExecution:'none',saveManualExecutions:false},meta:{...originals[index].meta}},null,2)+'\n');}

reset();
hook('Webhook','connect-apify'); js('Validate Input',rt.validateConnection); iff('Invalid Input?','={{ $json.error }}');
pg('Get Organization','SELECT id FROM organizations WHERE id=$1 AND status=\'active\'','={{ [$json.org_id] }}',{alwaysOutputData:true});
iff('Organization Exists?','={{ !!$json.id }}');
http('Test Apify Key',{url:'https://api.apify.com/v2/users/me',sendHeaders:true,headerParameters:{parameters:[{name:'Authorization',value:"=Bearer {{ $('Validate Input').first(0).json.apify_api_key }}"}]}},true);
js('Parse Response',rt.parseConnection); iff('Is Valid','={{ $json.valid }}');
pg('Update Org - Success','SELECT gathering_connect_byok($1,$2,$3) AS result','={{ [$json.org_id,$json.apify_api_key,$json.provider_user_id] }}');
response('Success Response','={{ $json.result }}','={{ $json.result.http_status }}');
response('Error Response','={{ {success:false,message:"Invalid request or Apify verification failed; existing connection preserved"} }}',400);
response('Not Found','={{ {success:false,message:"Active organization not found"} }}',404);
edge('Webhook','Validate Input');edge('Validate Input','Invalid Input?');edge('Invalid Input?','Error Response');edge('Invalid Input?','Get Organization',1);edge('Get Organization','Organization Exists?');edge('Organization Exists?','Test Apify Key');edge('Organization Exists?','Not Found',1);edge('Test Apify Key','Parse Response');edge('Test Apify Key','Error Response',1);edge('Parse Response','Is Valid');edge('Is Valid','Update Org - Success');edge('Is Valid','Error Response',1);edge('Update Org - Success','Success Response');save(0);

reset();
hook('Webhook','start-scraping');js('Validate Request',rt.validateRequest);iff('Invalid Request?','={{ $json.error }}');
pg('Enqueue Job','SELECT gathering_enqueue_v3($1::jsonb) AS result','={{ [JSON.stringify($json)] }}');js('Unwrap Job','return $input.first().json.result;');iff('Has Error?','={{ $json.error }}');
response('Error Response','={{ {success:false,error:$json.code,message:$json.message} }}','={{ $json.http_status || 400 }}');
response('Accepted Response','={{ $json }}','={{ $json.http_status }}');iff('New Job?','={{ $json.dispatch === true }}');js('Dispatch Context','return $input.all();');iff('Google Maps?','={{ $json.source === "google_maps" }}');
iff('Facebook Pages?','={{ $json.source === "facebook_pages" }}');
iff('Yelp?','={{ $json.source === "yelp" }}');
for(const [label,path] of [['Google Maps','scrape-google-maps'],['Yellow Pages','yellowpages-scraper'],['Facebook Pages','scrape-facebook-pages'],['Yelp','scrape-yelp']]) {
 http('Dispatch '+label,{method:'POST',url:'http://n8n:5678/webhook/'+path,authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',sendBody:true,specifyBody:'json',jsonBody:'={{ {job_id:$json.job_id,org_id:$json.org_id} }}'},false);
 nodes[nodes.length-1].credentials=auth;
 edge('Dispatch '+label,'Dispatch Failed',1);
}
pg('Dispatch Failed','SELECT gathering_dispatch_failed_v3($1,$2)',"={{ [$('Dispatch Context').item.json.job_id,$('Dispatch Context').item.json.org_id] }}");
pg('Drain Queue',"SELECT (v->>'job_id')::integer AS job_id,(v->>'org_id')::integer AS org_id,v->>'source' AS source FROM gathering_dispatch_v3() v",'={{ [] }}');
add('Dispatch Queued Jobs','scheduleTrigger',{rule:{interval:[{field:'seconds',secondsInterval:10}]}});edge('Dispatch Queued Jobs','Drain Queue');edge('Drain Queue','Dispatch Context');edge('New Job?','Drain Queue',1);
edge('Webhook','Validate Request');edge('Validate Request','Invalid Request?');edge('Invalid Request?','Error Response');edge('Invalid Request?','Enqueue Job',1);edge('Enqueue Job','Unwrap Job');edge('Unwrap Job','Has Error?');edge('Has Error?','Error Response');edge('Has Error?','Accepted Response',1);edge('Accepted Response','New Job?');edge('New Job?','Dispatch Context');edge('Dispatch Context','Google Maps?');edge('Google Maps?','Dispatch Google Maps');edge('Google Maps?','Facebook Pages?',1);edge('Facebook Pages?','Dispatch Facebook Pages');edge('Facebook Pages?','Yelp?',1);edge('Yelp?','Dispatch Yelp');edge('Yelp?','Dispatch Yellow Pages',1);
hook('Preview Webhook','gathering-preview');js('Validate Preview',rt.validateRequest);iff('Invalid Preview?','={{ $json.error }}');js('Prepare Preview',rt.previewRequest);response('Preview Response','={{ $json }}',200);
pg('Quote Billing','SELECT gathering_quote_v3($1,$2,$3) AS billing','={{ [$json.org_id,$json.billing_mode,$json.max_cost_usd] }}');js('Merge Preview',"return {...$('Prepare Preview').first(0).json,billing:$input.first().json.billing};");
edge('Preview Webhook','Validate Preview');edge('Validate Preview','Invalid Preview?');edge('Invalid Preview?','Error Response');edge('Invalid Preview?','Prepare Preview',1);edge('Prepare Preview','Quote Billing');edge('Quote Billing','Merge Preview');edge('Merge Preview','Preview Response');
hook('Control Webhook','gathering-control');js('Validate Control',`const b=$input.first().json.body||{};if(!Number.isSafeInteger(b.org_id)||b.org_id<1||!Number.isSafeInteger(b.job_id)||b.job_id<1||!['resume','cancel'].includes(b.action))return {error:true,http_status:400,code:'INVALID_CONTROL'};return b;`);iff('Invalid Control?','={{ !!$json.error }}');pg('Control Job','SELECT gathering_control_v3($1,$2,$3) AS result','={{ [$json.job_id,$json.org_id,$json.action] }}');js('Unwrap Control','return $input.first().json.result;');
edge('Control Webhook','Validate Control');edge('Validate Control','Invalid Control?');edge('Invalid Control?','Error Response');edge('Invalid Control?','Control Job',1);edge('Control Job','Unwrap Control');edge('Unwrap Control','Has Error?');
hook('Job Status Webhook','gathering-job-status','GET');
js('Validate Job Status',`const q=$input.first().json.query||{}; if(!/^\\d+$/.test(String(q.job_id))||!/^\\d+$/.test(String(q.org_id))) return {error:true,http_status:400,code:'INVALID_REQUEST',message:'job_id and org_id are required'}; return {job_id:Number(q.job_id),org_id:Number(q.org_id)};`);
iff('Invalid Status Request?','={{ !!$json.error }}');
pg('Get Job Status',`SELECT gathering_report_v3($1,$2) AS report`,'={{ [$json.job_id,$json.org_id] }}');js('Unwrap Report','return $input.first().json.report || {};');
response('Status Response','={{ $json.job_id ? {success:true,job:$json} : {success:false,message:"Job not found"} }}','={{ $json.job_id ? 200 : 404 }}');edge('Job Status Webhook','Validate Job Status');edge('Validate Job Status','Invalid Status Request?');edge('Invalid Status Request?','Error Response');edge('Invalid Status Request?','Get Job Status',1);edge('Get Job Status','Unwrap Report');edge('Unwrap Report','Status Response');
hook('Results Webhook','gathering-results','GET');
js('Validate Results',`const q=$input.first().json.query||{};const org=Number(q.org_id),job=Number(q.job_id),offset=Number(q.offset||0),limit=Number(q.limit||50);if(![org,job,offset,limit].every(Number.isSafeInteger)||org<1||job<1||offset<0||limit<1||limit>100)return {error:true,http_status:400,code:'INVALID_PAGINATION'};return {org_id:org,job_id:job,offset,limit};`);iff('Invalid Results?','={{ !!$json.error }}');
pg('Get Results',`SELECT EXISTS(SELECT 1 FROM scraping_jobs WHERE id=$1 AND org_id=$2) AS found,coalesce((SELECT jsonb_agg(r ORDER BY r.ordinal) FROM (SELECT ordinal,lead_id,disposition,reason,snapshot FROM gathering_results WHERE job_id=$1 AND org_id=$2 ORDER BY ordinal LIMIT $3 OFFSET $4) r),'[]'::jsonb) AS results`,'={{ [$json.job_id,$json.org_id,$json.limit,$json.offset] }}');response('Results Response','={{ {success:$json.found,results:$json.results} }}','={{ $json.found ? 200 : 404 }}');
edge('Results Webhook','Validate Results');edge('Validate Results','Invalid Results?');edge('Invalid Results?','Error Response');edge('Invalid Results?','Get Results',1);edge('Get Results','Results Response');
hook('Quality Webhook','gathering-source-quality','GET');js('Validate Quality',`const q=$input.first().json.query||{};const org=Number(q.org_id);if(!Number.isSafeInteger(org)||org<1)return {error:true,http_status:400,code:'INVALID_ORG'};return {org_id:org};`);iff('Invalid Quality?','={{ !!$json.error }}');
pg('Source Quality',`SELECT gathering_source_report($1) AS sources`,'={{ [$json.org_id] }}');response('Quality Response','={{ {success:true,window_days:30,sources:$json.sources} }}',200);edge('Quality Webhook','Validate Quality');edge('Validate Quality','Invalid Quality?');edge('Invalid Quality?','Error Response');edge('Invalid Quality?','Source Quality',1);edge('Source Quality','Quality Response');
add('Check Stalled Jobs','scheduleTrigger',{rule:{interval:[{field:'minutes',minutesInterval:5}]}});
pg('Recover Stalled Jobs','SELECT gathering_recover_v3() AS result','={{ [] }}');edge('Check Stalled Jobs','Recover Stalled Jobs');save(1);

for(const [index,source,path] of [[2,'google_maps','scrape-google-maps'],[3,'yellow_pages','yellowpages-scraper'],[4,'facebook_pages','scrape-facebook-pages'],[5,'yelp','scrape-yelp']]){
 reset();hook('Webhook',path);
 js('Validate Job',`const b=$input.first().json.body||{}; if(!/^\\d+$/.test(String(b.job_id))||!/^\\d+$/.test(String(b.org_id))) return {valid:false}; return {valid:true,job_id:Number(b.job_id),org_id:Number(b.org_id)};`);iff('Valid Job?','={{ $json.valid }}');response('Invalid Job Response','={{ {received:false,message:"Valid job_id and org_id required"} }}',400);
 pg('Claim Job',`SELECT gathering_claim_v3($1,$2,'${source}',$3) AS result`,'={{ [$json.job_id,$json.org_id,String($execution.id)] }}');js('Unwrap Claim','return $input.first().json.result;');iff('Claimed?','={{ $json.claimed }}');response('Already Claimed','={{ {received:false,message:"Job missing, already claimed, or connection unavailable"} }}',409);
 response('Respond ACK','={{ {received:true,job_id:$json.id} }}',202);js('Prepare Actor',rt.prepareActor);
 iff('Saved Run?','={{ $json.apify_actor_run_id != null || $json.dataset_id != null }}');
 http('Start Apify Actor',{method:'POST',url:'=https://api.apify.com/v2/acts/{{ $json.actor_id }}/runs',sendHeaders:true,headerParameters:apifyHeaders(),sendQuery:true,queryParameters:{parameters:[{name:'timeout',value:'600'},{name:'maxTotalChargeUsd',value:'={{ $json.max_cost_usd }}'}]},sendBody:true,specifyBody:'json',jsonBody:'={{ $json.apify_input }}'},false);
 js('Parse Run',rt.parseStart);
 pg('Save Run',"UPDATE scraping_jobs SET apify_actor_run_id=$3,dataset_id=$4,heartbeat_at=now() WHERE id=$1 AND org_id=$2 AND status='running' AND execution_id=$5 RETURNING id",'={{ [$json.job_id,$json.org_id,$json.run_id,$json.dataset_id,String($execution.id)] }}');
 add('Wait Before Poll','wait',{amount:15,unit:'seconds'});
 http('Check Actor Status',{url:"=https://api.apify.com/v2/actor-runs/{{ $('Parse Run').first(0).json.run_id }}",sendHeaders:true,headerParameters:apifyHeaders()});js('Parse Status',rt.parseStatus);iff('Terminal?','={{ $json.terminal }}');iff('Expired?','={{ $json.expired }}');
 pg('Heartbeat',"UPDATE scraping_jobs SET heartbeat_at=now() WHERE id=$1 AND org_id=$2 AND status='running' AND execution_id=$3 RETURNING id,cancel_requested",'={{ [$json.job_id,$json.org_id,String($execution.id)] }}');
 js('Current Worker State',"return {...$('Parse Status').first(0).json,...$input.first().json};");
 iff('Cancel Requested?','={{ $json.cancel_requested === true }}');
 http('Abort Expired Run',{method:'POST',url:"=https://api.apify.com/v2/actor-runs/{{ $('Parse Run').first(0).json.run_id }}/abort",sendHeaders:true,headerParameters:apifyHeaders()},false);
 http('Get Dataset',{url:"=https://api.apify.com/v2/datasets/{{ $('Parse Run').first(0).json.dataset_id }}/items",sendHeaders:true,headerParameters:apifyHeaders(),sendQuery:true,queryParameters:{parameters:[{name:'format',value:'json'},{name:'limit',value:"={{ ($('Prepare Actor').first(0).json.candidate_limit || $('Prepare Actor').first(0).json.max_results) + 100 }}"}]}});
 js('Transform Results',rt.transformResults);
 pg('Save Results and Complete','SELECT gathering_finish_v3($1,$2,$3::jsonb,$4,$5,$6::jsonb,$7,$8) AS result',"={{ [$json.job_id,$json.org_id,JSON.stringify($json.rows),$('Parse Status').first(0).json.actual_cost,$json.fetched,JSON.stringify($json.excluded),$('Parse Status').first(0).json.status,String($execution.id)] }}");
 js('Format Failure',rt.formatFailure);pg('Mark Failed','SELECT gathering_worker_failed($1,$2,$3,$4,$5) AS result','={{ [$json.job_id,$json.org_id,$json.code,$json.actual_cost,String($execution.id)] }}');
 for(const name of ['Start Apify Actor','Parse Run','Save Run','Check Actor Status','Parse Status','Heartbeat','Get Dataset','Transform Results','Save Results and Complete']){nodes.find(n=>n.name===name).onError='continueErrorOutput';edge(name,'Format Failure',1);}
 edge('Webhook','Validate Job');edge('Validate Job','Valid Job?');edge('Valid Job?','Claim Job');edge('Valid Job?','Invalid Job Response',1);edge('Claim Job','Unwrap Claim');edge('Unwrap Claim','Claimed?');edge('Claimed?','Respond ACK');edge('Claimed?','Already Claimed',1);edge('Respond ACK','Prepare Actor');edge('Prepare Actor','Saved Run?');edge('Saved Run?','Parse Run');edge('Saved Run?','Start Apify Actor',1);edge('Start Apify Actor','Parse Run');edge('Parse Run','Save Run');edge('Save Run','Wait Before Poll');edge('Wait Before Poll','Check Actor Status');edge('Check Actor Status','Parse Status');edge('Parse Status','Heartbeat');edge('Heartbeat','Current Worker State');edge('Current Worker State','Terminal?');edge('Terminal?','Get Dataset');edge('Terminal?','Expired?',1);edge('Expired?','Abort Expired Run');edge('Expired?','Cancel Requested?',1);edge('Cancel Requested?','Abort Expired Run');edge('Cancel Requested?','Wait Before Poll',1);edge('Abort Expired Run','Wait Before Poll');edge('Abort Expired Run','Format Failure',1);edge('Get Dataset','Transform Results');edge('Transform Results','Save Results and Complete');edge('Format Failure','Mark Failed');save(index);
}
console.log('Built requested lead-gathering workflows; originals retained under .local/gathering-before.');
